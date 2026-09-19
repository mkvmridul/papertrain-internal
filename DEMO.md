# Demo script

Five to seven minutes. Two slides, then the product, then two slides. Rehearse standing, out loud, with a timer.

## Before you walk on

- [ ] Elastic Cloud project up. `npm run verify:report` prints `all checks passed` and rewrites BENCHMARKS.md. Then update the three places that quote its numbers: the README "Measured" table, slides 4 and 5 (`presentation/build-deck.js`, rebuild), and the 1:00 line below. `npm run setup:agent` prints the smoke line.
- [ ] Console running: `npm run console` → http://localhost:3000 shows 391 disbursals and 10 breaks for 2026-09-16.
- [ ] Kibana open in a second tab at `/app/agent_builder`, agent **LedgerLens** selected, an empty conversation.
- [ ] One full investigation already run once today (warms the inference endpoint and the model).
- [ ] The recorded demo video is in the repo and you know the timestamp of the approval moment.
- [ ] Phone hotspot ready if venue wifi dies.

## Run of show

| Time | What you show | What you say |
|---|---|---|
| 0:00 | Slide 1 | "Three systems must agree about money: the ledger, the bank's settlement file, and the pipeline that pushed the funds. When they disagree, an analyst spends thirty to sixty minutes per break, by hand. That is my own number from running this in production. And the write-up is only as good as one tired human at 11pm." |
| 0:30 | Slide 2 | "Rules match or they don't. Chat can explain, but you can't sign off on a number a language model produced. LedgerLens splits the job: ES|QL computes every figure, the model only orders the investigation and explains. Then a workflow acts, behind a human." |
| 1:00 | Console, break queue | "This is a settlement day. 391 disbursals, ₹9.6 crore. One ES|QL query matched ledger against the settlement file in under sixty milliseconds and flagged ten. No join, no application code." Point at the top tile: figures computed by the LLM: 0. |
| 1:30 | Click `DSB-20260916-00297` (MISSING_CREDIT) | "Investigate." The verdict card lands at once: "ES|QL decided this in ten milliseconds: rule R1, booked as success, nothing settled. The model has not said a word yet. Now watch it work out *why*." Then, while it runs: "The agent is calling five tools — two of them together in the same turn, because neither depends on the other's result. Watch the list on top." |
| 2:00 | Report appears | Read the rule that fired and the figures. "₹51,500 booked as success, ₹0 settled. Every green figure is highlighted because it appears verbatim in a tool result. 12 of 12." Scroll to Pipeline: "Here is *why*: the ledger booked success on the PSP's ACCEPTED, then the callback timed out and the status poll said the beneficiary account was invalid. Money never left." Precedent: "The library found the same failure resolved on the 14th." |
| 2:45 | Kibana tab, the conversation | "This is the Agent Builder trace. Five tool calls, each with its ES|QL and its rows. The model wrote prose. It computed nothing." |
| 3:15 | Back to console, click `DSB-20260916-00112` (UNRESOLVED) | "One honest failure. ₹1,000 short, one row, correct fee, clean pipeline. No rule matches. The agent says so, lists what it ruled out, and escalates. It does not guess." |
| 3:45 | Back to the first break, read the **Draft message**, click **Approve → open case** | "Now the action. Five workflows, one per break type: a missing credit opens a case, a double debit raises a reversal with the partner, a fee mismatch goes to the dispute register, a timing break closes itself, an unresolved one escalates. The agent picks the action and drafts the message; a human approves; the workflow runs and writes an audit record. The agent cannot do this on its own." Show the audit line with the case id. Optionally open Cases in Kibana. If there is time, approve the `DOUBLE_DEBIT` break too: the button reads "raise reversal with" the partner and the audit line names the UTR to reverse. |
| 4:15 | If Sarvam is configured: click **हिन्दी** | "Same report through Sarvam for an ops team that reads Hindi. The checker re-runs: the IDs and figures survived translation." |
| 4:30 | Slide 3, architecture | Walk the boxes left to right, one sentence each. Land on hybrid search: "Precedent retrieval is one ES|QL query: a BM25 branch and a semantic branch, fused with RRF. Exact IDs and fuzzy human descriptions in one search API." |
| 5:00 | Slide 4, the numbers | The measured numbers, and what production needs. Stop talking. |

