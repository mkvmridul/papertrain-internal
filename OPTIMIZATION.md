# Optimization log

Where LedgerLens spends its time, what has been fixed, and what is worth fixing next.

**How to use this file.** Each item has a **Status**: `DONE`, `NEXT`, `LATER`, or `N/A` (with the
reason). When you finish something, move it to `DONE` and write down the number you measured.
When you find a new idea, add a row. Keep the measured numbers honest: if a figure came from one
run, say so. Claims in here may end up on a slide, so they have to survive a judge's question.

Related: [CHANGELOG.md](CHANGELOG.md) records *what changed and why*; this file records *where the
time goes and what is left*. `CLAUDE.md` section 7 points here.

---

## The headline: it is not Elasticsearch

One investigation of `DSB-20260916-00297`, measured from the SSE stream against the cloud project
(Elastic Managed LLM, 4 LLM calls):

| Window | Duration | What is happening |
|---|---|---|
| 0 → 16.6s | **16.6s** | Dead air. No events at all. No tool has run yet. |
| 16.6 → 20.4s | 3.8s | First narration text, then the first `tool_call` (`break_delta`) |
| 20.4 → 23.9s | 3.5s | Turn 2: `evidence_rows` + `trace_failure_point`, batched |
| 23.9 → 30.0s | 6.1s | Turn 3: `similar_cases` |
| 30.0 → 45.0s | 15.0s | Turn 4: the final ~1,800-token report generating and streaming |

**All five ES|QL queries together take about 80 ms.** That is roughly 0.2% of the run. Everything
else is model time.

Measured 18 Sep evening through the running console: each call to the project also costs about
**250 ms of network** on top of the query (`/api/break` 272 ms wall for a 13 ms query, 3 runs;
`/api/summary` 315 ms wall, 3 runs; the Kibana host is in `us-central1`). So on the page the lever
is the number of sequential round trips, not the query time.

So there are two separate tracks, and they are not the same problem:

- **Track A — Agent Builder / LLM latency.** This is the demo problem, and it is the only one that
  matters this week.
- **Track B — Elasticsearch latency.** Nothing here is slow today. These are the changes that would
  matter at production volume, and they are good Q&A answers about how the system scales.

Do not spend build-day time on Track B for speed. Spend it on Track A.

---

## Track A — Agent Builder / LLM latency (the demo problem)

### Done

