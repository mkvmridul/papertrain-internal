# Changelog

Notable changes to LedgerLens, with the reasoning behind each one. Format: what changed, why, existing approach vs new approach. Newest first.

## 2026-09-19 — Console: no horizontal overflow at laptop widths

Changes `src/console/index.html` only: CSS, the header markup, and one line in `init()`. No change to the server, tools, data or tests.

**Why:** the page scrolled sideways on any window narrower than about 1365px, and the break queue's right-hand columns were cut off. Measured in headless Chrome against the running console: the header needed 1365px because its eight items sat on one non-wrapping flex line, and the queue table needed 817px while its panel was 442px (1440px window, drawer open, two columns) to 798px (1280px window, drawer open, one column). The chat drawer opens by default on windows 1081px and wider, so this was the first view on a 1280 or 1440 laptop.

**Existing approach:** one flex line in the header at a fixed 60px height. Two columns from 1081px up (with the drawer open, from 1376px up), with the queue column allowed down to 420px while its table is 817px wide, so the table was clipped inside `.scroll` and the scrollbar only appeared on hover.

**New approach:**
- Header: two groups, `.brand` (title and mode badge) and `.controls` (date, chat toggle, theme, History, Kibana). The header wraps, so on a narrow window the controls drop to a second line, right-aligned. `min-height: 60px` keeps the one-line case identical to before. The mode badge truncates with an ellipsis only when the brand alone is wider than the header, and carries its full text in `title`.
- Queue: cell padding 12px → 9px on each side, so the table is 775px. The queue column's floor is 780px, so the table is never clipped in a two-column layout. Two columns need 780 + 16 + 460 + 40 = 1296px, so the panels stack below 1296px, and with the drawer open below 1756px. On a 1440 or 1512 laptop: drawer closed → two columns; drawer open → one column, queue above investigation.
- `.evidence`: `overflow: hidden` → `auto`, so the evidence table scrolls inside its box instead of being clipped when the investigation panel is narrow (602px at 1440 with two columns).
- `.note`: `overflow-wrap: anywhere`, so a long unbroken error string (seen: the 403 JSON from Bedrock) wraps inside the red note instead of running past its edge.

**Verified:** `npm test` 26/26; `node --check` on the page's module script. Headless Chrome over the DevTools protocol against the console on port 3999 with the live summary for 2026-09-16, measuring `documentElement.scrollWidth` against the viewport, elements extending past the viewport, and containers that scroll horizontally. Drawer open at 1024, 1280, 1440, 1512, 1755 and 1756: no page overflow, no clipped or scrolling container; the 775px table sits in a 798px panel at 1280; 1756 gives two columns (778/478) and 1755 one. Drawer closed at 1440 (two columns 778/602, after clicking a row) and 1512 (778/674): no overflow. At 756 (the harness's fallback width) no page overflow, header on two lines, queue scrolls inside its panel as intended.

**Not verified:** the 1295/1296 breakpoint edge and 1280 with the drawer closed (the harness dropped to a 756px viewport whenever the drawer was closed by click; the arithmetic is the verified 1755/1756 edge minus the 460px drawer). The investigation report at the narrower 602px panel: the one investigation run returned 403 from Bedrock (invalid security token), so only the error note rendered.

## 2026-09-18 (evening) — Demo latency: the ES|QL half on screen in one round trip, a live status bar, a 5,000-a-day dataset

Changes `src/console/server.js` (`/api/break` only), `src/console/index.html`, `elastic/agent/instructions.md`, `src/generate.js`, `src/ingest.js` and the generated files in `data/`. No change to the ES|QL tools, mappings, workflows, `actions.js`, `traceability.js` or `refine.js`. Nothing was sent to the cloud project: the data and the instruction change reach a project only when `npm run all` (or `ingest` / `setup:agent`) runs against it. The running console serves the page from disk, so a refresh picks up the page; the server change needs a restart.

**Why:** OPTIMIZATION.md puts about 16.6 s of dead air before the first tool call and about 15 s of report generation inside the Elastic Managed LLM path, and the demo stays on Agent Builder, so the console cannot shorten either. What it can do is make the wait show work. Measured tonight through the running console: every call to the project costs about 250 ms of network on top of 8 to 55 ms of ES|QL (`/api/break` 272 ms wall for a 13 ms query; `/api/summary` 315 ms wall; the Kibana host is in `us-central1`). On the page the lever is the number of sequential round trips, not the query time.

