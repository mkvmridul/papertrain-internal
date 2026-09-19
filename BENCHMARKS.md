# Benchmarks

Verbatim output of `npm run verify:report`. Every number quoted in the README and the deck comes from here.

- Run at: 2026-09-18T06:05:57.389Z
- Cluster: f9c9ed5f87634a479c6225d17e27e780 · Elasticsearch 9.6.0 (serverless)
- Node: v25.2.1
- Data: seed 20260916, generated 2026-09-18T05:59:13.016Z, answer key data/answer-key.json
- Latency figures are the ES|QL `took` value reported by Elasticsearch for each query, not end-to-end wall clock.

```

1. ledgerlens.list_breaks per business date
  ok   2026-09-14: 2/2 seeded breaks found, 0 false positives, 31 ms
  ok   2026-09-15: 2/2 seeded breaks found, 0 false positives, 29 ms
  ok   2026-09-16: 10/10 seeded breaks found, 0 false positives, 30 ms

2. ledgerlens.break_delta per seeded break
  ok   DSB-20260914-00222 MISSING_CREDIT  delta=43790000 fee_delta=-295 rows=0 ids=2 14 ms
  ok   DSB-20260914-00247 DOUBLE_DEBIT    delta=-26820000 fee_delta=590 rows=2 ids=4 14 ms
  ok   DSB-20260915-00183 FEE_MISMATCH    delta=0 fee_delta=295 rows=1 ids=3 13 ms
  ok   DSB-20260915-00320 TIMING_T1       delta=0 fee_delta=0 rows=1 ids=3 15 ms
  ok   DSB-20260916-00039 MISSING_CREDIT  delta=64770000 fee_delta=-295 rows=0 ids=2 13 ms
  ok   DSB-20260916-00104 DOUBLE_DEBIT    delta=-5660000 fee_delta=590 rows=2 ids=4 22 ms
  ok   DSB-20260916-00114 MISSING_CREDIT  delta=304280000 fee_delta=-2360 rows=0 ids=2 13 ms
  ok   DSB-20260916-00116 FEE_MISMATCH    delta=0 fee_delta=295 rows=1 ids=3 13 ms
  ok   DSB-20260916-00150 UNRESOLVED      delta=100000 fee_delta=0 rows=1 ids=3 13 ms
  ok   DSB-20260916-00266 TIMING_T1       delta=0 fee_delta=0 rows=1 ids=3 13 ms
  ok   DSB-20260916-00277 DOUBLE_DEBIT    delta=-47680000 fee_delta=295 rows=2 ids=4 14 ms
  ok   DSB-20260916-00315 FEE_MISMATCH    delta=0 fee_delta=90 rows=1 ids=3 12 ms
  ok   DSB-20260916-00383 TIMING_T1       delta=0 fee_delta=0 rows=1 ids=3 14 ms
  ok   DSB-20260916-00385 MISSING_CREDIT  delta=62690000 fee_delta=-295 rows=0 ids=2 13 ms

3. ledgerlens.break_delta on a clean disbursal and a failed one
  ok   DSB-20260914-00001 -> MATCHED
  ok   DSB-20260914-00106 -> NO_LEDGER_SUCCESS

4. ledgerlens.trace_failure_point per seeded break
  ok   DSB-20260914-00222 failure point(s) = psp.callback MERIDIAN -> psp.status-poll MERIDIAN (CALLBACK_TIMEOUT) 11 ms
  ok   DSB-20260914-00247 failure point(s) = psp.transfer PAYSTREAM (GATEWAY_TIMEOUT) 11 ms
  ok   DSB-20260915-00183 pipeline clean (5 spans) 10 ms
  ok   DSB-20260915-00320 pipeline clean (5 spans) 12 ms
  ok   DSB-20260916-00039 failure point(s) = psp.callback MERIDIAN -> psp.status-poll MERIDIAN (CALLBACK_TIMEOUT) 12 ms
  ok   DSB-20260916-00104 failure point(s) = psp.transfer NORTHBANK (GATEWAY_TIMEOUT) 11 ms
  ok   DSB-20260916-00114 failure point(s) = psp.callback NORTHBANK -> psp.status-poll NORTHBANK (CALLBACK_TIMEOUT) 11 ms
  ok   DSB-20260916-00116 pipeline clean (5 spans) 10 ms
  ok   DSB-20260916-00150 pipeline clean (5 spans) 11 ms
  ok   DSB-20260916-00266 pipeline clean (5 spans) 11 ms
  ok   DSB-20260916-00277 failure point(s) = psp.transfer NORTHBANK (GATEWAY_TIMEOUT) 9 ms
  ok   DSB-20260916-00315 pipeline clean (5 spans) 9 ms
  ok   DSB-20260916-00383 pipeline clean (5 spans) 10 ms
  ok   DSB-20260916-00385 failure point(s) = psp.callback NORTHBANK -> psp.status-poll NORTHBANK (CALLBACK_TIMEOUT) 11 ms

5. ledgerlens.evidence_rows cite an ID on every row
  ok   DSB-20260914-00222: 2 rows, every row has event_id or row_id
  ok   DSB-20260914-00247: 4 rows, every row has event_id or row_id
  ok   DSB-20260915-00183: 3 rows, every row has event_id or row_id

6. ledgerlens.similar_cases (hybrid BM25 + semantic, RRF) per break type
  ok   MISSING_CREDIT  precedent at rank 1: CASE-2026-0081 128 ms
  ok   DOUBLE_DEBIT    precedent at rank 1: CASE-2026-0020 128 ms
  ok   FEE_MISMATCH    precedent at rank 1: CASE-2026-0008 127 ms
  ok   TIMING_T1       precedent at rank 1: CASE-2026-0004 130 ms
  ok   UNRESOLVED      precedent at rank 1: CASE-2026-0033 129 ms

7. headline numbers for the pitch
  demo date 2026-09-16: 388 successful disbursals worth ₹24,71,32,300, 10 seeded breaks
  index size: 3569 recon docs, 5980 spans, 84 resolved cases
  seeded breaks detected: 14/14 across 3 days, 0 false positives (see section 1)
  ES|QL list_breaks          median 30 ms over 3 runs
  ES|QL break_delta          median 13 ms over 14 runs
  ES|QL trace_failure_point  median 11 ms over 14 runs
  ES|QL similar_cases        median 128 ms over 5 runs

all checks passed
```
