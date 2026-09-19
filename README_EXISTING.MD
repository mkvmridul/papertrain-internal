# LedgerLens

**An explainable reconciliation-break investigation agent for lending and payments operations, built on Elastic Agent Builder.**

> The model explains. ES|QL decides. Every number is traceable.

Forge the Future 2026 · Elastic × AWS · Track 4: Industry Vertical Demo (BFSI)

---

## The problem

Three systems must agree about every disbursal: the event-sourced **ledger**, the partner's **settlement file**, and the **pipeline traces** that pushed the funds. When they disagree, that is a reconciliation break: a disbursal marked success with no credit in the bank file, a double debit, a fee mismatch, a late credit. Today an analyst investigates each one by hand, pulling entries from three systems and writing a root cause. It takes 30 to 60 minutes per break (the builder's own estimate from operating this class of system in production, not a benchmark), does not scale on high-volume days, and the write-up is only as trustworthy as one tired human at 11pm.

## What LedgerLens does

1. **Matches** a day's ledger against the settlement file with one ES|QL `STATS ... BY disbursal_id` over a unified index. No join, no application code. 391 disbursals in 55 ms median ES|QL time on a local Elasticsearch 9.5.4 (see [BENCHMARKS.md](BENCHMARKS.md), regenerated on the cloud project on the 18th).
2. **Classifies** each break with an ES|QL `CASE` rule table: `MISSING_CREDIT`, `DOUBLE_DEBIT`, `FEE_MISMATCH`, `TIMING_T1`, or `UNRESOLVED` when no rule explains it.
3. **Investigates** one break with an Agent Builder agent that calls five ES|QL tools: exact figures and rule first, then evidence rows and the failing span in the pipeline trace together in the same turn (neither depends on the other), then a hybrid-search precedent from past resolved cases.
4. **Reports** in a fixed audit-ready format. Every amount and identifier is copied verbatim from a tool result. The console checks this live and highlights each figure to the tool it came from.
5. **Acts**, behind a human. On "approve", an Elastic Workflow opens a Kibana case and writes an append-only audit record. The agent cannot do this on its own.

When the rules do not explain a break, the agent says so, lists what it ruled out, and escalates. It does not guess.

## Architecture

```mermaid
flowchart LR
  G[src/generate.js<br/>synthetic ledger, settlement rows,<br/>APM-shaped spans, resolved cases] -->|npm run ingest| ES

  subgraph ES[Elasticsearch · Elastic Cloud Serverless on AWS]
    R[(ledgerlens-recon<br/>ledger events + settlement rows)]
    T[(ledgerlens-traces<br/>pipeline spans)]
    L[(ledgerlens-resolved-breaks<br/>text + semantic_text)]
    A[(ledgerlens-audit)]
  end

  subgraph TOOLS[ES|QL tools · deterministic]
    T1[list_breaks<br/>STATS BY disbursal_id]
    T2[break_delta<br/>figures + CASE rule table]
    T3[evidence_rows]
    T4[trace_failure_point]
    T5[similar_cases<br/>FORK BM25 + semantic · FUSE RRF]
  end

  ES --> TOOLS
  TOOLS --> AB[Elastic Agent Builder<br/>orders tools, narrates, never computes<br/>trace waterfall per run]
  AB -->|after human approval| WF[Elastic Workflow<br/>cases.createCase + audit record]
  WF --> A
  WF --> K[Kibana Cases]
  AB --> UI[Ops console<br/>break queue · report · traceability check<br/>approve / dismiss · Sarvam Hindi/Kannada]
  LLM[Elastic Managed LLM<br/>or Amazon Bedrock inference endpoint] -.-> AB
```

### The trust design