**Existing approach:** on click the page ran `break_delta` alone and showed a verdict card; a one-line status said "The agent is starting…" until the first stream event; every SSE event rebuilt the whole panel, which restarted the verdict card's fade-in on each text chunk; the chat drawer ignored the rewritten question the server already sent.

**New approach:**
- `GET /api/break` runs `break_delta`, `evidence_rows` and `trace_failure_point` in parallel, one round trip, and returns all three with their `took` (`row` and `took` keep their old meaning). The page paints the ES|QL half of the investigation as one card: verdict and rule, figures, the evidence table, the pipeline failure point or "All n spans succeeded", each section labelled with its tool and its ES|QL time. Display only, as before: `state.facts` still comes from the agent's own tool results, so the report has to earn every figure itself.
- The streaming panel is mounted once per investigation and patched region by region. At the top, a status bar with five phase chips (Figures, Evidence, Pipeline, Precedent, Report) that tick as each tool result arrives, a clock that runs from the click until the report lands, and a one-line hint. Then the trace, then the card, then the live text. A text chunk updates only the text region, so nothing else re-animates. Once all four tools have returned and the report itself is streaming, the card hides and the report's own sections take its place.
- `elastic/agent/instructions.md`: the first turn calls `break_delta`, `evidence_rows` and `trace_failure_point` together (all three take only the id); `similar_cases` keeps its own turn after them, because its query is written from their results. Three LLM calls per investigation instead of four. **Takes effect only after `npm run setup:agent`, which was not run tonight.**
- Chat drawer: the `input_refined` stream event, and `refined_input` on the blocking route, show as a muted "Clarified for the agent: …" line between the question and the reply. It uses a new `note` role so it does not reset the traceability scope the way a `system` line does.
- Dataset: `DISBURSALS_PER_DAY` 400 → 5,000 in `src/generate.js`; span ids widened from 8 to 16 hex characters (one collision at 75k spans, and 16 is the APM `span.id` length); the resolved library's historical ids use the same constant. Regenerated: 44710 recon docs, 74721 spans, 84 cases, 14 seeded breaks, still 10 on the demo day. Demo-day ids changed: `DSB-20260916-00603` MISSING_CREDIT, `DSB-20260916-01310` TIMING_T1, `DSB-20260916-01624` TIMING_T1, `DSB-20260916-02601` UNRESOLVED, `DSB-20260916-02632` DOUBLE_DEBIT, `DSB-20260916-02781` DOUBLE_DEBIT, `DSB-20260916-02872` MISSING_CREDIT, `DSB-20260916-03050` FEE_MISMATCH, `DSB-20260916-03582` MISSING_CREDIT, `DSB-20260916-04312` FEE_MISMATCH.
- `src/ingest.js`: 2,000-document bulk batches (was 500), and a retry re-sends only the documents the cluster rejected. The whole batch used to be re-sent, which is how `ledgerlens-resolved-breaks` came to hold 168 documents for 84 cases on the current project.

**Verified:** `npm test` 26/26, including the generator invariants at 5,000 a day. `node --check` on `server.js`, `ingest.js` and the page's module script. Read-only against the cloud project through a mock-mode instance on port 3001: `/api/break` returns the three tools in 0.27 s wall (ES|QL 8 to 37 ms each; first call 0.93 s cold). The page was driven in Chrome against a scratchpad harness that serves the real `index.html` and `traceability.js`, canned tool rows captured from that instance, and a synthetic Agent Builder-shaped SSE stream on the measured timeline, slowed 2.5× to observe it: the card painted once and its DOM node survived every chunk; the chips went 0/5 → 3/5 → 4/5 → Report; the clock ran and stopped at `round_complete`; the card hid when the report began streaming; the final view read 12/12 and 18/18 traced on the two canned runs with the right approve label; the "Clarified for the agent" line rendered; no console errors. With no canned run the stream returned 500, the blocking fallback 500, and the page rendered the failure note as before.

**Not verified, needs a cluster:** ingest and `npm run verify` at 5,000 a day (nothing was ingested tonight); the agent following the three-tool first turn (needs `setup:agent`, then one investigation per break type); DEMO.md, BENCHMARKS.md and DATA.md still quote the previous dataset's ids and counts until `verify:report` reruns.

