// LedgerLens ops console: a small Node server that serves the single-page console and proxies
// four things so the browser never holds an Elastic API key:
//   GET  /api/summary?business_date=   day totals + the break queue (two ES|QL queries)
//   POST /api/investigate              one Agent Builder conversation turn: "Investigate <id>"
//   POST /api/investigate/stream       the same turn over SSE, proxied verbatim from converse/async
//   POST /api/chat                     follow-up turn in the same conversation (approve / dismiss / questions)
//   POST /api/chat/stream              the same free-text turn over SSE, for the chat drawer
//                                      (free-text chat messages are first rewritten into a precise instruction, see refine.js)
//   POST /api/translate                Sarvam translate (optional; needs SARVAM_API_KEY)
//   POST /api/speak                    Sarvam text-to-speech for a chat reply (optional; needs SARVAM_API_KEY)
//   POST /api/transcribe               Sarvam speech-to-text for a spoken question, raw audio body (optional)
//   GET  /api/audit?disbursal_id=      audit records the workflows wrote after approval
//   GET  /api/break?disbursal_id=      break_delta + evidence_rows + trace_failure_point in parallel, so the page shows the ES|QL half before the model starts
//   POST /api/act                      run the action workflow for the break's type directly (CASE_MODE=direct fallback)
//   GET  /history, GET /api/h/*        the read-only history console (src/console/history-server.js), served from this port
//
// AGENT_MODE=mock replaces the LLM with a template filled from the same ES|QL tools. It exists so the
// page can be developed and rehearsed without a model. The page shows a red MOCK banner in that mode.
// AGENT_MODE=local runs the agent loop here instead of in Agent Builder: Claude through the Anthropic Messages
// API (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_WORKSPACE_ID, ANTHROPIC_MODEL), the same instructions,
// the same ES|QL tools executed with esql(), the five workflows behind a server-side approval gate. It emits the
// same SSE events as converse/async, so the page does not know the difference.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { es, esql, kbn, KIBANA_URL } from "../es.js";
import { ACTIONS, actionFor, inputsFor } from "../actions.js";
import { refineQuestion, anthropicCaller } from "./refine.js";
import { handleHistory } from "./history-server.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = Number(process.env.PORT || 3000);
const AGENT_ID = process.env.AGENT_ID || "ledgerlens";
const AGENT_MODE = ["mock", "local"].includes(process.env.AGENT_MODE) ? process.env.AGENT_MODE : "live";
const CASE_MODE = process.env.CASE_MODE === "direct" ? "direct" : "workflow";
const LLM_PROVIDER = process.env.LLM_PROVIDER === "elastic" ? "elastic" : "auto";
const BEDROCK_INFERENCE_ID = "amazonbedrock-chat_completion-enyonsmfhsb";

// Which model answers: an explicit LLM_INFERENCE_ID / LLM_CONNECTOR_ID wins; otherwise, unless LLM_PROVIDER=elastic
// forces the project's Elastic Managed LLM (the escape hatch when Bedrock is misbehaving), the Bedrock inference
// endpoint that setup:agent creates when AWS credentials are present; otherwise the project's default LLM.
let llm = process.env.LLM_INFERENCE_ID ? { inference_id: process.env.LLM_INFERENCE_ID } : process.env.LLM_CONNECTOR_ID ? { connector_id: process.env.LLM_CONNECTOR_ID } : {};
async function detectBedrock() {
  if (Object.keys(llm).length) return;
  if (LLM_PROVIDER === "elastic") return;
  try {
    await es("GET", `/_inference/chat_completion/${BEDROCK_INFERENCE_ID}`);
    llm = { inference_id: BEDROCK_INFERENCE_ID };
  } catch {
    /* not created: the project's default model is used */
  }
}
const llmLabel = () => AGENT_MODE === "local" ? `${ANTHROPIC.model} (Anthropic API at ${new URL(ANTHROPIC.url).host})` : llm.inference_id ? `${llm.inference_id} (Amazon Bedrock)` : llm.connector_id ? `connector ${llm.connector_id}${llm.connector_id.startsWith(".") ? " (Elastic Managed LLM)" : ""}` : "project default (Elastic Managed LLM)";

