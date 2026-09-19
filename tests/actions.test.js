import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ACTIONS, actionFor, inputsFor, draftFrom } from "../src/actions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WF = join(ROOT, "elastic", "workflows");
const yamlOf = (a) => readFileSync(join(WF, `${a.workflow_id}.yaml`), "utf8");
const BREAK_TYPES = ["MISSING_CREDIT", "DOUBLE_DEBIT", "FEE_MISMATCH", "TIMING_T1", "UNRESOLVED"];

/** Declared inputs of a workflow: the `- name:` entries under `inputs:`, and which are required. */
function declaredInputs(yaml) {
  const block = yaml.split(/^inputs:\s*$/m)[1].split(/^(?:consts|outputs|steps):\s*$/m)[0];
  const names = [...block.matchAll(/^\s+- name: (\w+)\s*$/gm)].map((m) => m[1]);
  const required = [...block.matchAll(/^\s+- name: (\w+)\s*\n\s+type: \w+\s*\n\s+required: true/gm)].map((m) => m[1]);
  return { names, required };
}

/** Keys the write_audit step writes: the lines under `body:` up to the next step. */
function auditBodyKeys(yaml) {
  const after = yaml.slice(yaml.indexOf("- name: write_audit"));
  const body = after.split(/^\s+body:\s*$/m)[1].split(/^\s+- name: /m)[0];
  return [...body.matchAll(/^\s+"?([@\w]+)"?:\s/gm)].map((m) => m[1]);
}

test("exactly one action per break type; ids unique; each workflow file exists, is named after its id and writes its audit action", () => {
  assert.deepEqual(ACTIONS.map((a) => a.break_type).sort(), [...BREAK_TYPES].sort());
  assert.equal(new Set(ACTIONS.map((a) => a.tool_id)).size, ACTIONS.length);
  assert.equal(new Set(ACTIONS.map((a) => a.workflow_id)).size, ACTIONS.length);
  for (const a of ACTIONS) {
    assert.ok(existsSync(join(WF, `${a.workflow_id}.yaml`)), a.workflow_id);
    assert.match(yamlOf(a), new RegExp(`^name: ${a.workflow_id}$`, "m"));
    assert.match(yamlOf(a), new RegExp(`^\\s+action: ${a.audit_action}$`, "m"));
  }
  assert.equal(actionFor("MATCHED"), null);
});

test("every audit field a workflow writes is in the strict audit mapping", () => {
  const mapping = JSON.parse(readFileSync(join(ROOT, "elastic", "mappings", "ledgerlens-audit.json"), "utf8"));
  assert.equal(mapping.mappings.dynamic, "strict");
  const fields = new Set(Object.keys(mapping.mappings.properties));
  for (const a of ACTIONS) {
    const keys = auditBodyKeys(yamlOf(a));
    assert.ok(keys.includes("action") && keys.includes("disbursal_id") && keys.includes("execution_id"), a.workflow_id);
    for (const k of keys) assert.ok(fields.has(k), `${a.workflow_id} writes unmapped field ${k}`);
  }
});

test("direct-mode inputs use only declared inputs, fill every required one, and carry the report's draft", () => {
  const row = {
    disbursal_id: "DSB-20260916-00297", partner: "NORTHBANK", rail: "IMPS", delta_inr: 51500.0,
    charged_fee_inr: 0.0, expected_fee_inr: 5.9, fee_delta_inr: -5.9, value_date: "2026-09-16",
    utrs: ["NRTH2026091612345678", "NRTH2026091687654321"], settlement_row_ids: "STL-20260916-NRTH-0001",
  };
  const report = "## x\n**Recommended action:** Raise reversal with partner.\n**Draft message:** Please reverse `NRTH2026091687654321`.\n**Confidence:** High";
  for (const a of ACTIONS) {
    const inputs = inputsFor(a, { ...row, break_type: a.break_type }, { report, approved_by: "test" });
    const { names, required } = declaredInputs(yamlOf(a));
    for (const k of Object.keys(inputs)) assert.ok(names.includes(k), `${a.workflow_id}: input ${k} is not declared in the YAML`);
    for (const k of required) assert.ok(inputs[k] != null && inputs[k] !== "", `${a.workflow_id}: required input ${k} is missing`);
    if ("message" in inputs) assert.equal(inputs.message, "Please reverse `NRTH2026091687654321`.");
    assert.equal(inputs.report, report);
    assert.equal(inputs.break_type, a.break_type);
  }
});

test("draftFrom lifts the Draft message paragraph and nothing else", () => {
  const report = "**Recommended action:** Raise reversal with partner.\n**Draft message:** Dear PAYSTREAM ops, please reverse UTR `X`.\nSecond sentence.\n**Confidence:** High, ruled out timing.";
  assert.equal(draftFrom(report), "Dear PAYSTREAM ops, please reverse UTR `X`.\nSecond sentence.");
  assert.equal(draftFrom("**Draft message:** Last section, no trailer."), "Last section, no trailer.");
  assert.equal(draftFrom("no draft here"), "");
});

test("the agent instructions name every action tool, map every break type, and keep the approval gate", () => {
  const md = readFileSync(join(ROOT, "elastic", "agent", "instructions.md"), "utf8");
  for (const a of ACTIONS) {
    assert.ok(md.includes(`\`${a.tool_id}\``), `instructions do not mention ${a.tool_id}`);
    assert.ok(md.includes(a.break_type), `instructions do not mention ${a.break_type}`);
  }
  assert.match(md, /Writing a report is not approval/);
  assert.match(md, /\*\*Draft message:\*\*/);
});
