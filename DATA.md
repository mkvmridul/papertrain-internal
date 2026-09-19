# Data provenance

**Every document in this project is synthetic.** It is produced by one deterministic script, `src/generate.js`, from a fixed seed (`20260916`). Running `npm run generate` reproduces the files in `data/` byte for byte.

**No production, customer, partner or employer data was used, copied, sampled or referenced.** No public dataset was used either. The institutions in the data (PAYSTREAM, NORTHBANK, MERIDIAN) are fictional. Loan IDs, customer IDs, UTRs, amounts and timestamps are generated.

## What the generator produces

| File | Index | Docs | Content |
|---|---|---|---|
| `data/recon.ndjson` | `ledgerlens-recon` | 3,574 | 2,400 event-sourced ledger events (`DISBURSAL_INITIATED`, `DISBURSAL_SUCCEEDED`, `DISBURSAL_FAILED`) and 1,174 normalised partner settlement rows, in one schema |
| `data/traces.ndjson` | `ledgerlens-traces` | 5,985 | Disbursal-pipeline spans shaped like Elastic APM / ECS (`trace.id`, `span.name`, `event.outcome`, `error.type`, `labels.*`) |
| `data/resolved-breaks.ndjson` | `ledgerlens-resolved-breaks` | 36 | A library of past breaks a human resolved, with deliberately varied wording, for hybrid retrieval |
| `data/answer-key.json` | – | – | Every seeded break, its type, expected figures and the spans that must show the failure. `npm run verify` scores the ES|QL tools against it |

Three business days: 2026-09-14, 2026-09-15 and 2026-09-16 (the demo day). 400 disbursals per day, ₹5,000 to ₹5,00,000 in ₹100 steps, across three partners and three rails (IMPS, NEFT, RTGS). About 2% of disbursals are rejected synchronously by the partner and booked `DISBURSAL_FAILED`; they must never be flagged as breaks.

All money is integer paise. Fees follow a contracted rate card, GST included: IMPS ₹5.90, NEFT ₹2.95, RTGS ₹23.60.

## Seeded break catalogue

| Type | Rule (computed in ES|QL) | Seeded mechanism | Demo-day count |
|---|---|---|---|
| `MISSING_CREDIT` | ledger success present, settlement rows = 0 | Ledger booked success on the partner's synchronous `ACCEPTED`. No terminal callback came; the status poll returned `FAILED` (beneficiary account invalid, or insufficient nodal balance). Funds never moved | 3 |
| `DOUBLE_DEBIT` | settlement rows > 1 | Gateway timed out (HTTP 504) on attempt 1 and retried without an idempotency key. The partner executed both. Two UTRs, two settlement rows | 2 |
| `FEE_MISMATCH` | principal delta = 0, fee delta ≠ 0 | Partner billed the IMPS slab on a NEFT transfer, or applied GST twice. Pipeline clean | 2 |
| `TIMING_T1` | principal and fee match, value date > business date | Initiated after the partner's 23:00 IST settlement cut-off; the credit is in the next day's file | 2 |
| `UNRESOLVED` | one row, non-zero principal delta, no rule matches | Credit ₹1,000 short, fee correct, pipeline clean. Nothing in the data explains it. The agent must say so and escalate | 1 |

Two earlier days carry four more breaks (one of each of the first four types) which also appear, already resolved, in the library with their real IDs, so precedent retrieval can surface an exact match.

## Why synthetic

Reconciliation data is regulated and belongs to the institution that produced it. Synthetic data keeps results reproducible for judging, lets every seeded break have a known answer, and lets us publish the generator as the complete source. The trade-off is stated openly: the break mechanisms are realistic, the volumes and the mix are chosen for a demo.

## Regenerating

```bash
npm run generate     # writes data/*.ndjson and data/answer-key.json
npm test             # generator invariants: determinism, unique IDs, integer paise, rules agree with the answer key
```