const tools = JSON.parse(readFileSync(join(ROOT, "elastic", "tools", "tools.json"), "utf8"));
const queryOf = (id) => readFileSync(join(ROOT, "elastic", "tools", tools.find((t) => t.id === id).query_file), "utf8");

// ---------------------------------------------------------------- data

async function summary(business_date) {
  // Independent queries against the same index: no reason to wait for one before starting the other.
  const [totals, breaks] = await Promise.all([
    esql(
      `FROM ledgerlens-recon
       | WHERE source == "ledger" AND event_type == "DISBURSAL_SUCCEEDED" AND business_date == ?business_date
       | STATS disbursals = COUNT(*), total_paise = SUM(amount_paise), partners = COUNT_DISTINCT(partner)`,
      { business_date },
    ),
    esql(queryOf("ledgerlens.list_breaks"), { business_date }),
  ]);
  const t = totals.rows[0] ?? { disbursals: 0, total_paise: 0, partners: 0 };
  return {
    business_date,
    disbursals: t.disbursals,
    total_inr: t.total_paise / 100,
    partners: t.partners,
    breaks: breaks.rows,
    took_ms: { totals: totals.took, breaks: breaks.took },
  };
}

async function auditFor(disbursal_id) {
  const { rows } = await esql(
    `FROM ledgerlens-audit | WHERE disbursal_id == ?disbursal_id | SORT @timestamp DESC | LIMIT 5`,
    { disbursal_id },
  );
  return rows;
}

// ---------------------------------------------------------------- agent

async function converse(input, conversation_id) {
  const body = { agent_id: AGENT_ID, input, ...llm };
  if (conversation_id) body.conversation_id = conversation_id;
  const t0 = Date.now();
  const r = await kbn("POST", "/api/agent_builder/converse", body, { timeoutMs: 300_000 });
  return {
    mode: "live",
    conversation_id: r.conversation_id,
    trace_id: r.trace_id,
    steps: r.steps ?? [],
    message: r.response?.message ?? "",
    elapsed_ms: Date.now() - t0,
  };
}

/**
 * Same turn as converse(), over Server-Sent Events. Returns the upstream body so the caller can
 * pipe it to the browser unchanged: re-parsing it here would only risk mangling the framing.
 * The stream is padded with ":" comment lines to defeat proxy buffering; an SSE reader ignores them.
 */