| What | Result | Where |
|---|---|---|
| **Batch independent tools into one turn.** `evidence_rows` and `trace_failure_point` both take only `disbursal_id` and do not depend on each other, so they run in the same turn. Until 18 Sep evening `break_delta` ran alone first; the instructions now put it in the same first turn as well (Next #1, step one), which is not yet pushed with `setup:agent`. | `model_usage.llm_calls` was 4 with the two-tool batch, and the two tools shared one `tool_call_group_id`. Three-tool batch: not yet measured. | `elastic/agent/instructions.md` |
| **Stream the response (SSE).** The console reads `converse/async` and shows tool calls and text as they arrive, instead of a spinner until the end. | First visible progress at ~16s instead of a blank screen until ~45s. Wall clock is unchanged; the wait stopped being silent. | `src/console/server.js`, `src/console/index.html` |
| **Fix the unrequested `open_case` call.** The agent used to open a case on its own at the end of an investigation. | Removes one whole LLM turn from every run, and restores the approval gate the pitch depends on. | `elastic/agent/instructions.md` |
| **Prefetch the ES|QL half in the console.** The three tools that take only the id (`break_delta`, `evidence_rows`, `trace_failure_point`) run in parallel on the server the moment a row is clicked, one round trip, and the page paints verdict, figures, the evidence table and the pipeline failure point while the model is still starting. Display only: the traceability check still uses the agent's own tool results. | **Measured 18 Sep evening**, read-only against the cloud project: 0.27 s wall for all three (3 runs; 0.93 s on the first, cold), ES|QL 8 to 37 ms each. Before: 16.6 s to the first stream event. Wall clock to the full report is unchanged. | `src/console/server.js` (`/api/break`), `src/console/index.html` (`prefetchBreak`, `prefetchHtml`) |
| **Live status bar and a panel patched per region.** Five phase chips tick as each tool result arrives, a clock runs from the click to `round_complete`, and a text chunk updates only the text region. The old code rebuilt the whole panel on every SSE event, restarting the verdict card's fade-in each time. Once the report itself streams, the ES|QL card hides and the report's own sections take its place. | Perceived latency only; no wall-clock change. Verified in Chrome against a synthetic stream (CHANGELOG, 18 Sep evening). | `src/console/index.html` (`mountStreaming`, `statusPatch`, `renderStreaming`) |
| **Rewrite chat questions before they reach the agent.** Free-text chat messages go through one Claude Haiku 4.5 call on Bedrock that adds what the message lacks: the console's business date, the selected disbursal, the tool to use. Approvals, dismissals and `Investigate <id>` skip it; a rewrite that adds an approval word or drops a disbursal ID is discarded. | Adds one model call per chat turn: **1,968 ms and 1,113 ms** in the two turns measured on 18 Sep (`CHAT_MODE=local`, Haiku 4.5 via Bedrock Mantle). Removes the clarifying question the model used to ask when no date was given, which cost a whole human turn. "Please summarize my overall ledger behavior." now returns the 10-break summary on the first turn, 8.9 s end to end. Investigate path unchanged. | `src/console/refine.js`, `src/console/server.js` (`refineChat`) |

### Next — ranked by value

| # | Idea | Why it helps | Cost / risk |
|---|---|---|---|
| 1 | **Collapse LLM turns.** Step one is in `instructions.md` (18 Sep evening, **not yet pushed with `setup:agent` or measured**): `break_delta`, `evidence_rows` and `trace_failure_point` in one first turn, so 4 calls become 3. Step two, still open: the console already has `break_delta` (prefetch, done), so it could hand the result to the agent in the input and the agent would call `evidence_rows` + `trace_failure_point` + `similar_cases` in one batch, then write: 2 calls. | From the measured timeline, step one removes one ~3.5 s turn; step two removes a second ~6 s turn. Neither touches the 16.6 s start or the 15 s report. | Step two changes the story: `break_delta` no longer appears as an agent tool call in the Kibana trace, and the page must add the prefetched row to `state.facts`. Precedent queries get slightly less specific. **Testable**: `npm run verify` scores precedent-at-rank-1 for all five break types. |
| 2 | **Bedrock with a faster model.** Moves inference to your own AWS quota and likely cuts both the 16.6s start and the 15s report. | Hits both ends of the timeline, scores the AWS rubric box, and **sidesteps the Elastic Managed LLM rate limit**. | Needs AWS credentials + Bedrock model access (approval delay outside your control). `setup:agent` already creates the endpoint. |
| 3 | **Template the mechanical report sections.** Figures, Evidence and Pipeline are pure formatting of tool output. Only Root cause, Recommended action and Confidence need reasoning. | Cuts output tokens by roughly 60%, taking a big bite out of the final 15s. `mockConverse()` already builds this template. | **Tension worth deciding deliberately:** the traceability check is compelling *because* the model produced the numbers and the checker found nothing wrong. Template them and the check is trivially 100% — structurally safer, weaker as a demo moment. |
| 4 | **Trim the prompt prefix.** Estimated ~15,000 static tokens per call (see below), measured with six tool definitions. Since 18 Sep there are ten (five ES|QL, five workflow actions) and `instructions.md` grew by the action table, so the prefix is larger now; **not yet re-measured**. | Shaves every turn, not just the first. | Do not over-trim `instructions.md` — it is what enforces the no-numbers rule and the approval gate. |

### Measure before optimizing further

The 16.6s of dead air is **not** cold start — three runs gave 16.5s, 16.6s and 15.2s. It is
reproducible and structural, so "warm the model before the demo" will not fix it.

What is in that window is currently an estimate, not a fact. `input_tokens` was 69,163 with
`cached_input_tokens` 46,288 across 4 calls; working backwards from three cache reads puts the
static prefix at roughly **15,000 tokens**. That points at prefill + managed-LLM queueing, but it
has not been confirmed.

Three cheap tests would settle it:

1. Raw `/_inference/chat_completion/<connector>` call with a 10-token prompt → isolates pure LLM
   service latency. If that alone is 8s, the prompt is not the problem.
2. A throwaway agent with one tool and two lines of instructions → isolates the cost of prefix size.
3. The same investigation twice in one conversation → measures how much the prompt cache actually saves.

---

## Track B — Elasticsearch latency (the scale problem)

Nothing in this section is slow today. The indexed dataset on the current project is 3,569 recon docs /
5,980 spans / 84 resolved cases (indexed twice, see ingest). The generated dataset since 18 Sep evening is
44710 recon docs / 74721 spans / 84 cases (5,000 disbursals a day, same 10 demo-day
breaks), **not yet ingested anywhere**; re-measure `list_breaks` and `similar_cases` after `npm run ingest`
on the new project. These are the changes that would matter at production volume, and several double as good
answers to "how does this scale?"

**Sharding is not on this list on purpose.** At this size one shard is correct; more shards would
add fan-out overhead and make queries slower. Elastic Cloud Serverless manages shards anyway, so
there is no `number_of_shards` to tune. At real volume the lever is time-partitioned data streams
by `business_date`, not manual sharding.

### 1. Ingest

| Technique | Fits where | Status |
|---|---|---|
| **Bulk API instead of single-doc requests** | `bulkLoad()` in `src/ingest.js` | **DONE.** Already uses `_bulk`. |
| **Batch size 5,000–15,000 docs** | `chunk = 2000` in `src/ingest.js` | **DONE (18 Sep evening), not yet timed.** 2,000 per request: about 60 requests for the 5,000-a-day dataset instead of 240. |
| **Retry only the rejected documents of a bulk batch** | `bulkLoad()` in `src/ingest.js` | **DONE (18 Sep evening).** The whole batch used to be re-sent on any error, which is how `ledgerlens-resolved-breaks` holds 168 docs for 84 cases on the current project. |
| **`refresh_interval: -1` during load, restore after** | `recreate()` in `src/ingest.js`; there is already a `_refresh` after load | **LATER.** Saves ~200 ms at this size. Genuinely useful at volume. |
| **`number_of_replicas: 0` during load** | — | **N/A.** Serverless manages replicas; not settable. |
| **Avoid heavy ingest scripts / Painless** | — | **DONE.** No ingest pipelines at all — every transformation happens client-side in `src/generate.js`. Already the recommended posture. |

### 2. Mapping

| Technique | Fits where | Status |
|---|---|---|
| **Explicit mappings, no dynamic mapping** | all four files in `elastic/mappings/` | **DONE, and stricter than the advice.** Uses `dynamic: "strict"`, which *rejects* unknown fields rather than silently ignoring them. |
| **`keyword` for IDs, enums, aggregation/sort fields; `text` only for prose** | `elastic/mappings/ledgerlens-recon.json` and the rest | **DONE.** Every identifier, code and business date is `keyword`; money is `long` (integer paise); only `description` / `narration` / `summary` are `text`. Documented in each file's `_meta`. |
| **`constant_keyword` for static filters** | — | **N/A, and worth being able to explain.** `source` has only two values but both appear in the same index — `constant_keyword` is for one value *per index*. Splitting by source would break the single-`STATS` no-join match, which is the whole design. |
| **Disable `norms` on strings that never need length-based scoring** | `description`, `narration` in `ledgerlens-recon` | **LATER.** Better still: `index: false` on those two, since search happens on `ledgerlens-resolved-breaks`. Keep norms on `summary` there — BM25 scoring is the point. |
| **Disable `_source` / `enabled: false`** | — | **DO NOT.** The report cites evidence rows verbatim; `_source` is load-bearing for traceability. |
| **`dynamic: false` on objects** | — | **N/A.** `strict` is already stronger. |
| **Index sorting by the main access-pattern field** | `elastic/mappings/*.json` + `recreate()` in `src/ingest.js` | **LATER.** Every hot query filters or groups by `disbursal_id`. `index.sort.field: ["disbursal_id"]` colocates one disbursal's events physically. No measurable gain at 3,574 docs; real at 100M. Must be set at index creation, so it needs a reindex (seconds here). |

### 3. Querying

| Technique | Fits where | Status |
|---|---|---|
| **Filter context over query context** | — | **Mostly N/A.** ES|QL does not expose the Query DSL filter/query split; `WHERE` compiles down. Scoring is used deliberately in `similar_cases` (`MATCH` + `FUSE`), where it is wanted. |
| **Avoid `wildcard` / `regexp` / leading wildcards** | all five `elastic/tools/*.esql` | **DONE.** No wildcards anywhere. Every lookup is an exact `==` on a `keyword` field. |
| **`search_after` / PIT instead of deep pagination** | `LIMIT 200` in `list_breaks`, `LIMIT 50` in `evidence_rows` / `trace_failure_point` | **N/A now, LATER at volume.** No deep pagination exists. A day with more than 200 breaks would truncate `list_breaks`. |
| **`_profile` API to find where latency accumulates** | `src/verify.js` already records ES|QL `took` | **LATER.** `took` is enough while queries are 6–55 ms. Reach for `_profile` when one gets slow. |
| **Force-merge read-only / time-based indices** | — | **N/A now.** Serverless manages merging. At volume with per-day indices, force-merging closed days is the standard move. |
| **Run independent queries in parallel** | `summary()` in `src/console/server.js` | **DONE.** The day totals and the break queue now run under `Promise.all` instead of sequentially — the page waits for `max(a, b)` rather than `a + b`. ~100 ms saved per page load (measured 114 ms and 155 ms). |

---

## Quick reference: which knob for which symptom

| Symptom | Track | Look at |
|---|---|---|
| Long wait before anything appears on screen | A | Prefetch `break_delta` (done: the verdict card), Bedrock (#2) |
| Report takes a long time to finish writing | A | Faster model (#2), template mechanical sections (#3) |
| Too many LLM round trips | A | Collapse to 2 turns (#1) |
| Rate limited by Elastic Managed LLM | A | Bedrock (#2) — moves inference to your own AWS quota |
| Break queue / page load feels slow | B | Already parallelized; check ES|QL `took` in `/api/summary` |
| A single ES|QL query got slow | B | `_profile`, then index sorting |
| Ingest takes too long | B | Bulk batch size, `refresh_interval: -1` |