## 2026-09-18 — History console served from the main console's port

`src/console/history-server.js` now exports `handleHistory(req, res, url)` and `src/console/server.js` calls it before its own 404, so one process on port 3000 serves both consoles. The history page lives at `/history`; its API stays under `/api/h/`. The header badge in `index.html` points at `/history` and the back link in `history.html` at `/`. No route, query or view in the history console changed.

**Why:** the history console listened on its own port (3100) and had to be started by hand with no npm script. The main console's "History" badge linked to a port that was usually not running.

**Existing approach:** two servers, two ports, two commands.

**New approach:** the history file keeps everything it had and adds one exported handler that returns true when it answered. Standalone use still works: `node --env-file=.env src/console/history-server.js` listens on `HISTORY_PORT` (default 3100) only when the file is the entry point, so importing it starts nothing.

**Verified:** `npm test` 26/26. On port 3000: `/`, `/history`, `/api/config`, the six `/api/h/*` routes, the 400 on a bad `disbursal_id`, the 404 on an unknown path, and the 405 on a POST to a history route. Standalone on 3100: `/`, `/history` and `/api/h/config` answer 200.

## 2026-09-18 — Console chat: rewrite the question before the agent sees it

New `src/console/refine.js` and `tests/refine.test.js`. `src/console/server.js` changes only the two chat routes (`/api/chat`, `/api/chat/stream`); `src/console/index.html` changes only the two chat request bodies. No change to the agent, tools, workflows, indices, or the Investigate path.

**Observed:** in the chat drawer, "Please summarize my overall ledger behavior." got back a list of clarifying questions ("Which business date? What aspect?") instead of an answer. The chat sent the model only the typed text. It never had the console's business date, and `instructions.md` tells it to call `ledgerlens.list_breaks` "with that date", so it asked for one.

**Existing approach:** the typed text was forwarded to the agent as it was.

**New approach:** `refineChat()` makes one Anthropic Messages call (the same `ANTHROPIC_*` settings as the local loop, temperature 0, 300 tokens) that rewrites the message into a precise instruction. Its system prompt carries the console's business date, the selected disbursal, the five tool names with their parameters, and the break types. Its rules: keep the analyst's intent, copy every identifier and figure verbatim, do not answer, do not use approval words. The rewritten text is what the agent receives.

Guard rails, all in `refine.js` and covered by tests:
- Approvals, dismissals, `Investigate DSB-...` and messages under 8 characters are never rewritten, so the approval gate in the local loop reads exactly what the analyst typed.
- A rewrite is discarded when it contains an approval word the analyst did not write, drops a disbursal ID the analyst wrote, is empty, or is over 1,200 characters.
- Any model error falls back to the original text. Without `ANTHROPIC_API_KEY`, or in `CHAT_MODE=mock`, messages pass through unchanged.

The page now sends `business_date` (the date picker) and `active_disbursal` with each chat message. The blocking response carries `original_input`, `refined_input` and `refine_ms` when a rewrite happened; the stream emits an `input_refined` event before the agent's own events. The page ignores events it does not know, so nothing on it changed.

**Measured (18 Sep, `CHAT_MODE=local`, Haiku 4.5 via Bedrock Mantle, one run each):**
- The exact question above: rewritten in 1,968 ms to "Call ledgerlens.list_breaks on business date 2026-09-16 and summarize the results by break type and partner, quoting the tool's figures verbatim." The agent then called `list_breaks` once and returned the 10-break summary on the first turn. 8,919 ms end to end.
- "which partner has the most breaks?": rewritten in 1,113 ms; the stream began with `input_refined`, then the usual events.

**Verified:** `npm test` passes (26/26; 7 new). Both chat routes exercised against the running console.

**Not yet done:** the page does not show the rewritten question to the analyst. The `input_refined` event is there for it.

## 2026-09-18 — Console: a chat drawer for free-text turns with the agent

Changes `src/console/server.js` (one new route) and `src/console/index.html`. No change to the agent, tools, workflows, indices, `actions.js` or `traceability.js`.

**Why:** the console could only send the agent the turns the page composes itself: "Investigate <id>", "Approve", "Dismiss". An operator could not ask a follow-up ("what did you rule out?"), ask about a day in their own words, or approve by typing, without leaving for the Agent Builder chat in Kibana. context.md scoped the console as an ops console with embedded chat.