async function converseStream(input, conversation_id) {
  const body = { agent_id: AGENT_ID, input, ...llm };
  if (conversation_id) body.conversation_id = conversation_id;
  const res = await fetch(`${KIBANA_URL()}/api/agent_builder/converse/async`, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${process.env.KIBANA_API_KEY || process.env.ES_API_KEY}`,
      "Content-Type": "application/json",
      "kbn-xsrf": "true",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`converse/async -> ${res.status} ${text.slice(0, 300)}`), { status: res.status });
  }
  return res.body;
}

// ---------------------------------------------------------------- workflow (direct fallback)

async function runWorkflow(workflowId, inputs) {
  const run = await kbn("POST", `/api/workflows/workflow/${workflowId}/run`, { inputs });
  const id = run.workflowExecutionId;
  let exec;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    exec = await kbn("GET", `/api/workflows/executions/${id}`);
    if (exec.status && !/running|pending|waiting/i.test(exec.status)) break;
  }
  return { execution_id: id, status: exec?.status, error: exec?.error?.message ?? null };
}

// ---------------------------------------------------------------- mock agent (development only)

const inr = (v) => "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

async function mockConverse(input, conversation_id) {
  const t0 = Date.now();
  const steps = [];
  const call = async (tool_id, params) => {
    const r = await esql(queryOf(tool_id), params);
    steps.push({ type: "tool_call", tool_call_id: `mock-${steps.length}`, tool_id, params, results: [{ type: "query", data: { columns: r.columns, values: r.rows } }] });
    return r.rows;
  };
  const id = input.match(/DSB-\d{8}-\d{5}/)?.[0];
  if (/approve/i.test(input) && conversation_id) {
    const [, disbursal_id] = conversation_id.split("|");
    const d = (await call("ledgerlens.break_delta", { disbursal_id }))[0];
    const action = actionFor(d.break_type);
    if (!action) return { mode: "mock", conversation_id, steps, message: `No action is defined for break_type ${d.break_type}.`, elapsed_ms: Date.now() - t0 };
    const wf = await runWorkflow(action.workflow_id, inputsFor(action, d, { report: `Mock report for ${disbursal_id}`, approved_by: "console-mock" }));
    steps.push({ type: "tool_call", tool_call_id: "mock-wf", tool_id: action.tool_id, params: { disbursal_id, break_type: d.break_type }, results: [{ type: "other", data: { execution: wf } }] });
    const audit = await auditFor(disbursal_id);
    const message = `${action.label} for \`${disbursal_id}\`. Workflow execution \`${wf.execution_id}\` finished with status ${wf.status}.` + (audit[0] ? ` Audit record ${audit[0].action}${audit[0].case_id ? `, Kibana case \`${audit[0].case_id}\`` : ""}, written at ${audit[0]["@timestamp"]}.` : "");
    return { mode: "mock", conversation_id, steps, message, elapsed_ms: Date.now() - t0 };
  }
  if (/dismiss/i.test(input)) return { mode: "mock", conversation_id, steps, message: "Dismissed. No action taken.", elapsed_ms: Date.now() - t0 };
  if (!id) return { mode: "mock", conversation_id, steps, message: "Mock agent: name a disbursal id (DSB-YYYYMMDD-NNNNN).", elapsed_ms: Date.now() - t0 };

  const d = (await call("ledgerlens.break_delta", { disbursal_id: id }))[0];
  const ev = await call("ledgerlens.evidence_rows", { disbursal_id: id });
  const tr = await call("ledgerlens.trace_failure_point", { disbursal_id: id });
  const failed = tr.filter((r) => r["event.outcome"] === "failure");
  const sim = await call("ledgerlens.similar_cases", { query: `${d.break_type} ${d.partner} ${d.rail} ${failed.map((f) => f["error.type"]).join(" ")}` });
  const prec = sim.find((s) => s.break_type === d.break_type);
  const action = actionFor(d.break_type);
  const lines = [
    `## ${d.disbursal_id} · ${d.break_type}`,
    `**Rule fired:** \`${d.rule_fired}\``,
    `**Figures** (from ledgerlens.break_delta): Ledger ${inr(d.ledger_inr)} · Settled ${inr(d.settled_inr)} · Delta ${inr(d.delta_inr)} · Settlement rows ${d.settlement_rows} · Fee charged ${inr(d.charged_fee_inr)} vs contracted ${inr(d.expected_fee_inr)}`,
    `**Evidence** (from ledgerlens.evidence_rows):`,
    ...ev.map((r) => `- \`${r.event_id ?? r.row_id}\` ${r.event_type ?? r.status} ${inr(r.amount_inr)}${r.utr ? " UTR `" + r.utr + "`" : ""} ${r["@timestamp"]}`),
    `**Pipeline** (from ledgerlens.trace_failure_point): ` + (failed.length ? failed.map((f) => `failure at \`${f["span.name"]}\` → ${f["error.type"]}: ${f["error.message"]}`).join("; ") : `All ${tr.length} spans succeeded; no pipeline failure.`),
    `**Root cause:** [mock mode: the LLM would narrate the mechanism here from the evidence above]`,
    `**Precedent** (from ledgerlens.similar_cases): ` + (prec ? `\`${prec.case_id}\` (${prec.break_type}, resolved by ${prec.resolved_by} in ${prec.time_to_resolve_minutes} min): ${prec.resolution}` : "no precedent of the same type"),
    `**Recommended action:** ${action?.label ?? "None"}. ${prec?.resolution ?? "Escalate to a human reviewer."}`,
    `**Draft message:** [mock mode: the LLM would draft the ${action?.label.toLowerCase() ?? "message"} here, quoting only figures and IDs from the tool results]`,
    `**Confidence:** ${d.break_type === "UNRESOLVED" ? "Low" : "High"}`,
    d.break_type === "TIMING_T1" ? "No case is needed; the credit is present in the next day's file." : "",
    action ? `Reply **approve** to ${action.verb.replace("the partner", d.partner)}, or **dismiss**.` : "No action is defined for this break type.",
  ];
  return { mode: "mock", conversation_id: `mock|${d.disbursal_id}|${d.break_type}`, steps, message: lines.join("\n"), elapsed_ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- local agent (AGENT_MODE=local)

const ANTHROPIC = {
  key: process.env.ANTHROPIC_API_KEY,
  url: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, ""),
  workspace: process.env.ANTHROPIC_WORKSPACE_ID,
  model: process.env.ANTHROPIC_MODEL || "anthropic.claude-haiku-4-5",
};
const CHAT_MODE = ["mock", "local", "live"].includes(process.env.CHAT_MODE) ? process.env.CHAT_MODE : ANTHROPIC.key ? "local" : AGENT_MODE;
const chatLlmLabel = () => CHAT_MODE === "local" ? `${ANTHROPIC.model} (Anthropic API at ${new URL(ANTHROPIC.url).host})` : CHAT_MODE === "mock" ? "mock" : llmLabel();
if ((AGENT_MODE === "local" || CHAT_MODE === "local") && !ANTHROPIC.key) {
  console.error("AGENT_MODE=local needs ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL for Bedrock). Run: source api_key.md && AGENT_MODE=local npm run console");
  process.exit(1);
}

// Chat messages are rewritten into a precise instruction before they reach the agent (src/console/refine.js): the
// rewriter gets the console's business date, the selected disbursal and the tool list. Needs the Anthropic key;
// without it, or in mock mode, messages pass through unchanged. Approvals and dismissals are never rewritten.
const refineCall = ANTHROPIC.key && CHAT_MODE !== "mock" ? anthropicCaller(ANTHROPIC) : null;
async function refineChat(body) {
  const ctx = {
    business_date: /^\d{4}-\d{2}-\d{2}$/.test(body.business_date ?? "") ? body.business_date : process.env.DEMO_BUSINESS_DATE || "2026-09-16",
    active_disbursal: /^DSB-\d{8}-\d{5}$/.test(body.active_disbursal ?? "") ? body.active_disbursal : null,
  };
  const t0 = Date.now();
  const r = await refineQuestion(body.input, ctx, tools, refineCall);
  r.ms = Date.now() - t0;
  if (r.changed) console.log(`refine ${r.ms} ms: ${JSON.stringify(r.original)} -> ${JSON.stringify(r.input)}`);
  else if (r.reason) console.log(`refine skipped (${r.ms} ms): ${r.reason}`);
  return r;
}
/** SSE helper: emit the refinement event first, then the agent's own events. */
async function* prepend(head, gen) {
  for (const e of head) yield e;
  yield* gen;
}

// Anthropic tool names cannot contain dots, so ledgerlens.break_delta travels as ledgerlens__break_delta and back.
const apiName = (tool_id) => tool_id.replace(/\./g, "__");
const toolIdOf = (name) => name.replace(/__/g, ".");
const APPROVAL_RE = /\b(approve|approved|yes|go ahead|do it|confirm|proceed)\b/i;

const localTools = [
  ...tools.map((t) => ({
    name: apiName(t.id),
    description: t.description,
    input_schema: { type: "object", properties: Object.fromEntries(Object.entries(t.params).map(([k, p]) => [k, { type: "string", description: p.description }])), required: Object.keys(t.params) },
  })),
  ...ACTIONS.map((a) => ({
    name: apiName(a.tool_id),
    description: a.description,
    input_schema: { type: "object", properties: { disbursal_id: { type: "string" }, message: { type: "string", description: "The Draft message text, unchanged" }, report: { type: "string", description: "The full report text" } }, required: ["disbursal_id", "message"] },
  })),
];
const LOCAL_SYSTEM =
  readFileSync(join(ROOT, "elastic", "agent", "instructions.md"), "utf8") +
  "\n\n# Tool names in this environment\nWrite `__` where the text above writes `.`: call `ledgerlens__break_delta` for `ledgerlens.break_delta`, and so on. The five action tools take only disbursal_id, message (your Draft message, unchanged) and report (your full report); the server fills the workflow inputs from ledgerlens.break_delta itself.";

/** In-memory conversations: id -> Anthropic messages. Lost on restart, which is fine for a console. */
const conversations = new Map();

async function claude(messages) {
  const res = await fetch(`${ANTHROPIC.url}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC.key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(ANTHROPIC.workspace ? { "anthropic-workspace-id": ANTHROPIC.workspace } : {}) },
    body: JSON.stringify({ model: ANTHROPIC.model, max_tokens: 4096, system: LOCAL_SYSTEM, tools: localTools, messages }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${ANTHROPIC.model} -> ${res.status} ${JSON.stringify(j).slice(0, 300)}`), { status: 502 });
  return j;
}