- **All money math lives in ES|QL.** `elastic/tools/*.esql` are the only places an amount, delta, count or classification is computed. The agent's instructions forbid computing, rounding or converting; it may only add ₹ and thousands separators.
- **Every figure is traceable.** `src/console/traceability.js` extracts every number and identifier from the tool results of a conversation and checks each amount and ID in the report against them. The page shows `N / N traced`; an invented figure would show red.
- **Actions are gated.** The only write the agent can perform is the `ledgerlens.open_case` workflow tool, and only after the user types approve. The workflow itself computes nothing: every field is passed through.
- **Honest uncertainty.** `UNRESOLVED` is a first-class outcome with its own rule (`R5`) and its own report behaviour.

### Elastic and partner capabilities used

| Capability | How it is used here |
|---|---|
| Elasticsearch mappings | Three indices with `dynamic: strict`. Identifiers, codes and business dates are `keyword`; money is integer paise (`long`); only human narration is `text`. See `elastic/mappings/`. |
| ES|QL | Unified-index match with `STATS ... BY disbursal_id`, classification with a `CASE` rule table, parameterised `?name` placeholders shared by Agent Builder tools and the verify script. |
| Hybrid search | `ledgerlens.similar_cases` is one query: `FORK` a BM25 branch on `summary` and a semantic branch on `summary_semantic` (`semantic_text`, embedded by Elastic at index and query time), then `FUSE` with reciprocal rank fusion. Verified on 9.5.4. If the cloud project rejects `FORK`/`FUSE`, `setup:agent` falls back to Agent Builder's built-in `index_search` tool over the same index (hybrid retrieval, managed by Elastic) and says so in its output; section 6 of `npm run verify` reports which path works. |
| Agent Builder | Six tools (five `esql`, one `workflow`), one agent with the instructions in `elastic/agent/instructions.md`, created through the Kibana API by `src/setup-agent.js`. The per-run trace waterfall is the explainability artefact shown on stage. |
| Elastic Workflows + Cases | `elastic/workflows/ledgerlens-open-case.yaml`: `cases.createCase` then `elasticsearch.request` to write the audit record, exposed to the agent as a tool. |
| AWS | Runs on Elastic Cloud Serverless on AWS. With AWS credentials in `.env`, `setup:agent` creates an Amazon Bedrock `chat_completion` inference endpoint (`ledgerlens-bedrock`) and the console converses through it. Without them, the project's Elastic Managed LLM is used. |
| Sarvam | `sarvam-translate:v1` renders the report in Hindi or Kannada from the console; the traceability check re-runs on the translation. Optional, needs `SARVAM_API_KEY`. |

## Measured

From `npm run verify:report` against a local Elasticsearch 9.5.4; the verbatim output is committed as [BENCHMARKS.md](BENCHMARKS.md) and `data/answer-key.json` is the ground truth. The same command is re-run on the cloud project on the 18th and the file updated.

| What | Result |
|---|---|
| Seeded breaks detected by `ledgerlens.list_breaks` | 14 / 14 across 3 business days, 0 false positives over 1,175 successful disbursals |
| Per-break figures and classification (`ledgerlens.break_delta`) | 14 / 14 exact: break type, settlement rows, ledger, settled, delta, fee delta, UTRs |
| Failure point in the trace (`ledgerlens.trace_failure_point`) | 14 / 14: the seeded failing spans surface first; clean pipelines report clean |
| Precedent retrieval (`ledgerlens.similar_cases`, hybrid) | Same-type precedent at rank 1 for all 5 break types |
| ES|QL latency (median `took`, this run) | match 55 ms · delta 10 ms · trace 6 ms · hybrid 22 ms |
| Figures in a report traced to a tool result | 12 / 12 on the mock report; live reports show their own `N / N` |
| Numbers computed by the LLM | 0, by construction |

Investigation wall-clock is measured live in the console header. The manual baseline of 30 to 60 minutes per break is the builder's own estimate from operating this class of system in production, not a benchmark.

## Run it

Prerequisites: Node 20.6+, an Elastic Cloud Serverless project (Observability type gives Agent Builder, Workflows and Cases in one place) and an API key for it. No npm dependencies.

