import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, DEMO_DAY, RATE_CARD_PAISE } from "../src/generate.js";

const { recon, spans, resolved, answerKey } = generate();
const ledger = recon.filter((d) => d.source === "ledger");
const settlement = recon.filter((d) => d.source === "settlement");
const succeeded = ledger.filter((d) => d.event_type === "DISBURSAL_SUCCEEDED");

test("generator is deterministic", () => {
  const again = generate();
  assert.equal(JSON.stringify(again.recon), JSON.stringify(recon));
  assert.equal(JSON.stringify(again.spans), JSON.stringify(spans));
  assert.deepEqual(again.answerKey.breaks, answerKey.breaks);
});

test("every settlement row points at a disbursal that has a ledger success", () => {
  const ok = new Set(succeeded.map((d) => d.disbursal_id));
  for (const r of settlement) assert.ok(ok.has(r.disbursal_id), `${r.row_id} orphan`);
});

test("every id is unique", () => {
  const ids = [...ledger.map((d) => d.event_id), ...settlement.map((d) => d.row_id), ...spans.map((s) => s.span.id), ...resolved.map((c) => c.case_id)];
  assert.equal(new Set(ids).size, ids.length);
});

test("amounts are integer paise and fees follow the rate card unless the break says otherwise", () => {
  for (const d of recon) {
    assert.ok(Number.isInteger(d.amount_paise) && d.amount_paise > 0, `${d.event_id ?? d.row_id} amount`);
    if (d.source === "ledger") assert.equal(d.expected_fee_paise, RATE_CARD_PAISE[d.rail]);
  }
  const feeBreaks = new Set(answerKey.breaks.filter((b) => b.break_type === "FEE_MISMATCH").map((b) => b.disbursal_id));
  for (const r of settlement) if (!feeBreaks.has(r.disbursal_id)) assert.equal(r.fee_paise, RATE_CARD_PAISE[r.rail], r.row_id);
});

test("a JS reference implementation of the ES|QL rules agrees with the answer key and flags nothing else", () => {
  const byId = new Map();
  for (const d of succeeded) byId.set(d.disbursal_id, { ledger: d.amount_paise, fee: d.expected_fee_paise, date: d.business_date, rows: [] });
  for (const r of settlement) byId.get(r.disbursal_id).rows.push(r);
  const flagged = new Map();
  for (const [id, g] of byId) {
    const settled = g.rows.reduce((s, r) => s + r.amount_paise, 0);
    const charged = g.rows.reduce((s, r) => s + r.fee_paise, 0);
    const delta = g.ledger - settled;
    const feeDelta = charged - g.fee;
    const valueDate = g.rows.length === 1 ? g.rows[0].value_date : null;
    const type =
      g.rows.length === 0 ? "MISSING_CREDIT"
      : g.rows.length > 1 ? "DOUBLE_DEBIT"
      : delta === 0 && feeDelta !== 0 ? "FEE_MISMATCH"
      : delta === 0 && feeDelta === 0 && valueDate > g.date ? "TIMING_T1"
      : delta === 0 && feeDelta === 0 && valueDate === g.date ? "MATCHED"
      : "UNRESOLVED";
    if (type !== "MATCHED") flagged.set(id, type);
  }
  assert.equal(flagged.size, answerKey.breaks.length);
  for (const b of answerKey.breaks) assert.equal(flagged.get(b.disbursal_id), b.break_type, b.disbursal_id);
});

test("demo day carries the full break catalogue and one honest unresolved case", () => {
  const types = answerKey.breaks.filter((b) => b.business_date === DEMO_DAY).map((b) => b.break_type);
  for (const t of ["MISSING_CREDIT", "DOUBLE_DEBIT", "FEE_MISMATCH", "TIMING_T1", "UNRESOLVED"]) assert.ok(types.includes(t), t);
  assert.equal(types.filter((t) => t === "UNRESOLVED").length, 1);
});

test("every break has a trace, and the seeded failure spans exist with event.outcome=failure", () => {
  for (const b of answerKey.breaks) {
    const mine = spans.filter((s) => s.labels.disbursal_id === b.disbursal_id);
    assert.ok(mine.length >= 5, b.disbursal_id);
    const failed = mine.filter((s) => s.event.outcome === "failure").map((s) => s.span.name).sort();
    assert.deepEqual(failed, [...b.failure_spans].sort(), b.disbursal_id);
  }
});

test("failed disbursals never produce a settlement row", () => {
  const failedIds = new Set(ledger.filter((d) => d.event_type === "DISBURSAL_FAILED").map((d) => d.disbursal_id));
  assert.ok(failedIds.size > 0);
  for (const r of settlement) assert.ok(!failedIds.has(r.disbursal_id));
});

test("resolved library covers every break type and includes the prior-day breaks by real id", () => {
  const types = new Set(resolved.map((c) => c.break_type));
  for (const t of ["MISSING_CREDIT", "DOUBLE_DEBIT", "FEE_MISMATCH", "TIMING_T1", "UNRESOLVED"]) assert.ok(types.has(t), t);
  for (const b of answerKey.breaks.filter((b) => b.business_date !== DEMO_DAY)) assert.ok(resolved.some((c) => c.disbursal_id === b.disbursal_id), b.disbursal_id);
});