/** An action tool call. The approval gate and the break-type match are enforced here, not left to the model. */
async function runAction(tool_id, input, approved) {
  const action = ACTIONS.find((a) => a.tool_id === tool_id);
  if (!approved) return { refused: "The user has not approved in this turn. Ask for approval and stop." };
  const d = (await esql(queryOf("ledgerlens.break_delta"), { disbursal_id: input.disbursal_id })).rows[0];
  if (!d) return { refused: `no break_delta row for ${input.disbursal_id}` };
  if (d.break_type !== action.break_type) return { refused: `${tool_id} is the action for ${action.break_type}; this break is ${d.break_type}.` };
  const execution = await runWorkflow(action.workflow_id, inputsFor(action, d, { report: input.report || "", message: input.message || "", approved_by: "ops-analyst" }));
  return { action: action.label, execution, audit: await auditFor(input.disbursal_id) };
}

/**
 * One turn of the local agent loop. Yields [event, data] pairs shaped like Agent Builder's converse/async events
 * (conversation_id_set, tool_call, tool_result, message_chunk, round_complete), so the page needs no new code.
 * Tools the model calls in the same response run in parallel, as the instructions ask for evidence_rows and trace_failure_point.
 */
async function* localConverse(input, conversation_id, seed) {
  const id = conversation_id && conversations.has(conversation_id) ? conversation_id : `local-${randomUUID()}`;
  if (!conversations.has(id)) conversations.set(id, seed?.input && seed?.message ? [{ role: "user", content: String(seed.input) }, { role: "assistant", content: String(seed.message) }] : []);
  const messages = conversations.get(id);
  messages.push({ role: "user", content: input });
  yield ["conversation_id_set", { conversation_id: id }];
  const approved = APPROVAL_RE.test(input);
  const t0 = Date.now();
  const steps = [];
  let text = "", first = null;
  for (let round = 0; round < 8; round++) {
    const r = await claude(messages);
    first ??= Date.now() - t0;
    messages.push({ role: "assistant", content: r.content });
    text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    const calls = r.content.filter((c) => c.type === "tool_use").map((u) => ({ u, tool_id: toolIdOf(u.name) }));
    if (!calls.length) break;
    if (text) yield ["message_chunk", { message_id: `m${round}`, text_chunk: text }];
    for (const c of calls) yield ["tool_call", { tool_call_id: c.u.id, tool_id: c.tool_id, params: c.u.input }];
    const payloads = await Promise.all(calls.map(async (c) => {
      try {
        if (ACTIONS.some((a) => a.tool_id === c.tool_id)) return [{ type: "other", data: await runAction(c.tool_id, c.u.input, approved) }];
        const def = tools.find((t) => t.id === c.tool_id);
        if (!def) return [{ type: "error", data: { error: `unknown tool ${c.tool_id}` } }];
        const params = Object.fromEntries(Object.entries(c.u.input).filter(([k]) => k in def.params));
        const q = await esql(queryOf(c.tool_id), params);
        return [{ type: "query", data: { columns: q.columns, values: q.rows } }];
      } catch (e) {
        return [{ type: "error", data: { error: e.message } }];
      }
    }));
    const results = [];
    calls.forEach((c, i) => {
      steps.push({ type: "tool_call", tool_call_id: c.u.id, tool_id: c.tool_id, params: c.u.input, results: payloads[i] });
      results.push({ type: "tool_result", tool_use_id: c.u.id, content: JSON.stringify(payloads[i][0].data).slice(0, 60_000), ...(payloads[i][0].type === "error" ? { is_error: true } : {}) });
    });
    for (const st of steps.slice(-calls.length)) yield ["tool_result", { tool_call_id: st.tool_call_id, tool_id: st.tool_id, results: st.results }];
    messages.push({ role: "user", content: results });
  }
  yield ["thinking_complete", { time_to_first_token: first }];
  yield ["message_chunk", { message_id: "final", text_chunk: text }];
  yield ["round_complete", { round: { steps, response: { message: text } } }];
}

