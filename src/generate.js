// LedgerLens synthetic data generator.
//
// Produces three NDJSON files plus an answer key, deterministically from a fixed seed:
//   data/recon.ndjson            ledger events + normalised PSP settlement rows  -> index ledgerlens-recon
//   data/traces.ndjson           disbursal-pipeline spans (ECS-shaped)            -> index ledgerlens-traces
//   data/resolved-breaks.ndjson  library of past, human-resolved breaks           -> index ledgerlens-resolved-breaks
//   data/answer-key.json         every seeded break and what the ES|QL tools must find
//
// No production or customer data is used or referenced. All institutions are fictional.
// See DATA.md for the full provenance statement and the break catalogue.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------- configuration

export const SEED = 20260916;
export const BUSINESS_DAYS = ["2026-09-14", "2026-09-15", "2026-09-16"];
export const DEMO_DAY = "2026-09-16";
const DISBURSALS_PER_DAY = 5000;
const FAILED_RATE = 0.02; // PSP rejected at initiation: never a break, must not be flagged

/** Fictional partners. code = 4-letter prefix used in UTRs. */
const PARTNERS = [
  { name: "PAYSTREAM", code: "PAYS", kind: "psp", rails: ["IMPS", "NEFT"] },
  { name: "NORTHBANK", code: "NRTH", kind: "bank", rails: ["IMPS", "NEFT", "RTGS"] },
  { name: "MERIDIAN", code: "MRDN", kind: "bank", rails: ["IMPS", "NEFT"] },
];

/**
 * Partner IFSC codes and bank short names for realistic bank-statement narrations.
 * Based on real Indian bank statement narration patterns (NEFT DR-{IFSC}-{NAME}-{BANK}-{REF}-{PURPOSE}).
 */
const PARTNER_META = {
  PAYSTREAM: { ifsc: "PAYS0001234", bank_short: "PAYSTRM",  code: "PAYS" },
  NORTHBANK: { ifsc: "NRTH0005678", bank_short: "NRTHBK",   code: "NRTH" },
  MERIDIAN:  { ifsc: "MRDN0009012", bank_short: "MERIDN",   code: "MRDN" },
};

/** Contracted fee per transfer, in paise, GST included (18% on base). */
export const RATE_CARD_PAISE = { IMPS: 590, NEFT: 295, RTGS: 2360 };
const RATE_CARD_BASE_PAISE = { IMPS: 500, NEFT: 250, RTGS: 2000 };

/**
 * Seeded breaks per business day. The demo day carries the full catalogue;
 * earlier days carry a few that already appear as resolved cases in the library.
 * variant drives the trace signature and the settlement-file anomaly.
 */
const BREAK_PLAN = {
  "2026-09-14": [
    { type: "DOUBLE_DEBIT", variant: "RETRY_WITHOUT_IDEMPOTENCY_KEY" },
    { type: "MISSING_CREDIT", variant: "BENEFICIARY_ACCOUNT_INVALID" },
  ],
  "2026-09-15": [
    { type: "TIMING_T1", variant: "AFTER_SETTLEMENT_CUTOFF" },
    { type: "FEE_MISMATCH", variant: "WRONG_RAIL_SLAB" },
  ],
  "2026-09-16": [
    { type: "MISSING_CREDIT", variant: "BENEFICIARY_ACCOUNT_INVALID" },
    { type: "MISSING_CREDIT", variant: "INSUFFICIENT_NODAL_BALANCE" },
    { type: "MISSING_CREDIT", variant: "BENEFICIARY_ACCOUNT_INVALID" },
    { type: "DOUBLE_DEBIT", variant: "RETRY_WITHOUT_IDEMPOTENCY_KEY" },
    { type: "DOUBLE_DEBIT", variant: "RETRY_WITHOUT_IDEMPOTENCY_KEY" },
    { type: "FEE_MISMATCH", variant: "WRONG_RAIL_SLAB" },
    { type: "FEE_MISMATCH", variant: "GST_APPLIED_TWICE" },
    { type: "TIMING_T1", variant: "AFTER_SETTLEMENT_CUTOFF" },
    { type: "TIMING_T1", variant: "AFTER_SETTLEMENT_CUTOFF" },
    { type: "UNRESOLVED", variant: "SHORT_CREDIT_NO_SIGNAL" },
  ],
};

// ---------------------------------------------------------------- deterministic RNG

/** mulberry32: small, fast, reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    digits: (n) => Array.from({ length: n }, () => String(Math.floor(next() * 10))).join(""),
    hex: (n) => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join(""),
  };
}

// ---------------------------------------------------------------- helpers

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Build a UTC ISO timestamp from an IST wall-clock time on a business date. */
function istToIso(dateStr, h, m, s, ms = 0) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, s, ms) - IST_OFFSET_MS).toISOString();
}
function addMs(iso, ms) {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}
function nextDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const compact = (dateStr) => dateStr.replaceAll("-", "");
const pad = (n, w) => String(n).padStart(w, "0");
export const inr = (paise) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Generate a realistic bank-statement narration for a settlement row.
 * Five format variants per rail reflect the varied styles seen in real PSP settlement files
 * and HDFC / ICICI / Kotak statement exports (e.g. "NEFT DR-UBIN0539686-RAJU DUBEY-NETBANK,MUM-N155180555427618-PERSONAL").
 * Uses rng so outputs are deterministic and varied across transactions.
 */