**Existing approach:** `POST /api/chat` served the approve and dismiss buttons only, blocking, with nowhere on the page to type.

**New approach:**
- `POST /api/chat/stream` (new): the same free-text turn as `/api/chat`, with an optional `conversation_id`, proxied from `converse/async` as Server-Sent Events exactly like `/api/investigate/stream`. Mock mode answers 409 and the page falls back to the blocking route, so the mock path never reaches a model.
- A "Chat" button in the header opens a drawer on the right (`<aside id="chat">`). On wide screens it pushes the console aside; between 1081 and 1375 px the console goes single-column while the drawer is open; below that it overlays. With the drawer closed, the existing layout is untouched.
- The drawer holds one Agent Builder conversation. When an investigation finishes on the page, `chatSync()` adopts that conversation and seeds the transcript with the "Investigate <id>." turn and the report, so a follow-up has the report as context. Approve and dismiss from the buttons are recorded in the transcript too (`chatRecord`). "New" starts a fresh conversation; the next investigation is adopted again.
- Every agent reply is checked with the same `traceability.js` functions: facts accumulate from every tool result in the conversation so far, each amount and ID in the reply is highlighted green or red, and an `N/N traced` chip sits under the bubble. Pipe tables, which the agent uses when listing a day, render as tables.
- Streaming shows tool calls as they are made and the text as it is written. If the stream never starts, the page retries on the blocking route; if it dies mid-way it shows an error and does not re-send, so "approve" cannot run twice.
- Suggested prompts: "List the reconciliation breaks for <date>." and "Investigate <first break>." on an empty transcript; two follow-ups once a report is on screen.

**Verified:** `npm test` 19/19; `node --check` on the server and on the page's module script; every element id the chat code touches exists once in the markup. Against the cloud project, through a test instance started with `LLM_CONNECTOR_ID=.anthropic-claude-5-sonnet-chat_completion` (the Elastic Managed connector; no file changed): a streamed "List the reconciliation breaks for 2026-09-16." called `ledgerlens.list_breaks` and returned the ten breaks as a table in 23 s; a streamed follow-up with that `conversation_id` answered from context with no new tool call in 14 s, quoting `DSB-20260916-00114` and ₹30,42,800.00, which match `/api/summary`. In mock mode the stream route answers 409, the blocking turn runs the four ES|QL tools, and a follow-up lands in the same conversation. The existing routes answered unchanged.