```bash
cp .env.example .env      # fill ES_URL, ES_API_KEY, KIBANA_URL (and optionally AWS_*, SARVAM_API_KEY)
npm run generate          # data/*.ndjson + data/answer-key.json (deterministic)
npm test                  # generator invariants + traceability checker, no cluster needed
npm run ingest            # create the four indices with explicit mappings, bulk load
npm run verify            # run every ES|QL tool against the answer key, print the scorecard
npm run verify:report     # same, and write the output to BENCHMARKS.md
npm run setup:agent       # workflow, tools, agent in Kibana, plus a smoke test through Agent Builder
npm run console           # http://localhost:3000
```

Or `npm run all` for the middle four. Open the agent directly in Kibana at `/app/agent_builder` and type `Investigate DSB-20260916-00297.`

To develop the console without a model, set `AGENT_MODE=mock`. The page shows a red MOCK banner and the report template is filled from the same ES|QL tools. Never demo in mock mode.

## Repository map

```
src/generate.js                 synthetic data generator and answer key (the data source; see DATA.md)
src/ingest.js                   create indices from elastic/mappings, bulk load data/
src/verify.js                   run the ES|QL tools against the answer key, print the numbers above
src/setup-agent.js              create/update workflow, tools, agent in Kibana; smoke test
src/es.js                       the only HTTP code: es(), kbn(), esql()
src/console/server.js           zero-dependency console server (proxies Agent Builder, Workflows, Sarvam)
src/console/index.html          the ops console
src/console/traceability.js     the figure/ID traceability checker (browser + tests)
elastic/mappings/*.json         index mappings with _meta explaining each decision
elastic/tools/*.esql            the five ES|QL tools, runnable verbatim; tools.json holds descriptions and params
elastic/agent/instructions.md   the agent's instructions
elastic/workflows/*.yaml        the open-case workflow
data/                           generated data and answer key
tests/                          node:test suites
presentation/                   the deck
DATA.md                         provenance: what is synthetic (everything), how it was generated, the break catalogue
DEMO.md                         run of show, prompts, fallbacks, expected questions
BENCHMARKS.md                   verbatim verify output; the source of every number quoted above
OPTIMIZATION.md                 where latency actually goes: LLM vs Elasticsearch, done vs open
CHANGELOG.md                    notable changes, with the reasoning and the measurements
PRIOR_WORK.md                   what existed before build day, file by file
```

## Scope and honesty

**Real:** the data model, mappings, ES|QL match and classification, the five tools, the agent, the workflow that creates a Kibana case and audit record, the console, the traceability check, the verify scorecard.

**Synthetic by design:** all data. Spans are generated in APM/ECS shape rather than captured by an APM agent; the ES|QL would run unchanged against `traces-apm-*`. Partner files are loaded directly rather than through S3 and Lambda.

**Stubbed or conditional:** the S3 → Lambda ingest named in the original submission is not implemented (files are bulk-loaded by `src/ingest.js`). The narration model is Amazon Bedrock through an Elasticsearch inference endpoint when AWS credentials are present, otherwise the project's Elastic Managed LLM; the console header shows which one is live. Sarvam translation runs only with `SARVAM_API_KEY`; without it the buttons are hidden. If `FORK`/`FUSE` is unavailable, precedent search uses the `index_search` fallback. `AGENT_MODE=mock` is a development mode and is never used for the demo.

**Out of scope on purpose:** live bank or PSP connections, and any movement of funds. Every write stays behind human approval, which is the correct posture for regulated money movement.

**What existed before 18 September 2026:** see [PRIOR_WORK.md](PRIOR_WORK.md) for the file-by-file list. In short: the generator, mappings, ES|QL tools, agent instructions, workflow YAML, console, tests and deck were drafted beforehand and verified against a local Elasticsearch 9.5.4 + Kibana. On the 18th: connection to the cloud project, agent tuning against the real model, the recorded demo, and the final numbers. The git history tells the same story.