The line to land, said once, slowly: **The model explains. ES|QL decides. Every number is traceable.**

## Prompts to type in Kibana if you demo from the Agent Builder chat instead of the console

```
List the reconciliation breaks for 2026-09-16.
Investigate DSB-20260916-00297.
Investigate DSB-20260916-00112.
Approve.
```

## Fallbacks

| If | Do |
|---|---|
| Venue wifi is dead | Hotspot. If still dead, play the recorded video from the repo and narrate over it. |
| The LLM is slow or errors | Demo from the Kibana Agent Builder chat directly (same agent, same tools). If the model is down entirely, show `npm run verify` output live and the recorded video. |
| A workflow tool misbehaves | Set `CASE_MODE=direct` in `.env`, restart the console. Approve then runs the workflow for the break's type through the Workflows API instead of through the agent, with the figures from `break_delta` and the message lifted from the report's Draft message. |
| Cases app missing in the project | The workflow still writes the audit record; say so. The case is a Kibana convenience, the audit index is the record of action. |
| Someone asks to see a break you did not rehearse | The queue has ten. Pick one with `DOUBLE_DEBIT`: the trace shows the 504 and the retry without an idempotency key. |

## Questions you will get

**What can it actually do?** Five actions, one per break type, each an Elastic Workflow exposed to the agent as a tool: open a case, raise a reversal with the partner, log a fee dispute, close a timing break as self-clearing, escalate an unresolved one. The agent picks the one that matches the rule that fired and drafts the message it carries; nothing runs until a human types approve; every run writes an append-only audit record, and three of the five also open a Kibana case. Automated movement of funds is out of scope on purpose.

**How is this different from a rules engine?** The rules *are* the classifier, on purpose. What the rules cannot do is read a trace, find a precedent, write a root cause a compliance reviewer can sign, and take a gated action. That is the agent's job, and the split is what makes the numbers trustworthy.

**Why not let the model compute the delta?** Because then no one can sign off on it. An amount that came out of a language model is an opinion. An amount that came out of `STATS SUM(...) BY disbursal_id` is a fact with a query attached.

**Explain your search.** Three indices, strict mappings, keyword for every identifier and code, text only for human narration. The match is a single `STATS ... BY disbursal_id` over a unified index, no join. Precedent retrieval is hybrid: `FORK` a BM25 branch and a semantic branch on a `semantic_text` field, `FUSE` with reciprocal rank fusion, one query. Elastic embeds at index and query time; there is no embedding code in the repo.

**What did you build before today?** The generator, mappings, ES|QL tools, agent instructions, workflow YAML, console and deck were drafted before the 18th and are in the repo history. On the 18th we connected it to the cloud project, tuned the agent against the real model, recorded the video and finished the README. The repo tells that story.

**What would production need?** Real APM instrumentation (the ES|QL is already ECS-shaped), S3 → Lambda ingest of partner files, the LLM through a Bedrock inference endpoint under your AWS account, RBAC on the workflow, and reversal workflows behind a second approval.

**What is the manual time you quote?** My own estimate from operating this class of system in production: thirty to sixty minutes per break. It is not a benchmark and I say so on the slide. The agent's time is measured live on screen, and the ES|QL timings are in BENCHMARKS.md.

## Copying into the team repository on the 18th

Copy everything **except**: `context.md`, `CLAUDE.md`, `CLAUDE.local.md`, `resources/`, `.claude/`, `.env`. Those are working notes and credentials, not part of the submission.