**Added the same afternoon: the agent loop in the console, and voice.**
- `AGENT_MODE=local` runs the agent loop in `server.js` instead of Agent Builder: Claude through the Anthropic Messages API (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_MODEL`, default `anthropic.claude-haiku-4-5` on the Bedrock endpoint in api_key.md), the same `instructions.md` as system prompt, the same five ES|QL tools executed with `esql()`, the five workflow tools behind a server-side gate: an action runs only in a turn whose user message contains an approval word, and only when its break type matches `ledgerlens.break_delta`. Tools the model calls together run in parallel. The loop emits the same SSE events as `converse/async`, so the investigation panel, the chat drawer and the traceability check work unchanged. Conversations are held in memory. Start it with `source api_key.md && AGENT_MODE=local npm run console`.
- Voice through Sarvam: `POST /api/speak` (bulbul:v3, markdown stripped, 1500 characters, language picked from the script) reads a chat reply aloud from a Listen button under the bubble; `POST /api/transcribe` (saarika:v2.5) turns a recording from the mic button into the question and sends it. Both appear only when `SARVAM_API_KEY` is set.

- Two modes, not one. `AGENT_MODE` governs the row-click investigation; `CHAT_MODE` governs the drawer and defaults to `local` whenever `ANTHROPIC_API_KEY` is set. So the investigation stays on Agent Builder while the chat thinks in our process. A chat follow-up on a conversation Agent Builder ran is seeded with that turn and report, so context carries over. With `LLM_PROVIDER=elastic` the console picks an Elastic Managed `.inference` connector for Agent Builder (Claude if present) and never selects the Bedrock inference endpoint; `LLM_CONNECTOR_ID` still overrides. Verified: investigation of `DSB-20260916-00039` through Agent Builder on `.anthropic-claude-5-sonnet-chat_completion`, four tools, full report, 41 s; seeded chat follow-up answered from the report in our loop.

**Verified (local mode, cloud project, Bedrock endpoint from api_key.md):** a streamed "List the reconciliation breaks for 2026-09-16." called `ledgerlens.list_breaks` and returned the ten breaks; a streamed investigation of `DSB-20260916-00039` called `break_delta`, then `evidence_rows` and `trace_failure_point` together, then `similar_cases`, and wrote the full fixed-format report; both finished within 19 s. `/api/speak` returned a wav clip for a report excerpt; `/api/transcribe` answered 200 with an empty transcript for silence and 400 for an empty body. `npm test` 19/19. Not verified: an approval through the local loop actually running a workflow, and the mic in a browser.

**Not verified:** the drawer clicked through in a browser. Headless Chrome loaded the page with the drawer in place: `init()` ran to the end (ten queue rows, breaks tile 10) and no script error was logged, so the module script and the chat wiring execute; the click paths themselves were reviewed against the markup, not exercised. Open the console and try it before the demo.

**Found on the way, not caused by this change:** with `.env` as it stands, every agent turn fails, the existing `/api/investigate/stream` included. The `ledgerlens-bedrock` inference endpoint answers `BedrockRuntimeException: The security token included in the request is invalid (403)`. The endpoint holds the AWS credentials it was created with. Either recreate it (delete `/_inference/chat_completion/ledgerlens-bedrock`, fix the AWS keys in `.env`, run `npm run setup:agent`) or demo on the Elastic Managed LLM by setting `LLM_CONNECTOR_ID=.anthropic-claude-5-sonnet-chat_completion` and leaving `LLM_INFERENCE_ID` empty.

## 2026-09-18 — One action per break type, and the ES|QL verdict before the model speaks

Changes `elastic/workflows/` (four new workflows and `actions.json`), `elastic/mappings/ledgerlens-audit.json`, `elastic/agent/instructions.md`, `src/actions.js` (new), `src/setup-agent.js`, `src/console/server.js`, `src/console/index.html`, `tests/actions.test.js` (new). No change to the five ES|QL tools, the recon, traces or resolved-breaks indices, or `traceability.js`.

**Why:** the AMA's second judging parameter is whether the agent can *take action*, not just explain. Until now the only action was `ledgerlens.open_case`, fired the same way for every break type, and a TIMING_T1 break offered no action at all. Separately, OPTIMIZATION.md measured about 16 s of dead air at the start of every investigation, before the first tool call.

**Existing approach:** one workflow, hardcoded in `setup-agent.js` and `server.js`; every report ended with "approve to open a case"; the console button said "open case"; the page showed a spinner until the first stream event.

**New approach:**
- `elastic/workflows/actions.json` maps each break type to one workflow tool. MISSING_CREDIT keeps `ledgerlens.open_case` (unchanged YAML). New: DOUBLE_DEBIT → `ledgerlens.raise_reversal` (high-severity case carrying the drafted request to the partner, audit record naming the duplicate UTR); FEE_MISMATCH → `ledgerlens.log_fee_dispute` (register entry with charged vs contracted fee, no case: commercial, not operational); TIMING_T1 → `ledgerlens.close_timing` (closes the break citing the next-day row and value date, no case); UNRESOLVED → `ledgerlens.escalate_partner` (medium-severity case plus an escalation record quoting the UTR). Every workflow still computes nothing; every field is passed through.
- The report gains a **Draft message** section: the text the action will carry, written by the model for its reader (partner ops, the dispute register, the closing note, finance) and shown to the reviewer *before* they approve. The traceability check covers it like every other section: every figure and ID in the draft must come from a tool result.
- The approval gate is unchanged in force and now names all five tools. The closing line names the action: "Reply **approve** to raise the reversal request with PAYSTREAM, or **dismiss**."
- `ledgerlens-audit` stays `dynamic: strict` and gains the fields the new workflows write (partner, rail, utr, amount_inr, settlement_row_id, value_date, the three fee figures, message). Figures are `keyword`: passed through verbatim, never re-parsed.
- `src/setup-agent.js` creates the five workflows and five workflow tools from the registry. `src/actions.js` is shared by setup, the console server and the tests.
- Console: `GET /api/break` runs `ledgerlens.break_delta` alone (about 10 ms of ES|QL) the moment a row is clicked, and the page paints a verdict card (break type, rule, figures) while the model is still starting. Display only: `state.facts` and the traceability check still come from the agent's own tool results, so the report has to earn every figure itself. The approve button names the action ("Approve → raise reversal with PAYSTREAM"); the audit line shows what ran, the partner, UTR or row it named, and the message. `POST /api/act` replaces `/api/open-case` for `CASE_MODE=direct`: the server picks the workflow from the break type, copies the figures from `break_delta` and lifts the message from the report's Draft message section. Mock mode does the same.
- `tests/actions.test.js` keeps the registry, the YAML files, the strict mapping and the instructions in agreement: one action per break type, every audit field mapped, every direct-mode input declared, every tool named in the instructions.

**Verified:** `npm test` 19/19. The console starts, serves the page, `/api/config` lists the five actions, and the new routes validate their input.

**Not yet verified, needs the cloud project:** none of this has run against Kibana. Workflow YAML validity (`setup:agent` checks `valid` and fails loudly), tool registration, the agent following the action table and drafting the message, and one approve per break type writing the right audit record. The prefetch's effect on perceived latency is also unmeasured; the expectation from BENCHMARKS.md is a verdict card within about 100 ms of the click against 16.6 s to the first stream event before.

## 2026-09-17 — Console: stream the investigation live

Changes `src/console/server.js` and `src/console/index.html`. No change to the agent, tools, indices or `traceability.js`.

**Why:** an investigation takes about 28 to 46 seconds end to end, and almost all of that is model time. Elasticsearch accounts for about 80 ms. Before this change the page showed a spinner for the whole run and then displayed the report all at once. Judges see latency before they read the answer, so the real cost is the silent wait, not the total time.

**Existing approach:** `POST /api/investigate` called Agent Builder's blocking `/api/agent_builder/converse`. The server waited for the whole round, then returned one JSON response with `steps` and `message`, and the page rendered it.

**New approach:**
- `POST /api/investigate/stream` (new) calls `/api/agent_builder/converse/async`, which responds with Server-Sent Events, and pipes the body to the browser unchanged. The server doesn't parse the stream, so it can't break the framing. The stream is padded with `:` comment lines to get past proxy buffering, and the page skips them.
- The page reads the stream with `fetch` and a `ReadableStream` reader. It can't use `EventSource`, because the request is a POST with a body. What each event does:
  - `tool_call`, `tool_result` and `reasoning` build the step list live. A tool shows a spinner until its result arrives. The first `reasoning` event is a `transient` placeholder and is skipped.
  - `message_chunk` types out the text the agent is writing. Every interim narration has its own `message_id`, so the text area resets when the id changes.
  - `round_complete` carries the same `steps` and `message` shape the blocking endpoint returns. The existing `render()` and traceability check run on it without changes. Figures are highlighted only at this point, once every tool result is known.
  - `conversation_id_set` arrives early and holds the id that the approve flow and the Kibana trace link need. `conversation_created` carries the same id, but it arrives after `round_complete`.
  - `thinking_complete` gives `time_to_first_token`, which now shows in the investigation header next to the total time.
- The blocking `/api/investigate` endpoint is unchanged and is the fallback. The page uses it when the stream returns an HTTP error, when the stream ends before `round_complete` (for example, the connection drops), and always in `AGENT_MODE=mock`. The server also returns 409 on the stream route in mock mode, so mock mode never reaches a model.
- The step markup moved out of `render()` into `stepsHtml()`, which both the live view and the final view use.

**Measured:** two live runs against the cloud project (Elastic Managed LLM) for `DSB-20260916-00297`:
- The first stream events (`conversation_id_set` and `reasoning`) arrived at 16.6 s and the first text at 20.2 s. `round_complete` arrived at 45.0 s.
- An earlier direct `curl` of `converse/async` finished in 28.0 s, with `time_to_first_token` at 16.5 s.
- Every run made 4 LLM calls, and about 46k of 69k input tokens were cached.

Total time varies a lot from run to run, so treat any single number as one sample. The part streaming changes, the first visible progress, landed at about 16 s in every run.

**Verified:**
- `npm test` passes (14/14).
- A captured live stream was replayed through the real page script (with the DOM and `fetch` stubbed) at random chunk boundaries. The live step list rendered mid-stream, the final report traced 18/18 figures, and the approve button and trace link rendered.
- Three fallback cases (HTTP 500, stream cut at 60%, mock mode) each ended with a fully traced report and no error.
- Checked in the browser against the cloud project: steps and text stream live, and approve opens the case.

## 2026-09-17 — Agent instructions: approval gating + tool batching

Both changes are to `elastic/agent/instructions.md` only. No index, mapping, ES|QL tool, or workflow changed. Found during the first live run against the cloud project and a real LLM (Elastic Managed LLM).

### Fix: agent opened a case without the user approving

**Observed:** running a plain `Investigate DSB-20260916-00238.` — no approval given — the agent called `ledgerlens.open_case` unprompted at the end of its own investigation, opening a real case and writing an audit record.

**Why it matters:** the approval gate is the project's core safety claim — README's "Actions are gated," the submission's "every write stays behind human approval," and the AMA's framing of agent-that-acts vs agent-that-explains all depend on this holding. A judge triggering an investigation and watching a case open unprompted contradicts the repo and the pitch in the same breath.

**Existing approach:** the only approval instruction lived in the `# Taking action` section, well after the investigation steps (previously line 45 of a 51-line file). Nothing in the investigation flow itself said to stop after writing the report.

**New approach:**
- Added a new `# The other rule: you never act without approval` section immediately after the money rule, at the top of the file, stating the gate as plainly and forcefully as the number rule already was: "Writing a report is not approval. Finishing an investigation is not approval. Silence is not approval."
- Added an explicit stop instruction to the last step of the investigation flow: "Write the report in the format below. Then stop — do not call `ledgerlens.open_case` or any other tool. Wait for the user's next message."
- Left the detailed operational instructions in `# Taking action` (params to pass, severity mapping) unchanged — the fix is about *when* the agent decides to call the tool, not what it passes when it does.

**Not yet done:** re-verified against the live agent after this change (needs `npm run setup:agent` to push, then a manual re-run per break type). If the instruction doesn't hold under testing, the fallback is `CASE_MODE=direct` in `.env`, which removes the agent's ability to call the workflow at all and runs approval through the console server directly — already implemented in `src/console/server.js`, untouched by this change.

### Optimization: reduced agent round trips per investigation

**Observed:** a full investigation took 56.8s end to end, of which ES|QL itself accounted for roughly 80ms across all five tool calls (`break_delta` ~10ms, `evidence_rows` ~10ms, `trace_failure_point` ~6ms, `similar_cases` ~22ms, per BENCHMARKS.md). The remaining ~56.7s was LLM round-trip time across sequential tool calls.

**Why it matters:** judging is on both latency and accuracy. Elasticsearch was never the bottleneck — sharding or index tuning at 3,574 docs would not move this number. The only lever with real impact is the number of sequential LLM round trips.

**Existing approach:** the investigation flow instructed the agent to call four tools one at a time, in strict sequence: `break_delta` → `evidence_rows` → `trace_failure_point` → `similar_cases`, each requiring its own LLM turn.

**New approach:** `evidence_rows` and `trace_failure_point` both take only `disbursal_id` and don't depend on each other's output, so the instructions now tell the agent to call them together in the same turn. `break_delta` still runs alone and first, because it's the only tool that determines `break_type` — and `break_type` gates the early-exit path for `MATCHED`/`NO_LEDGER_SUCCESS` disbursals (a clean lookup should not pay for evidence or trace calls it doesn't need). `similar_cases` still runs after, since its query text is built from the other tools' results.

Net effect: one fewer sequential LLM round trip on every real break investigation (roughly a 4-turn conversation instead of 5), with no change to which tools run or what they return.

**Not yet done:** latency wasn't re-measured after this change — the model already showed some spontaneous parallel tool-calling behavior in the one run observed, so the actual saving needs to be measured against the new instructions, not assumed. Later live runs confirmed the batching: `model_usage.llm_calls` is 4, and `evidence_rows` and `trace_failure_point` share one `tool_call_group_id`. Streaming is covered in the entry above.

### How to verify these two changes

```bash
npm run setup:agent   # pushes the updated instructions.md to the Kibana agent
npm run console        # http://localhost:3000
```

Then, per break type in the queue:
1. Click **Investigate** and confirm the agent's report ends without calling `open_case` — no case/audit line should appear until you approve.
2. Type **approve** and confirm the case opens only now.
3. Compare wall-clock time in the console header against the 56.8s baseline.