/** Blocking shape, same as converse(). */
async function collectLocal(gen) {
  const t0 = Date.now();
  const out = { mode: "local", conversation_id: null, steps: [], message: "" };
  for await (const [event, data] of gen) {
    if (event === "conversation_id_set") out.conversation_id = data.conversation_id;
    if (event === "round_complete") { out.steps = data.round.steps; out.message = data.round.response.message; }
  }
  return { ...out, elapsed_ms: Date.now() - t0 };
}

/** SSE shape, same framing as converse/async: `event:` line, `data:` line with the payload under `data`. */
async function pipeLocal(res, gen) {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  try {
    for await (const [event, data] of gen) res.write(`event: ${event}\ndata: ${JSON.stringify({ data })}\n\n`);
  } catch (e) {
    console.error(`local agent -> ${e.message}`);
    res.write(`event: error\ndata: ${JSON.stringify({ error: { message: e.message } })}\n\n`);
  }
  res.end();
}

// ---------------------------------------------------------------- sarvam

async function translate(text, target_language_code) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw Object.assign(new Error("SARVAM_API_KEY not set"), { status: 400 });
  const blocks = text.split(/\n\n+/);
  const out = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const res = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ input: block.slice(0, 1900), source_language_code: "en-IN", target_language_code, model: "sarvam-translate:v1", mode: "formal", numerals_format: "international" }),
    });
    const j = await res.json();
    if (!res.ok) throw Object.assign(new Error(`Sarvam ${res.status}: ${JSON.stringify(j).slice(0, 300)}`), { status: 502 });
    out.push(j.translated_text);
  }
  return out.join("\n\n");
}

