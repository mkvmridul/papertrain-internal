// Create (or update) everything LedgerLens needs inside Kibana:
//   1. optional: an Amazon Bedrock chat_completion inference endpoint (when AWS credentials are set)
//   2. the five Elastic Workflows, one action per break type (elastic/workflows/*.yaml, listed in actions.json)
//   3. the ES|QL tools (elastic/tools/*.esql + tools.json) and the five workflow tools
//   4. the Agent Builder agent (elastic/agent/instructions.md)
//   5. a smoke test: execute one ES|QL tool through Agent Builder, no LLM involved
// Re-runnable. Existing objects are updated in place.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { es, kbn, KIBANA_URL } from "./es.js";
import { ACTIONS } from "./actions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_ID = process.env.AGENT_ID || "ledgerlens";
const TAGS = ["ledgerlens", "bfsi", "reconciliation"];

/** Strip the `//` comment lines so the tool holds only the query. */
const readQuery = (file) =>
  readFileSync(join(ROOT, "elastic", "tools", file), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n")
    .trim();

const exists = (e) => e.status === 409 || (e.status === 400 && /already exists|duplicate/i.test(JSON.stringify(e.body)));

// ---------------------------------------------------------------- 1. bedrock (optional)

async function ensureBedrock() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, BEDROCK_MODEL } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.log("1. Bedrock: AWS credentials not set, the agent will use the project's default LLM (Elastic Managed LLM)");
    return null;
  }
  const id = "ledgerlens-bedrock";
  try {
    await es("GET", `/_inference/chat_completion/${id}`);
    console.log(`1. Bedrock: inference endpoint ${id} already exists`);
  } catch (e) {
    if (e.status !== 404) throw e;
    await es("PUT", `/_inference/chat_completion/${id}`, {
      service: "amazonbedrock",
      service_settings: {
        access_key: AWS_ACCESS_KEY_ID,
        secret_key: AWS_SECRET_ACCESS_KEY,
        region: AWS_REGION || "us-east-1",
        provider: "anthropic",
        model: BEDROCK_MODEL || "anthropic.claude-sonnet-4-5-20250929-v1:0",
      },
    });
    console.log(`1. Bedrock: created inference endpoint ${id} (${BEDROCK_MODEL})`);
  }
  console.log(`   set LLM_INFERENCE_ID=${id} in .env so the console converses through Bedrock`);
  return id;
}

// ---------------------------------------------------------------- 2. workflows (one action per break type)

async function ensureWorkflow(workflowId) {
  const yaml = readFileSync(join(ROOT, "elastic", "workflows", `${workflowId}.yaml`), "utf8");
  let wf;
  try {
    wf = await kbn("POST", "/api/workflows/workflow", { id: workflowId, yaml });
    console.log(`2. Workflow: created ${wf.id} (valid=${wf.valid})`);
  } catch (e) {
    if (!exists(e)) throw e;
    wf = await kbn("PUT", `/api/workflows/workflow/${workflowId}`, { yaml, enabled: true });
    console.log(`2. Workflow: updated ${workflowId}`);
  }
  const check = await kbn("GET", `/api/workflows/workflow/${workflowId}`);
  if (check.valid === false) throw new Error(`workflow ${workflowId} YAML invalid: ${JSON.stringify(check.validationErrors ?? check).slice(0, 800)}`);
  return check.id ?? workflowId;
}

/** tool_id -> workflow id in Kibana, for every action in elastic/workflows/actions.json. */
async function ensureWorkflows() {
  const ids = new Map();
  for (const a of ACTIONS) ids.set(a.tool_id, await ensureWorkflow(a.workflow_id));
  return ids;
}

// ---------------------------------------------------------------- 3. tools

async function upsertTool(tool) {
  const { id, ...rest } = tool;
  try {
    await kbn("POST", "/api/agent_builder/tools", { id, ...rest });
    return "created";
  } catch (e) {
    if (!exists(e)) throw e;
    const { type, ...updatable } = rest; // id and type are immutable
    await kbn("PUT", `/api/agent_builder/tools/${id}`, updatable);
    return "updated";
  }
}

