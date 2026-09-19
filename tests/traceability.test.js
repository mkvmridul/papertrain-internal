import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFacts, checkReport, annotate } from "../src/console/traceability.js";

const steps = [
  { type: "reasoning", reasoning: "I will call the delta tool." },
  {
    type: "tool_call",
    tool_id: "ledgerlens.break_delta",
    params: { disbursal_id: "DSB-20260916-00297" },
    results: [{ type: "query", data: { esql: "FROM x | WHERE amount == 999999", columns: [], values: [{ disbursal_id: "DSB-20260916-00297", ledger_inr: 51500.0, settled_inr: 0.0, delta_inr: 51500.0, delta_paise: 5150000, settlement_rows: 0, utrs: "NRTH2026091612345678", ledger_event_ids: ["EVT-20260916-000593", "EVT-20260916-000594"] }] } }],
  },
];
const facts = extractFacts(steps);

test("facts are collected from tool results but not from the echoed query text", () => {
  assert.ok(facts.numbers.has(51500));
  assert.ok(facts.numbers.has(0));
  assert.ok(!facts.numbers.has(999999), "query text must not count as evidence");
  assert.equal(facts.strings.get("EVT-20260916-000594"), "ledgerlens.break_delta");
  assert.ok(facts.strings.has("NRTH2026091612345678"));
});

test("a faithful report is fully traced, including Indian formatting and paise-to-rupee", () => {
  const report = "## DSB-20260916-00297 · MISSING_CREDIT\nLedger ₹51,500.00 · Settled ₹0.00 · Delta ₹ 51,500.00 · rows 0\n- `EVT-20260916-000593` UTR `NRTH2026091612345678`";
  const r = checkReport(report, facts);
  assert.equal(r.amounts.length, 3);
  assert.equal(r.ids.length, 3);
  assert.equal(r.untraced, 0);
  assert.ok(r.complete);
});

test("a fabricated or altered figure is caught", () => {
  const report = "Ledger ₹51,500.00 but the shortfall is ₹51,600.00 and case `CASE-2026-9999` applies.";
  const r = checkReport(report, facts);
  const bad = [...r.amounts, ...r.ids].filter((t) => !t.traced).map((t) => t.raw);
  assert.deepEqual(bad, ["₹51,600.00", "CASE-2026-9999"]);
  assert.ok(!r.complete);
});

test("sign placement is forgiven, digits are not", () => {
  const f = extractFacts([{ type: "tool_call", tool_id: "t", results: [{ type: "query", data: { values: [{ delta_inr: -326100.0 }] } }] }]);
  assert.ok(checkReport("Delta -₹3,26,100.00", f).complete);
  assert.ok(checkReport("Delta ₹-3,26,100.00", f).complete);
  assert.ok(!checkReport("Delta ₹3,26,100.50", f).complete);
});

test("annotate wraps tokens and escapes html", () => {
  const report = "Ledger ₹51,500.00 <b>x</b> `EVT-20260916-000593`";
  const html = annotate(report, checkReport(report, facts));
  assert.ok(html.includes('<mark class="traced" title="traced to ledgerlens.break_delta">₹51,500.00</mark>'));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});