// ---------------------------------------------------------------- sarvam voice (optional)

const sarvamKey = () => {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw Object.assign(new Error("SARVAM_API_KEY not set"), { status: 400 });
  return key;
};

/** Text to speech with Sarvam bulbul:v3. Markdown is stripped, the text capped at 1500 characters, one wav clip returned as base64. */
async function speak(text, target_language_code) {
  const plain = String(text).replace(/```[\s\S]*?```/g, " ").replace(/[`*#_>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1500);
  const lang = target_language_code || (/[\u0900-\u097F]/.test(plain) ? "hi-IN" : /[\u0C80-\u0CFF]/.test(plain) ? "kn-IN" : "en-IN");
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": sarvamKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: plain, target_language_code: lang, model: "bulbul:v3" }),
  });
  const j = await res.json();
  if (!res.ok) throw Object.assign(new Error(`Sarvam TTS ${res.status}: ${JSON.stringify(j).slice(0, 300)}`), { status: 502 });
  return { audio: j.audios?.[0] ?? "", mime: "audio/wav", language: lang, spoken_chars: plain.length };
}

/** Speech to text with Sarvam saarika:v2.5. The browser posts its recording as the raw request body. */
async function transcribe(buffer, mime) {
  const form = new FormData();
  form.append("model", "saarika:v2.5");
  form.append("language_code", "unknown");
  form.append("file", new Blob([buffer], { type: mime }), mime.includes("wav") ? "audio.wav" : "audio.webm");
  const res = await fetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": sarvamKey() }, body: form });
  const j = await res.json();
  if (!res.ok) throw Object.assign(new Error(`Sarvam STT ${res.status}: ${JSON.stringify(j).slice(0, 300)}`), { status: 502 });
  return { transcript: j.transcript ?? "", language_code: j.language_code ?? null };
}

// ---------------------------------------------------------------- http

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type + (type.startsWith("text") || type.includes("javascript") ? "; charset=utf-8" : ""), "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readRaw = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
const readJson = (req) =>
  new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, readFileSync(join(HERE, "index.html"), "utf8"), "text/html");
    if (req.method === "GET" && url.pathname === "/traceability.js") return send(res, 200, readFileSync(join(HERE, "traceability.js"), "utf8"), "text/javascript");
    if (req.method === "GET" && url.pathname === "/api/config") {
      return send(res, 200, {
        business_date: process.env.DEMO_BUSINESS_DATE || "2026-09-16",
        agent_id: AGENT_ID,
        agent_mode: AGENT_MODE,
        chat_mode: CHAT_MODE,
        chat_llm: chatLlmLabel(),
        case_mode: CASE_MODE,
        kibana_url: KIBANA_URL(),
        sarvam: Boolean(process.env.SARVAM_API_KEY),
        llm: llmLabel(),
        actions: ACTIONS.map(({ tool_id, break_type, label, verb, audit_action }) => ({ tool_id, break_type, label, verb, audit_action })),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/break") {
      const disbursal_id = url.searchParams.get("disbursal_id");
      if (!/^DSB-\d{8}-\d{5}$/.test(disbursal_id ?? "")) return send(res, 400, { error: "disbursal_id required" });
      // The three tools that take only the id, in parallel: the deterministic half of the investigation in one round trip.
      const [d, ev, tr] = await Promise.all(["ledgerlens.break_delta", "ledgerlens.evidence_rows", "ledgerlens.trace_failure_point"].map((id) => esql(queryOf(id), { disbursal_id })));
      return send(res, 200, { row: d.rows[0] ?? null, took: d.took, evidence: ev.rows, trace: tr.rows, took_ms: { break_delta: d.took, evidence_rows: ev.took, trace_failure_point: tr.took } });
    }
    if (req.method === "GET" && url.pathname === "/api/summary") return send(res, 200, await summary(url.searchParams.get("business_date") || process.env.DEMO_BUSINESS_DATE || "2026-09-16"));
    if (req.method === "GET" && url.pathname === "/api/audit") return send(res, 200, await auditFor(url.searchParams.get("disbursal_id")));
    if (req.method === "POST" && url.pathname === "/api/investigate") {
      const { disbursal_id } = await readJson(req);
      if (!/^DSB-\d{8}-\d{5}$/.test(disbursal_id ?? "")) return send(res, 400, { error: "disbursal_id required" });
      const input = `Investigate ${disbursal_id}.`;
      return send(res, 200, AGENT_MODE === "mock" ? await mockConverse(input) : AGENT_MODE === "local" ? await collectLocal(localConverse(input)) : await converse(input));
    }
    if (req.method === "POST" && url.pathname === "/api/investigate/stream") {
      const { disbursal_id } = await readJson(req);
      if (!/^DSB-\d{8}-\d{5}$/.test(disbursal_id ?? "")) return send(res, 400, { error: "disbursal_id required" });
      // Mock mode must never reach a model; the page falls back to /api/investigate.
      if (AGENT_MODE === "mock") return send(res, 409, { error: "mock mode does not stream" });
      if (AGENT_MODE === "local") return pipeLocal(res, localConverse(`Investigate ${disbursal_id}.`));
      const upstream = await converseStream(`Investigate ${disbursal_id}.`);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const node = Readable.fromWeb(upstream);
      node.on("error", () => res.destroy());
      return node.pipe(res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      const body = await readJson(req);
      const { conversation_id, seed } = body;
      if (!body.input) return send(res, 400, { error: "input required" });
      const refined = await refineChat(body);
      const input = refined.input;
      const out = CHAT_MODE === "mock" ? await mockConverse(input, conversation_id) : CHAT_MODE === "local" ? await collectLocal(localConverse(input, conversation_id, seed)) : await converse(input, conversation_id);
      return send(res, 200, refined.changed ? { ...out, original_input: refined.original, refined_input: refined.input, refine_ms: refined.ms } : out);
    }
    if (req.method === "POST" && url.pathname === "/api/chat/stream") {
      const body = await readJson(req);
      const { conversation_id, seed } = body;
      if (!body.input) return send(res, 400, { error: "input required" });
      // Mock mode must never reach a model; the page falls back to /api/chat.
      if (CHAT_MODE === "mock") return send(res, 409, { error: "mock mode does not stream" });
      const refined = await refineChat(body);
      const input = refined.input;
      // The page ignores events it does not know, so this one is safe to add in front of the agent's stream.
      const head = refined.changed ? [["input_refined", { original: refined.original, refined: refined.input, ms: refined.ms }]] : [];
      if (CHAT_MODE === "local") return pipeLocal(res, prepend(head, localConverse(input, conversation_id, seed)));
      const upstream = await converseStream(input, conversation_id);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      for (const [event, data] of head) res.write(`event: ${event}\ndata: ${JSON.stringify({ data })}\n\n`);
      const node = Readable.fromWeb(upstream);
      node.on("error", () => res.destroy());
      return node.pipe(res);
    }
    if (req.method === "POST" && url.pathname === "/api/act") {
      // Direct fallback: the console runs the workflow for the break's type itself. The figures still come
      // from ledgerlens.break_delta and the message from the report's Draft message section; nothing is computed here.
      const b = await readJson(req);
      if (!/^DSB-\d{8}-\d{5}$/.test(b.disbursal_id ?? "")) return send(res, 400, { error: "disbursal_id required" });
      const d = (await esql(queryOf("ledgerlens.break_delta"), { disbursal_id: b.disbursal_id })).rows[0];
      const action = d ? actionFor(d.break_type) : null;
      if (!action) return send(res, 400, { error: `no action is defined for break_type ${d?.break_type ?? "unknown"}` });
      const result = await runWorkflow(action.workflow_id, inputsFor(action, d, { report: b.report || "", message: b.message || "", approved_by: b.approved_by || "console" }));
      return send(res, 200, { action: action.tool_id, label: action.label, ...result, audit: await auditFor(b.disbursal_id) });
    }
    if (req.method === "POST" && url.pathname === "/api/translate") {
      const { text, target } = await readJson(req);
      return send(res, 200, { translated_text: await translate(text, target || "hi-IN") });
    }
    if (req.method === "POST" && url.pathname === "/api/speak") {
      const { text, target } = await readJson(req);
      if (!text) return send(res, 400, { error: "text required" });
      return send(res, 200, await speak(text, target));
    }
    if (req.method === "POST" && url.pathname === "/api/transcribe") {
      const buf = await readRaw(req);
      if (!buf.length) return send(res, 400, { error: "audio body required" });
      return send(res, 200, await transcribe(buf, String(req.headers["content-type"] || "audio/webm").split(";")[0]));
    }
    if (await handleHistory(req, res, url)) return;
    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(`${req.method} ${url.pathname} -> ${e.message}`);
    return send(res, e.status && e.status >= 400 && e.status < 600 ? e.status : 500, { error: e.message });
  }
});

detectBedrock().then(() =>
  server.listen(PORT, () => {
    console.log(`LedgerLens console  http://localhost:${PORT}`);
    console.log(`  history: http://localhost:${PORT}/history`);
    console.log(`  agent: ${AGENT_ID} (${AGENT_MODE}${AGENT_MODE === "mock" ? " - no LLM, template report" : AGENT_MODE === "local" ? " - agent loop in this process" : ""})  llm: ${llmLabel()}  chat: ${CHAT_MODE} (${chatLlmLabel()})  case mode: ${CASE_MODE}  sarvam: ${process.env.SARVAM_API_KEY ? "on" : "off"}`);
  }),
);