async function ensureTools(workflowIds) {
  const defs = JSON.parse(readFileSync(join(ROOT, "elastic", "tools", "tools.json"), "utf8"));
  const ids = [];
  for (const d of defs) {
    const tool = { id: d.id, type: "esql", description: d.description, tags: TAGS, configuration: { query: readQuery(d.query_file), params: d.params } };
    try {
      const r = await upsertTool(tool);
      console.log(`3. Tool: ${r} ${d.id} (esql)`);
    } catch (e) {
      if (!d.fallback) throw e;
      console.log(`3. Tool: ${d.id} esql rejected (${String(e.message).slice(0, 160)}), falling back to ${d.fallback.type}`);
      // A different type needs a fresh object: delete then create.
      try { await kbn("DELETE", `/api/agent_builder/tools/${d.id}`); } catch {}
      const r = await upsertTool({ id: d.id, type: d.fallback.type, description: d.description, tags: TAGS, configuration: d.fallback.configuration });
      console.log(`3. Tool: ${r} ${d.id} (${d.fallback.type})`);
    }
    ids.push(d.id);
  }
  // The actions: one Elastic Workflow per break type, each exposed as a tool. The agent may only call one after human approval.
  for (const a of ACTIONS) {
    const workflowId = workflowIds.get(a.tool_id);
    const tool = { id: a.tool_id, type: "workflow", description: a.description, tags: TAGS, configuration: { workflow_id: workflowId, wait_for_completion: true } };
    try {
      console.log(`3. Tool: ${await upsertTool(tool)} ${a.tool_id} (workflow -> ${workflowId})`);
    } catch (e) {
      delete tool.configuration.wait_for_completion;
      console.log(`3. Tool: ${await upsertTool(tool)} ${a.tool_id} (workflow -> ${workflowId}, without wait_for_completion)`);
    }
    ids.push(a.tool_id);
  }
  return ids;
}

// ---------------------------------------------------------------- 4. agent

async function ensureAgent(toolIds) {
  const instructions = readFileSync(join(ROOT, "elastic", "agent", "instructions.md"), "utf8");
  const body = {
    id: AGENT_ID,
    name: "LedgerLens",
    description: "Explainable reconciliation-break investigator for lending and payments operations. The model explains, ES|QL decides, and every number is traceable to a source event ID.",
    labels: TAGS,
    avatar_color: "#0B64C0",
    avatar_symbol: "LL",
    configuration: { instructions, tools: [{ tool_ids: toolIds }] },
  };
  try {
    await kbn("POST", "/api/agent_builder/agents", body);
    console.log(`4. Agent: created ${AGENT_ID} with ${toolIds.length} tools`);
  } catch (e) {
    if (!exists(e)) throw e;
    const { id, name, ...updatable } = body;
    await kbn("PUT", `/api/agent_builder/agents/${AGENT_ID}`, updatable);
    console.log(`4. Agent: updated ${AGENT_ID} with ${toolIds.length} tools`);
  }
}

// ---------------------------------------------------------------- 5. smoke test

async function smoke() {
  const answer = JSON.parse(readFileSync(join(ROOT, "data", "answer-key.json"), "utf8"));
  const b = answer.breaks.find((x) => x.business_date === answer.demo_business_date);
  const res = await kbn("POST", "/api/agent_builder/tools/_execute", { tool_id: "ledgerlens.break_delta", tool_params: { disbursal_id: b.disbursal_id } });
  const text = JSON.stringify(res);
  const okType = text.includes(b.break_type);
  console.log(`5. Smoke: Agent Builder executed ledgerlens.break_delta for ${b.disbursal_id} -> ${okType ? b.break_type + " (matches answer key)" : "UNEXPECTED: " + text.slice(0, 300)}`);
  if (!okType) throw new Error("smoke test failed");
}

export async function setupAgent() {
  const inferenceId = await ensureBedrock();
  const workflowIds = await ensureWorkflows();
  const toolIds = await ensureTools(workflowIds);
  await ensureAgent(toolIds);
  await smoke();
  console.log(`\nOpen the agent in Kibana: ${KIBANA_URL()}/app/agent_builder`);
  console.log(`Then: npm run console  ->  http://localhost:${process.env.PORT || 3000}`);
  return { inferenceId, workflowIds: [...workflowIds.values()], toolIds };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  setupAgent().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