function makeNarration(rng, { rail, partner, utr, loan_id, disbursal_id, amount_paise }) {
  const meta = PARTNER_META[partner] ?? { ifsc: "UNKN0000000", bank_short: "UNKN", code: "UNKN" };
  const amt = (amount_paise / 100).toFixed(2);
  const formats = {
    IMPS: [
      () => `IMPS/P2A/${utr}/${loan_id}/LOAN DISB`,
      () => `IMPS P2A ${utr} LOAN DISBURSEMENT ${loan_id}`,
      () => `IMPS-P2A-${utr}-PERSONAL LOAN DISB-${disbursal_id}`,
      () => `IMPS CR ${utr} ${meta.bank_short} LOAN DISB INR ${amt}`,
      () => `${meta.code}IMPS${utr}LNDSB${loan_id.replace("LN-", "")}`,
    ],
    NEFT: [
      () => `NEFT DR-${meta.ifsc}-LOAN DISB-${meta.bank_short}-${utr}-PERSONAL LOAN`,
      () => `NEFT/OUTWARD/${utr}/${loan_id}/LOAN DISBURSEMENT`,
      () => `NEFT CR ${utr} LOAN DISB ${loan_id} ${meta.code}`,
      () => `NEFT-${utr}-PERSONAL LOAN DISBURSAL-${disbursal_id}`,
      () => `NEFT DR ${utr} INR ${amt} LOAN DISB ${loan_id}`,
    ],
    RTGS: [
      () => `RTGS/OUTWARD/${utr}/LOAN DISBURSEMENT/${loan_id}`,
      () => `RTGS CR ${utr} PERSONAL LOAN DISB ${loan_id}`,
      () => `RTGS-${utr}-LOAN DISBURSAL-${disbursal_id}`,
      () => `RTGS OUTWARD ${utr} INR ${amt} LOAN DISB`,
      () => `${meta.code} RTGS DISB ${utr} ${loan_id}`,
    ],
  };
  return rng.pick(formats[rail] || formats.NEFT)();
}

// ---------------------------------------------------------------- generator

