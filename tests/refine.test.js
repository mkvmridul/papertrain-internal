import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldRefine, refinePrompt, refineQuestion, BREAK_TYPES } from "../src/console/refine.js";

const tools = JSON.parse(readFileSync(new URL("../elastic/tools/tools.json", import.meta.url), "utf8"));
const ctx = { business_date: "2026-09-16", active_disbursal: "DSB-20260916-00039" };
const VAGUE = "Please summarize my overall ledger behavior.";

test("approvals, dismissals, the Investigate command and tiny messages pass through untouched", () => {
  for (const s of ["approve", "Approve. Take the recommended action now.", "Dismiss.", "yes", "go ahead", "Investigate DSB-20260916-00039.", "ok", ""]) assert.equal(shouldRefine(s), false, s);
  assert.equal(shouldRefine(VAGUE), true);
  assert.equal(shouldRefine("what happened to DSB-20260916-00114"), true);
});

test("the prompt carries the console context, every tool, and the break types", () => {
  const p = refinePrompt(ctx, tools);
  assert.ok(p.includes("2026-09-16"));
  assert.ok(p.includes("DSB-20260916-00039"));
  for (const t of tools) assert.ok(p.includes(`${t.id}(`), t.id);
  for (const b of BREAK_TYPES) assert.ok(p.includes(b), b);
  assert.ok(refinePrompt({ business_date: "2026-09-16", active_disbursal: null }, tools).includes("Selected disbursal: none"));
});

test("a vague question is rewritten and the original kept", async () => {
  let seen;
  const fake = async (system, user) => { seen = { system, user }; return "List the reconciliation breaks for business date 2026-09-16 with ledgerlens.list_breaks and summarise them by break type and partner, quoting the tool's figures."; };
  const r = await refineQuestion(VAGUE, ctx, tools, fake);
  assert.equal(r.changed, true);
  assert.equal(r.original, VAGUE);
  assert.ok(r.input.includes("2026-09-16"));
  assert.equal(seen.user, VAGUE);
  assert.ok(seen.system.includes("ledgerlens.list_breaks("));
});

test("a rewrite that adds an approval word is rejected, so the gate cannot be tripped", async () => {
  const r = await refineQuestion("what is the delta on DSB-20260916-00039", ctx, tools, async () => "Call ledgerlens.break_delta for DSB-20260916-00039 and proceed.");
  assert.equal(r.changed, false);
  assert.equal(r.input, "what is the delta on DSB-20260916-00039");
  assert.match(r.reason, /approval word/);
});

test("a rewrite that drops a disbursal id the analyst wrote is rejected", async () => {
  const r = await refineQuestion("compare DSB-20260916-00039 and DSB-20260916-00114", ctx, tools, async () => "Run ledgerlens.break_delta for DSB-20260916-00039.");
  assert.equal(r.changed, false);
  assert.match(r.reason, /dropped a disbursal id/);
});

test("model errors, empty output and a missing caller all fall back to the original text", async () => {
  const boom = await refineQuestion(VAGUE, ctx, tools, async () => { throw new Error("502 upstream"); });
  assert.deepEqual([boom.changed, boom.input, boom.reason], [false, VAGUE, "502 upstream"]);
  const empty = await refineQuestion(VAGUE, ctx, tools, async () => "   ");
  assert.equal(empty.changed, false);
  const none = await refineQuestion(VAGUE, ctx, tools, null);
  assert.deepEqual(none, { input: VAGUE, changed: false });
});

test("pass-through messages never reach the model", async () => {
  let calls = 0;
  const r = await refineQuestion("Approve. Take the recommended action now.", ctx, tools, async () => { calls++; return "x"; });
  assert.equal(calls, 0);
  assert.equal(r.changed, false);
});