export function generate() {
  const rng = makeRng(SEED);
  const recon = [];
  const spans = [];
  const answerBreaks = [];
  const counts = {};
  const settlementSeq = {}; // per settlement_date+partner running number

  const settlementRow = (fields) => {
    const key = fields.settlement_date + fields.partner;
    settlementSeq[key] = (settlementSeq[key] ?? 0) + 1;
    const partner = PARTNERS.find((p) => p.name === fields.partner);
    return {
      source: "settlement",
      row_id: `STL-${compact(fields.settlement_date)}-${partner.code}-${pad(settlementSeq[key], 4)}`,
      status: "SETTLED",
      ...fields,
    };
  };

  for (const day of BUSINESS_DAYS) {
    const plan = BREAK_PLAN[day] ?? [];
    let eventSeq = 0;
    const eventId = () => `EVT-${compact(day)}-${pad(++eventSeq, 6)}`;
    const dayCounts = { disbursals: 0, succeeded: 0, failed: 0, ledger_events: 0, settlement_rows: 0, spans: 0, breaks: plan.length };

    // Decide which sequence numbers carry seeded breaks. Spread them through the day.
    const breakSlots = new Map();
    const usable = Array.from({ length: DISBURSALS_PER_DAY }, (_, i) => i + 1).filter((i) => i > 5);
    for (const b of plan) {
      let slot;
      do slot = rng.pick(usable);
      while (breakSlots.has(slot));
      breakSlots.set(slot, b);
    }

    for (let i = 1; i <= DISBURSALS_PER_DAY; i++) {
      const brk = breakSlots.get(i) ?? null;
      const disbursal_id = `DSB-${compact(day)}-${pad(i, 5)}`;
      const loan_id = `LN-${rng.digits(8)}`;
      const customer_id = `CUST-${rng.digits(6)}`;
      const partner = rng.pick(PARTNERS);

      // Rail & Amount: rail-appropriate disbursals. IMPS ₹10k–₹5L, NEFT ₹5k–₹10L, RTGS ₹2L–₹50L.
      let rail = rng.pick(partner.rails);
      if (brk?.variant === "WRONG_RAIL_SLAB") rail = "NEFT"; // needs a NEFT transfer billed at IMPS slab
      if (brk?.variant === "GST_APPLIED_TWICE") rail = "IMPS";
      let amount_paise =
        rail === "RTGS"
          ? rng.int(2000, 50000) * 100 * 100
          : rail === "IMPS"
          ? rng.int(100, 5000) * 100 * 100
          : rng.int(50, 10000) * 100 * 100;
      if (brk?.variant === "SHORT_CREDIT_NO_SIGNAL") amount_paise = Math.max(amount_paise, 5_000_000);
      const expected_fee_paise = RATE_CARD_PAISE[rail];

      // Timing breaks are initiated after the PSP's 23:00 IST settlement cut-off.
      const isTiming = brk?.type === "TIMING_T1";
      const hour = isTiming ? 23 : rng.int(9, 22);
      const minute = isTiming ? rng.int(1, 29) : rng.int(0, 59);
      const t0 = istToIso(day, hour, minute, rng.int(0, 59), rng.int(0, 999));

      const isFailed = !brk && rng.chance(FAILED_RATE);
      const utr = `${partner.code}${compact(day)}${rng.digits(8)}`;
      const trace_id = `TRC-${rng.hex(12)}`;
      const spanId = () => `SPN-${rng.hex(16)}`;
      const base = { loan_id, disbursal_id, customer_id, partner: partner.name, rail, business_date: day };

      dayCounts.disbursals++;

      // ---- ledger: DISBURSAL_INITIATED (always)
      recon.push({
        source: "ledger",
        event_id: eventId(),
        event_type: "DISBURSAL_INITIATED",
        sequence: 1,
        "@timestamp": t0,
        amount_paise,
        expected_fee_paise,
        utr: null,
        description: `Disbursal of ${inr(amount_paise)} initiated for ${loan_id} via ${partner.name}/${rail}`,
        ...base,
      });

      // ---- trace skeleton
      const rootId = spanId();
      const pushSpan = (s) => {
        spans.push({
          "@timestamp": s.ts,
          trace: { id: trace_id },
          span: { id: s.id ?? spanId(), name: s.name, type: s.type },
          parent: s.parent === undefined ? { id: rootId } : s.parent,
          service: { name: s.service },
          duration_ms: s.duration_ms,
          event: { outcome: s.outcome ?? "success" },
          http: s.http ?? undefined,
          error: s.error ?? undefined,
          labels: { disbursal_id, partner: partner.name, rail, business_date: day, ...(s.labels ?? {}) },
        });
        dayCounts.spans++;
      };
      pushSpan({ id: rootId, parent: null, ts: t0, name: "POST /v1/disbursals", type: "request", service: "disbursal-service", duration_ms: rng.int(900, 2400), http: { request: { method: "POST" }, response: { status_code: 202 } } });
      pushSpan({ ts: addMs(t0, 12), name: "ledger.append DISBURSAL_INITIATED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });

      const transferStart = addMs(t0, 40);

      if (isFailed) {
        // PSP rejects synchronously. Ledger books FAILED. Correctly NOT a reconciliation break.
        dayCounts.failed++;
        pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: rng.int(200, 700), outcome: "failure", http: { request: { method: "POST" }, response: { status_code: 400 } }, error: { type: "PSP_REJECTED", message: "PSP rejected transfer: INVALID_IFSC" }, labels: { psp_status: "REJECTED", psp_reason: "INVALID_IFSC", retry_attempt: 1 } });
        recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_FAILED", sequence: 2, "@timestamp": addMs(t0, 900), amount_paise, expected_fee_paise, utr: null, description: `Disbursal ${inr(amount_paise)} failed at PSP: INVALID_IFSC`, ...base });
        pushSpan({ ts: addMs(t0, 900), name: "ledger.append DISBURSAL_FAILED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });
        dayCounts.ledger_events += 2;
        continue;
      }

      dayCounts.succeeded++;
      const variant = brk?.variant ?? "CLEAN";
      const transferMs = rng.int(300, 1500);
      const callbackDelay = rng.int(2000, 20000);
      let succeededUtr = utr;
      let settlementRows = [];
      let failure_spans = [];
      let root_cause = null;
      let value_date = day;

      switch (variant) {
        case "RETRY_WITHOUT_IDEMPOTENCY_KEY": {
          // Attempt 1 times out at the gateway but goes through at the bank. Attempt 2 is sent with a fresh
          // request (no idempotency key) and also goes through. Two callbacks, two UTRs, one ledger success.
          const utr2 = `${partner.code}${compact(day)}${rng.digits(8)}`;
          pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: 30000, outcome: "failure", http: { request: { method: "POST" }, response: { status_code: 504 } }, error: { type: "GATEWAY_TIMEOUT", message: "upstream timed out after 30000ms; response status unknown" }, labels: { psp_status: "UNKNOWN", retry_attempt: 1, idempotency_key_present: false } });
          pushSpan({ ts: addMs(transferStart, 30250), name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: transferMs, http: { request: { method: "POST" }, response: { status_code: 200 } }, labels: { psp_status: "ACCEPTED", retry_attempt: 2, idempotency_key_present: false } });
          pushSpan({ ts: addMs(transferStart, 30250 + callbackDelay), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: rng.int(5, 20), labels: { psp_status: "SUCCESS", utr, callback_for_attempt: 1 } });
          pushSpan({ ts: addMs(transferStart, 30250 + callbackDelay + rng.int(500, 4000)), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: rng.int(5, 20), labels: { psp_status: "SUCCESS", utr: utr2, callback_for_attempt: 2 } });
          succeededUtr = utr2;
          const succeededAt = addMs(transferStart, 30250 + callbackDelay + 60);
          pushSpan({ ts: succeededAt, name: "ledger.append DISBURSAL_SUCCEEDED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });
          recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_SUCCEEDED", sequence: 2, "@timestamp": succeededAt, amount_paise, expected_fee_paise, utr: succeededUtr, description: `Disbursal ${inr(amount_paise)} succeeded via ${partner.name}/${rail}, UTR ${succeededUtr}`, ...base });
          for (const u of [utr, utr2]) {
            settlementRows.push(settlementRow({ settlement_date: day, value_date: day, partner: partner.name, rail, disbursal_id, utr: u, amount_paise, fee_paise: expected_fee_paise, "@timestamp": istToIso(day, 23, 45, 0), narration: makeNarration(rng, { rail, partner: partner.name, utr: u, loan_id, disbursal_id, amount_paise }), business_date: day, loan_id }));
          }
          failure_spans = [`psp.transfer ${partner.name}`];
          root_cause = "Gateway timed out on attempt 1 (HTTP 504) and the retry was sent without an idempotency key. Both attempts were executed by the partner: two UTRs, two settlement rows, one ledger success.";
          break;
        }
        case "BENEFICIARY_ACCOUNT_INVALID":
        case "INSUFFICIENT_NODAL_BALANCE": {
          // Ledger books SUCCEEDED on the PSP's synchronous ACCEPTED (premature). No terminal callback arrives;
          // the status poll returns FAILED. Money never moved, so there is no settlement row.
          pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: transferMs, http: { request: { method: "POST" }, response: { status_code: 200 } }, labels: { psp_status: "ACCEPTED", retry_attempt: 1, idempotency_key_present: true } });
          const succeededAt = addMs(transferStart, transferMs + 30);
          pushSpan({ ts: succeededAt, name: "ledger.append DISBURSAL_SUCCEEDED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11), labels: { booked_on: "PSP_ACCEPTED" } });
          recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_SUCCEEDED", sequence: 2, "@timestamp": succeededAt, amount_paise, expected_fee_paise, utr, description: `Disbursal ${inr(amount_paise)} succeeded via ${partner.name}/${rail}, UTR ${utr}`, ...base });
          pushSpan({ ts: addMs(transferStart, 1_800_000), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: 1_800_000, outcome: "failure", error: { type: "CALLBACK_TIMEOUT", message: "no terminal callback received within 1800s" }, labels: { psp_status: "PENDING" } });
          const reasonText = variant === "BENEFICIARY_ACCOUNT_INVALID" ? "beneficiary account invalid or closed at destination bank; funds not debited" : "insufficient balance in nodal account at execution time; funds not debited";
          pushSpan({ ts: addMs(transferStart, 1_800_000 + rng.int(2000, 9000)), name: `psp.status-poll ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: rng.int(150, 600), outcome: "failure", http: { request: { method: "GET" }, response: { status_code: 200 } }, error: { type: "PSP_TRANSFER_FAILED", message: `PSP status FAILED: ${reasonText}` }, labels: { psp_status: "FAILED", psp_reason: variant } });
          failure_spans = [`psp.callback ${partner.name}`, `psp.status-poll ${partner.name}`];
          root_cause = variant === "BENEFICIARY_ACCOUNT_INVALID"
            ? "Ledger booked DISBURSAL_SUCCEEDED on the PSP's synchronous ACCEPTED, before a terminal callback. The transfer later FAILED at the destination bank (beneficiary account invalid). No funds left the nodal account."
            : "Ledger booked DISBURSAL_SUCCEEDED on the PSP's synchronous ACCEPTED, before a terminal callback. The transfer later FAILED because the nodal account had insufficient balance at execution time. No funds left the nodal account.";
          break;
        }
        case "WRONG_RAIL_SLAB":
        case "GST_APPLIED_TWICE": {
          // Pipeline is clean. The partner billed the wrong fee.
          pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: transferMs, http: { request: { method: "POST" }, response: { status_code: 200 } }, labels: { psp_status: "ACCEPTED", retry_attempt: 1, idempotency_key_present: true } });
          pushSpan({ ts: addMs(transferStart, transferMs + callbackDelay), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: rng.int(5, 20), labels: { psp_status: "SUCCESS", utr } });
          const succeededAt = addMs(transferStart, transferMs + callbackDelay + 60);
          pushSpan({ ts: succeededAt, name: "ledger.append DISBURSAL_SUCCEEDED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });
          recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_SUCCEEDED", sequence: 2, "@timestamp": succeededAt, amount_paise, expected_fee_paise, utr, description: `Disbursal ${inr(amount_paise)} succeeded via ${partner.name}/${rail}, UTR ${utr}`, ...base });
          const fee_paise = variant === "WRONG_RAIL_SLAB" ? RATE_CARD_PAISE.IMPS : RATE_CARD_BASE_PAISE[rail] + 2 * (RATE_CARD_PAISE[rail] - RATE_CARD_BASE_PAISE[rail]);
          settlementRows.push(settlementRow({ settlement_date: day, value_date: day, partner: partner.name, rail, disbursal_id, utr, amount_paise, fee_paise, "@timestamp": istToIso(day, 23, 45, 0), narration: makeNarration(rng, { rail, partner: partner.name, utr, loan_id, disbursal_id, amount_paise }), business_date: day, loan_id }));
          root_cause = variant === "WRONG_RAIL_SLAB"
            ? `Partner charged the IMPS slab (${inr(RATE_CARD_PAISE.IMPS)}) on a NEFT transfer contracted at ${inr(RATE_CARD_PAISE.NEFT)}. Principal matched; pipeline clean. Commercial fee dispute, not a payment failure.`
            : `Partner applied GST twice on the ${rail} fee (${inr(fee_paise)} charged vs ${inr(expected_fee_paise)} contracted). Principal matched; pipeline clean. Commercial fee dispute, not a payment failure.`;
          break;
        }
        case "AFTER_SETTLEMENT_CUTOFF": {
          // Initiated after the partner's 23:00 IST settlement cut-off. Credit lands in the next day's file.
          pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: transferMs, http: { request: { method: "POST" }, response: { status_code: 200 } }, labels: { psp_status: "ACCEPTED", retry_attempt: 1, idempotency_key_present: true, settlement_cycle: "NEXT_DAY" } });
          pushSpan({ ts: addMs(transferStart, transferMs + callbackDelay), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: rng.int(5, 20), labels: { psp_status: "SUCCESS", utr } });
          const succeededAt = addMs(transferStart, transferMs + callbackDelay + 60);
          pushSpan({ ts: succeededAt, name: "ledger.append DISBURSAL_SUCCEEDED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });
          recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_SUCCEEDED", sequence: 2, "@timestamp": succeededAt, amount_paise, expected_fee_paise, utr, description: `Disbursal ${inr(amount_paise)} succeeded via ${partner.name}/${rail}, UTR ${utr}`, ...base });
          value_date = nextDay(day);
          settlementRows.push(settlementRow({ settlement_date: value_date, value_date, partner: partner.name, rail, disbursal_id, utr, amount_paise, fee_paise: expected_fee_paise, "@timestamp": istToIso(value_date, 23, 45, 0), narration: makeNarration(rng, { rail, partner: partner.name, utr, loan_id, disbursal_id, amount_paise }), business_date: day, loan_id }));
          root_cause = `Transfer initiated at ${new Date(new Date(t0).getTime() + IST_OFFSET_MS).toISOString().slice(11, 16)} IST, after the partner's 23:00 settlement cut-off. Credit is present in the ${value_date} settlement file with value date ${value_date}. Self-clearing; no action.`;
          break;
        }
        case "SHORT_CREDIT_NO_SIGNAL": {
          // Single row, ₹1,000 short, fee correct, pipeline clean. Nothing in the data explains it.
          pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: transferMs, http: { request: { method: "POST" }, response: { status_code: 200 } }, labels: { psp_status: "ACCEPTED", retry_attempt: 1, idempotency_key_present: true } });
          pushSpan({ ts: addMs(transferStart, transferMs + callbackDelay), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: rng.int(5, 20), labels: { psp_status: "SUCCESS", utr } });
          const succeededAt = addMs(transferStart, transferMs + callbackDelay + 60);
          pushSpan({ ts: succeededAt, name: "ledger.append DISBURSAL_SUCCEEDED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });
          recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_SUCCEEDED", sequence: 2, "@timestamp": succeededAt, amount_paise, expected_fee_paise, utr, description: `Disbursal ${inr(amount_paise)} succeeded via ${partner.name}/${rail}, UTR ${utr}`, ...base });
          settlementRows.push(settlementRow({ settlement_date: day, value_date: day, partner: partner.name, rail, disbursal_id, utr, amount_paise: amount_paise - 100_000, fee_paise: expected_fee_paise, "@timestamp": istToIso(day, 23, 45, 0), narration: makeNarration(rng, { rail, partner: partner.name, utr, loan_id, disbursal_id, amount_paise: amount_paise - 100_000 }), business_date: day, loan_id }));
          root_cause = "Unknown by design. Settlement credit is ₹1,000.00 short with a single row, correct fee, correct value date and a clean pipeline. No rule matches and no evidence in the indexed data explains the shortfall. Must escalate to a human with the partner.";
          break;
        }
        default: {
          // CLEAN
          pushSpan({ ts: transferStart, name: `psp.transfer ${partner.name}`, type: "external", service: "payout-gateway", duration_ms: transferMs, http: { request: { method: "POST" }, response: { status_code: 200 } }, labels: { psp_status: "ACCEPTED", retry_attempt: 1, idempotency_key_present: true } });
          pushSpan({ ts: addMs(transferStart, transferMs + callbackDelay), name: `psp.callback ${partner.name}`, type: "messaging", service: "payout-gateway", duration_ms: rng.int(5, 20), labels: { psp_status: "SUCCESS", utr } });
          const succeededAt = addMs(transferStart, transferMs + callbackDelay + 60);
          pushSpan({ ts: succeededAt, name: "ledger.append DISBURSAL_SUCCEEDED", type: "db", service: "ledger-service", duration_ms: rng.int(4, 11) });
          recon.push({ source: "ledger", event_id: eventId(), event_type: "DISBURSAL_SUCCEEDED", sequence: 2, "@timestamp": succeededAt, amount_paise, expected_fee_paise, utr, description: `Disbursal ${inr(amount_paise)} succeeded via ${partner.name}/${rail}, UTR ${utr}`, ...base });
          settlementRows.push(settlementRow({ settlement_date: day, value_date: day, partner: partner.name, rail, disbursal_id, utr, amount_paise, fee_paise: expected_fee_paise, "@timestamp": istToIso(day, 23, 45, 0), narration: makeNarration(rng, { rail, partner: partner.name, utr, loan_id, disbursal_id, amount_paise }), business_date: day, loan_id }));
        }
      }

      dayCounts.ledger_events += 2;
      dayCounts.settlement_rows += settlementRows.length;
      recon.push(...settlementRows);

      if (brk) {
        const settled = settlementRows.reduce((s, r) => s + r.amount_paise, 0);
        const chargedFee = settlementRows.reduce((s, r) => s + r.fee_paise, 0);
        answerBreaks.push({
          disbursal_id,
          business_date: day,
          break_type: brk.type,
          variant,
          partner: partner.name,
          rail,
          loan_id,
          amount_paise,
          ledger_utr: succeededUtr,
          settlement_utrs: settlementRows.map((r) => r.utr),
          settlement_row_ids: settlementRows.map((r) => r.row_id),
          expected: {
            settlement_rows: settlementRows.length,
            ledger_paise: amount_paise,
            settled_paise: settled,
            delta_paise: amount_paise - settled,
            expected_fee_paise,
            charged_fee_paise: chargedFee,
            fee_delta_paise: chargedFee - expected_fee_paise,
            value_date: settlementRows.length ? value_date : null,
          },
          failure_spans,
          root_cause,
        });
      }
    }
    counts[day] = dayCounts;
  }

  const resolved = generateResolvedLibrary(rng, answerBreaks.filter((b) => b.business_date !== DEMO_DAY));

  const totals = Object.values(counts).reduce((t, c) => {
    for (const k of Object.keys(c)) t[k] = (t[k] ?? 0) + c[k];
    return t;
  }, {});

  const answerKey = {
    generator: "src/generate.js",
    seed: SEED,
    generated_at: new Date().toISOString(),
    business_days: BUSINESS_DAYS,
    demo_business_date: DEMO_DAY,
    rate_card_paise: RATE_CARD_PAISE,
    counts: { ...counts, totals: { ...totals, resolved_cases: resolved.length } },
    breaks: answerBreaks,
    break_type_definitions: {
      MISSING_CREDIT: "Ledger has DISBURSAL_SUCCEEDED, settlement file has zero rows for the disbursal.",
      DOUBLE_DEBIT: "Settlement file has more than one row for the disbursal.",
      FEE_MISMATCH: "Principal matches, one row, but charged fee differs from the contracted rate card.",
      TIMING_T1: "Principal and fee match, one row, but value date is after the business date.",
      UNRESOLVED: "Exactly one row and a non-zero principal delta that no rule explains. Requires human review.",
    },
  };

  return { recon, spans, resolved, answerKey };
}

// ---------------------------------------------------------------- resolved-breaks library

/**
 * Past cases a human already resolved. Descriptions are deliberately varied in wording so that
 * lexical search alone would miss many of them and semantic search earns its place.
 */
function generateResolvedLibrary(rng, priorDayBreaks) {
  const analysts = ["AK", "PR", "SN", "VM", "RJ"];
  const templates = {
    MISSING_CREDIT: [
      // 1. Formal partner-escalation POV
      (c) => `Loan payout for ${c.disbursal_id} shows success in our books but ${c.partner} never credited the beneficiary. Their status API said FAILED (${c.reason}) about half an hour after we had already booked success.`,
      // 2. Analyst data observation
      (c) => `Booked ${c.amount} as disbursed, nothing in the ${c.partner} settlement report. Turned out the callback never came and the poll came back failed: ${c.reason}.`,
      // 3. Bank statement trace language
      (c) => `${c.rail} transfer marked done on our side on the ACCEPTED response. Bank rejected downstream (${c.reason}). No debit on the nodal account.`,
      // 4. Ops shorthand
      (c) => `Ghost success. Ledger says money went out, partner file is empty for this ref. Root cause was the premature success write on ACCEPTED; PSP later reported ${c.reason}.`,
      // 5. EOD reconciliation report style
      (c) => `EOD recon flagged ${c.disbursal_id}: ledger carries DISBURSAL_SUCCEEDED for ${c.amount} via ${c.partner}/${c.rail}, but the day's settlement file has no corresponding row. Status poll at T+30 min returned FAILED — ${c.reason}. Nodal account untouched.`,
      // 6. Partner ops ticket / escalation language
      (c) => `Escalated to ${c.partner} ops: ${c.disbursal_id} shows zero credits in the ${c.rail} settlement despite a synchronous ACCEPTED. PSP status poll returned FAILED – ${c.reason}. Requesting confirmation that no debit occurred on the nodal account.`,
      // 7. Ops team informal / chat tone
      (c) => `${c.partner} said ACCEPTED, we booked it, they never sent it. ${c.reason} is what killed it downstream. Zero entry in the settlement file. Nodal untouched.`,
      // 8. Post-RCA compliance note
      (c) => `Settlement exception on ${c.disbursal_id}: platform wrote DISBURSAL_SUCCEEDED on receipt of synchronous ACCEPTED from ${c.partner}. Terminal callback was never received. Manual status poll confirmed FAILED – ${c.reason}. Settlement row count: 0. Ledger reversal required.`,
    ],
    DOUBLE_DEBIT: [
      // 1. Customer impact POV
      (c) => `Customer got paid twice on ${c.disbursal_id}. First call to ${c.partner} hit a 504, our gateway retried with a new request id, both went through at the bank.`,
      // 2. Bank statement two-UTR observation
      (c) => `Two UTRs against one disbursal in the ${c.partner} statement. Gateway timeout followed by a retry that did not reuse the idempotency key.`,
      // 3. Reversal initiation note
      (c) => `Duplicate payout of ${c.amount}. Timeout on attempt one, attempt two accepted, partner executed both. Raised reversal with ${c.partner} for the first UTR.`,
      // 4. Technical retry description
      (c) => `Double credit to beneficiary via ${c.rail}. Retry storm after upstream 504; no idempotency on the retry path.`,
      // 5. EOD report format
      (c) => `Double debit flag: ${c.disbursal_id} appears twice in the ${c.partner}/${c.rail} settlement extract. Ledger has one DISBURSAL_SUCCEEDED; bank has two rows, two UTRs. Idempotency key absent on the retry after a gateway timeout. Excess debit: ${c.amount}. Reversal in progress.`,
      // 6. Partner escalation formal
      (c) => `Duplicate settlement detected for ${c.disbursal_id}. ${c.partner} settlement file shows 2 rows – two separate UTRs, both marked settled. Root cause: HTTP 504 on attempt 1, retry sent without idempotency key, both executed. Raising reversal request for the earlier UTR.`,
      // 7. Ops informal
      (c) => `We paid the customer twice for ${c.disbursal_id}. 504 on the first try, gateway retried with a fresh request ID, ${c.partner} processed both. Two nodal debits, two credits to the beneficiary.`,
      // 8. Monitoring / system alert format
      (c) => `DOUBLE_DEBIT | ref: ${c.disbursal_id} | partner: ${c.partner} | rail: ${c.rail} | settlement_rows: 2 | excess: ${c.amount} | cause: retry_without_idempotency | action: reversal_raised`,
    ],
    FEE_MISMATCH: [
      // 1. Wrong slab identification
      (c) => `${c.partner} billed the IMPS slab on a NEFT payout for ${c.disbursal_id}. Principal fine, fee ${c.feeDelta} over the rate card.`,
      // 2. GST double-application
      (c) => `Fee line in the settlement file does not match the contract for ${c.rail}. Looks like GST got applied twice on the base fee. Principal reconciles.`,
      // 3. Monthly dispute log
      (c) => `Commercial issue only: charged ${c.chargedFee} against contracted ${c.expectedFee} on ${c.disbursal_id}. Added to the monthly fee dispute with ${c.partner}.`,
      // 4. "Amount matched, fee didn't"
      (c) => `Wrong tariff applied by ${c.partner}. Amount matched to the paisa, fee did not. Not a payment failure.`,
      // 5. Commercial dispute email
      (c) => `Raising commercial dispute for ${c.disbursal_id}: ${c.partner} billed ${c.chargedFee} in transaction charges against our contracted rate of ${c.expectedFee} for ${c.rail} transfers. Delta ${c.feeDelta} to be credited back. Principal fully reconciled.`,
      // 6. Analyst informal
      (c) => `Fee-only issue – principal is spot-on but ${c.partner} billed us wrong. We are on ${c.expectedFee} per ${c.rail} transfer per SLA; they charged ${c.chargedFee}. Adding to the fee dispute tracker, no reversal needed.`,
      // 7. EOD variance report
      (c) => `Fee variance on ${c.disbursal_id}: principal matched (${c.amount}), but ${c.partner} applied ${c.chargedFee} vs contracted ${c.expectedFee} for ${c.rail} rail. Overcharge: ${c.feeDelta}. Pipeline clean; this is a commercial exception, not a payment failure.`,
      // 8. Formal audit note
      (c) => `Transaction fee discrepancy: ${c.disbursal_id}. Principal settlement correct at ${c.amount}. Fee charged by ${c.partner}: ${c.chargedFee}; rate card for ${c.rail}: ${c.expectedFee}. Variance: ${c.feeDelta}. Logged in monthly reconciliation dispute register. No action on principal.`,
    ],
    TIMING_T1: [
      // 1. Late evening with T+1 value date
      (c) => `Payout for ${c.disbursal_id} went out late in the evening, after the ${c.partner} 23:00 cut-off. Credit showed up in the next day's file with a T+1 value date. Cleared itself.`,
      // 2. Found in next morning's file
      (c) => `Missing from the day's statement, present in the next morning's. Initiated post cut-off. No action needed.`,
      // 3. Next settlement cycle
      (c) => `Value date one day after our business date on ${c.rail}. Late initiation, next settlement cycle. Closed as timing.`,
      // 4. Looked like missing credit initially
      (c) => `Looked like a missing credit at first but the ${c.partner} file for the following day had it. Late-night disbursal.`,
      // 5. Ops informal confirmation
      (c) => `Went out after ${c.partner} cut-off on ${c.rail}. No action needed – it shows in tomorrow's file with T+1 value date. Not a break, just timing.`,
      // 6. EOD timing exception report
      (c) => `Timing exception: ${c.disbursal_id} initiated after ${c.partner}'s 23:00 IST cut-off. Credit is present in the subsequent business day settlement file with correct amount ${c.amount} and T+1 value date. Auto-clears; no case required.`,
      // 7. Partner confirmation language
      (c) => `Confirmed with ${c.partner}: ${c.disbursal_id} processed after the ${c.rail} settlement window. Transaction valid, will appear in the next cycle. Value date reflects actual settlement. Closing as TIMING_T1, no reversal.`,
      // 8. Analyst shorthand
      (c) => `T+1 carry-over on ${c.partner}/${c.rail}. Post-23:00 initiation. Reconciles against next day's file. Not a break — timing only.`,
    ],
    UNRESOLVED: [
      // 1. Short credit, partner refunded
      (c) => `Short credit on ${c.disbursal_id}: partner settled ${c.settled} against ${c.amount} booked. Fee correct, single row, pipeline clean. Partner ops confirmed a manual adjustment on their side; refunded the difference after 6 days.`,
      // 2. Escalated, clerical error
      (c) => `Unexplained ${c.deltaAbs} shortfall in the ${c.partner} settlement. Nothing in traces or the statement explained it. Escalated to partner; resolved as a partner-side clerical error.`,
      // 3. Formal escalation note
      (c) => `Unexplained principal shortfall on ${c.disbursal_id}: ledger ${c.amount}, settled ${c.settled}, delta ${c.deltaAbs}. Fee correct. Single settlement row. Pipeline clean — all spans successful, no error codes. No classification rule applies. Escalated to ${c.partner} ops with UTR for investigation.`,
      // 4. Analyst informal
      (c) => `No idea why ${c.partner} shorted us by ${c.deltaAbs} on ${c.disbursal_id}. Fee is right, one row, traces all green. Nothing in our data explains this. Had to go directly to their ops team.`,
      // 5. Post-resolution note
      (c) => `Resolved: shortfall of ${c.deltaAbs} on ${c.disbursal_id} was a manual routing adjustment by ${c.partner}, not reflected in the settlement narration. Difference refunded to nodal account after escalation. No recurring pattern; monitoring ongoing.`,
      // 6. EOD escalation flag
      (c) => `UNRESOLVED flag: ${c.disbursal_id} — single settlement row, amount ${c.settled} vs ledger ${c.amount}, variance ${c.deltaAbs}. Fee delta zero. Value date matches business date. All pipeline spans succeeded. No rule matches. Manual partner review required. Nodal exposure: ${c.deltaAbs}.`,
    ],
  };
  const reasons = ["BENEFICIARY_ACCOUNT_INVALID", "INSUFFICIENT_NODAL_BALANCE"];
  const cases = [];
  let seq = 0;

  const mkCase = (type, business_date, fields) => {
    seq++;
    const opened = istToIso(business_date, rng.int(7, 11), rng.int(0, 59), 0);
    const minutes = type === "UNRESOLVED" ? rng.int(180, 8640) : type === "TIMING_T1" ? rng.int(15, 40) : rng.int(35, 110);
    const c = { ...fields, amount: inr(fields.amount_paise) };
    const t = rng.pick(templates[type]);
    const rootCause = {
      MISSING_CREDIT: `Premature DISBURSAL_SUCCEEDED written on PSP ACCEPTED; PSP later reported FAILED (${c.reason ?? "BENEFICIARY_ACCOUNT_INVALID"}).`,
      DOUBLE_DEBIT: "Retry after gateway timeout without idempotency key; partner executed both attempts.",
      FEE_MISMATCH: "Partner applied wrong tariff (rail slab or GST) on the transfer fee.",
      TIMING_T1: "Initiated after partner settlement cut-off; credited in next settlement cycle.",
      UNRESOLVED: "Partner-side clerical adjustment; not detectable from ledger, statement or traces.",
    }[type];
    const resolution = {
      MISSING_CREDIT: "Reversed ledger success, re-initiated disbursal after beneficiary/nodal check, informed customer.",
      DOUBLE_DEBIT: "Raised reversal with partner for the first UTR; posted ledger adjustment on receipt.",
      FEE_MISMATCH: "Logged in monthly fee dispute with partner; credit note received.",
      TIMING_T1: "No action. Auto-matched on next day's file.",
      UNRESOLVED: "Escalated to partner operations; difference refunded manually.",
    }[type];
    cases.push({
      case_id: `CASE-2026-${pad(seq, 4)}`,
      opened_at: opened,
      resolved_at: addMs(opened, minutes * 60_000),
      business_date,
      break_type: type,
      partner: fields.partner,
      rail: fields.rail,
      disbursal_id: fields.disbursal_id,
      loan_id: fields.loan_id,
      amount_paise: fields.amount_paise,
      delta_paise: fields.delta_paise,
      summary: t(c),
      root_cause: rootCause,
      resolution,
      resolved_by: rng.pick(analysts),
      time_to_resolve_minutes: minutes,
      tags: ["synthetic", type.toLowerCase(), fields.partner.toLowerCase(), fields.rail.toLowerCase()],
    });
  };

  // Historical cases, June to early September 2026.
  const months = [["2026-06", 30], ["2026-07", 31], ["2026-08", 31], ["2026-09", 12]];
  const mix = ["MISSING_CREDIT", "MISSING_CREDIT", "DOUBLE_DEBIT", "DOUBLE_DEBIT", "FEE_MISMATCH", "FEE_MISMATCH", "TIMING_T1", "TIMING_T1", "UNRESOLVED"];
  for (const [ym, days] of months) {
    for (let k = 0; k < 20; k++) {
      const type = mix[(seq + k) % mix.length];
      const day = `${ym}-${pad(rng.int(1, days), 2)}`;
      const partner = rng.pick(PARTNERS);
      const rail = type === "FEE_MISMATCH" && rng.chance(0.5) ? "NEFT" : rng.pick(partner.rails);
      const amount_paise =
        rail === "RTGS"
          ? rng.int(2000, 50000) * 100 * 100
          : rail === "IMPS"
          ? rng.int(100, 5000) * 100 * 100
          : rng.int(50, 10000) * 100 * 100;
      const expectedFee = RATE_CARD_PAISE[rail];
      const chargedFee = type === "FEE_MISMATCH" ? (rail === "NEFT" ? RATE_CARD_PAISE.IMPS : RATE_CARD_BASE_PAISE[rail] + 2 * (RATE_CARD_PAISE[rail] - RATE_CARD_BASE_PAISE[rail])) : expectedFee;
      const settled = type === "MISSING_CREDIT" ? 0 : type === "DOUBLE_DEBIT" ? 2 * amount_paise : type === "UNRESOLVED" ? amount_paise - rng.int(1, 25) * 10_000 : amount_paise;
      mkCase(type, day, {
        disbursal_id: `DSB-${compact(day)}-${pad(rng.int(1, DISBURSALS_PER_DAY), 5)}`,
        loan_id: `LN-${rng.digits(8)}`,
        partner: partner.name,
        rail,
        amount_paise,
        delta_paise: amount_paise - settled,
        settled: inr(settled),
        deltaAbs: inr(Math.abs(amount_paise - settled)),
        reason: rng.pick(reasons),
        chargedFee: inr(chargedFee),
        expectedFee: inr(expectedFee),
        feeDelta: inr(chargedFee - expectedFee),
      });
    }
  }

  // The seeded breaks from the two days before the demo day, already resolved, with their real IDs.
  for (const b of priorDayBreaks) {
    mkCase(b.break_type, b.business_date, {
      disbursal_id: b.disbursal_id,
      loan_id: b.loan_id,
      partner: b.partner,
      rail: b.rail,
      amount_paise: b.amount_paise,
      delta_paise: b.expected.delta_paise,
      settled: inr(b.expected.settled_paise),
      deltaAbs: inr(Math.abs(b.expected.delta_paise)),
      reason: b.variant,
      chargedFee: inr(b.expected.charged_fee_paise),
      expectedFee: inr(b.expected.expected_fee_paise),
      feeDelta: inr(b.expected.fee_delta_paise),
    });
  }
  return cases;
}

// ---------------------------------------------------------------- write files

function stripUndefined(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function writeAll(outDir) {
  const { recon, spans, resolved, answerKey } = generate();
  mkdirSync(outDir, { recursive: true });
  const ndjson = (rows) => rows.map((r) => JSON.stringify(stripUndefined(r))).join("\n") + "\n";
  writeFileSync(join(outDir, "recon.ndjson"), ndjson(recon));
  writeFileSync(join(outDir, "traces.ndjson"), ndjson(spans));
  writeFileSync(join(outDir, "resolved-breaks.ndjson"), ndjson(resolved));
  writeFileSync(join(outDir, "answer-key.json"), JSON.stringify(answerKey, null, 2) + "\n");
  return { recon: recon.length, spans: spans.length, resolved: resolved.length, breaks: answerKey.breaks.length, counts: answerKey.counts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  const r = writeAll(outDir);
  console.log(`generated -> ${outDir}`);
  console.log(`  recon docs (ledger+settlement): ${r.recon}`);
  console.log(`  trace spans:                    ${r.spans}`);
  console.log(`  resolved cases:                 ${r.resolved}`);
  console.log(`  seeded breaks:                  ${r.breaks}`);
  for (const [day, c] of Object.entries(r.counts)) {
    console.log(`  ${day.padEnd(12)} ${JSON.stringify(c)}`);
  }
}
