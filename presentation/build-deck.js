// Builds presentation/LedgerLens.pptx. Eleven slides: title, problem, business impact, the idea, architecture,
// the five break types, demo, measured numbers, platform map, honesty, close. Every number on a slide is sourced
// in that slide's speaker notes to BENCHMARKS.md, data/answer-key.json or CHANGELOG.md.
// 16:9, 10in x 5.625in. Safe fonts only (Cambria titles, Calibri body, Courier New for identifiers).
// Run: node presentation/build-deck.js   (needs pptxgenjs: npm install --no-save pptxgenjs)
import pptxgen from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(HERE, "LedgerLens.pptx");

const C = {
  navy: "0F1E3C", navy2: "18294F", white: "FFFFFF", ice: "CFE0F7", muted: "5B6270", line: "E3E6EB", bg: "F6F7F9",
  green: "1A7F4B", greenTint: "E3F5EA", greenBright: "5CCB8A",
  coral: "C6432E", coralTint: "FBE9E7", amber: "8A5A00", amberTint: "FFF3D6", ink: "14171F",
};
const F = { title: "Cambria", body: "Calibri", mono: "Courier New" };
const LINE = "The model explains. ES|QL decides. Every number is traceable.";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "LedgerLens";
pres.title = "LedgerLens · Forge the Future 2026";

// ---------------------------------------------------------------- helpers
const text = (slide, str, o) => slide.addText(str, { isTextBox: true, fontFace: F.body, color: C.ink, margin: 0, valign: "top", fit: "shrink", ...o });
const box = (slide, x, y, w, h, o = {}) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line, width: 1 }, ...o });
const chip = (slide, str, x, y, w, o = {}) => {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.3, rectRadius: 0.06, fill: { color: o.fill || C.greenTint }, line: { color: o.border || C.green, width: 0.75 } });
  text(slide, str, { x, y, w, h: 0.3, fontFace: F.mono, fontSize: o.fontSize || 10, color: o.color || C.green, align: "center", valign: "middle", bold: true });
};
const arrow = (slide, x1, y, x2) => slide.addShape(pres.shapes.LINE, { x: x1, y, w: x2 - x1, h: 0, line: { color: C.green, width: 2, endArrowType: "triangle" } });
const title = (slide, str, o = {}) => text(slide, str, { x: 0.5, y: 0.35, w: 9, h: 0.7, fontFace: F.title, fontSize: 28, bold: true, color: o.color || C.navy, ...o });
const footer = (slide, str, color = C.muted) => text(slide, str, { x: 0.5, y: 5.2, w: 9, h: 0.3, fontSize: 9.5, color });
const bullets = (slide, items, o) =>
  slide.addText(
    items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
    { isTextBox: true, fontFace: F.body, fontSize: 12, color: C.ink, margin: 0, valign: "top", paraSpaceAfter: 4, fit: "shrink", ...o },
  );
const tile = (slide, x, y, w, h, big, label, src, dark = false) => {
  box(slide, x, y, w, h, dark ? { fill: { color: C.navy2 }, line: { color: C.navy2, width: 0 } } : { fill: { color: C.bg } });
  text(slide, big, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.6, fontFace: F.title, fontSize: 25, bold: true, color: dark ? C.greenBright : C.green });
  text(slide, label, { x: x + 0.15, y: y + 0.72, w: w - 0.3, h: h - 1.2, fontSize: 9.5, color: dark ? C.white : C.ink });
  text(slide, src, { x: x + 0.15, y: y + h - 0.4, w: w - 0.3, h: 0.36, fontSize: 8, color: dark ? C.ice : C.muted, italic: true });
};

// ================================================================ 1. title (dark)
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  text(s, "LedgerLens", { x: 0.6, y: 1.0, w: 5.2, h: 0.9, fontFace: F.title, fontSize: 48, bold: true, color: C.white });
  text(s, "Explainable reconciliation-break investigation for lending and payments operations, built on Elastic Agent Builder.", { x: 0.6, y: 1.95, w: 4.9, h: 0.9, fontSize: 15, color: C.ice });
  text(s, "The model explains.\nES|QL decides.\nEvery number is traceable.", { x: 0.6, y: 3.0, w: 4.9, h: 1.3, fontFace: F.title, fontSize: 21, bold: true, color: C.greenBright, lineSpacingMultiple: 1.15 });
  text(s, "Grounded, not guessed · Takes action behind a human · Measured · Built on Elastic, AWS and Sarvam", { x: 0.6, y: 4.4, w: 5.0, h: 0.5, fontSize: 11, color: C.ice });

  box(s, 5.9, 1.0, 3.6, 3.45, { fill: { color: C.white }, line: { color: C.navy2, width: 0 }, shadow: { type: "outer", blur: 8, offset: 3, angle: 90, color: "000000", opacity: 0.35 } });
  text(s, "DSB-20260916-00114 · MISSING_CREDIT", { x: 6.1, y: 1.15, w: 3.2, h: 0.35, fontFace: F.mono, fontSize: 10.5, bold: true, color: C.navy });
  text(s, "Rule fired  R1: ledger DISBURSAL_SUCCEEDED present, settlement rows = 0", { x: 6.1, y: 1.52, w: 3.2, h: 0.45, fontSize: 9.5, color: C.muted });
  text(s, "Ledger", { x: 6.1, y: 2.05, w: 1.0, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "₹30,42,800.00", 7.2, 2.02, 1.6);
  text(s, "Settled", { x: 6.1, y: 2.45, w: 1.0, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "₹0.00", 7.2, 2.42, 1.6);
  text(s, "Delta", { x: 6.1, y: 2.85, w: 1.0, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "₹30,42,800.00", 7.2, 2.82, 1.6, { fill: C.coralTint, border: C.coral, color: C.coral });
  text(s, "Failure point", { x: 6.1, y: 3.25, w: 1.1, h: 0.25, fontSize: 10, color: C.muted });
  chip(s, "psp.status-poll · CALLBACK_TIMEOUT", 7.2, 3.22, 2.2, { fill: C.bg, border: C.muted, color: C.ink, fontSize: 8.5 });
  s.addShape(pres.shapes.RECTANGLE, { x: 5.9, y: 3.8, w: 3.6, h: 0.65, fill: { color: C.greenTint }, line: { color: C.greenTint, width: 0 } });
  text(s, "Every figure above is an ES|QL result, passed through verbatim  ·  0 computed by the LLM", { x: 6.05, y: 3.8, w: 3.35, h: 0.65, fontSize: 10, bold: true, color: C.green, valign: "middle" });

  footer(s, "Forge the Future 2026 · Elastic × AWS · Track 4: Industry Vertical Demo (BFSI) · Mridul Mahajan, Backend Engineer, Lending", C.ice);
  s.addNotes("Open: Three systems must agree about money: the ledger, the bank's settlement file, and the pipeline that pushed the funds. When they disagree, an analyst spends thirty to sixty minutes per break, by hand. That is my own estimate from running this in production, not a benchmark. Say the line once, slowly.\n\nThe card on the right is a real seeded break from the demo day (data/answer-key.json): DSB-20260916-00114, NORTHBANK, RTGS, ledger 304280000 paise = ₹30,42,800.00, settled 0, failure at psp.callback then psp.status-poll, CALLBACK_TIMEOUT, beneficiary account invalid.");
}

// ================================================================ 2. problem (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Three systems must agree about every rupee");
  const cols = [
    ["Event-sourced ledger", "DISBURSAL_INITIATED → SUCCEEDED or FAILED, amount, expected fee, UTR. The internal truth."],
    ["Partner settlement file", "PSP or bank rows: UTR, amount, fee charged, value date. The bank's truth."],
    ["Disbursal pipeline traces", "psp.transfer → psp.callback → psp.status-poll, with errors and retries. What actually happened."],
  ];
  cols.forEach(([h, d], i) => {
    const x = 0.5 + i * 3.1;
    box(s, x, 1.2, 2.8, 1.2, { fill: { color: C.bg } });
    text(s, h, { x: x + 0.15, y: 1.3, w: 2.5, h: 0.3, fontSize: 13.5, bold: true, color: C.navy });
    text(s, d, { x: x + 0.15, y: 1.62, w: 2.5, h: 0.72, fontSize: 10.5, color: C.muted });
  });
  chip(s, "BREAK", 3.05, 2.55, 0.9, { fill: C.coralTint, border: C.coral, color: C.coral, fontSize: 10 });
  chip(s, "BREAK", 6.15, 2.55, 0.9, { fill: C.coralTint, border: C.coral, color: C.coral, fontSize: 10 });
  text(s, "A reconciliation break is two or more of them disagreeing about the same disbursal.", { x: 0.5, y: 2.55, w: 2.5, h: 0.6, fontSize: 10, color: C.muted, italic: true });

  text(s, "What breaks look like", { x: 0.5, y: 3.2, w: 4.3, h: 0.3, fontSize: 14, bold: true, color: C.navy });
  bullets(s, [
    "Missing credit: booked as success, nothing settled. Funds never moved",
    "Double debit: one disbursal, two UTRs, the partner executed a retry twice",
    "Fee mismatch: principal matches, the fee does not follow the rate card",
    "Late credit: initiated after cut-off, settled on the next value date",
    "Unexplained shortfall: one row, a small delta, nothing in the data explains it",
  ], { x: 0.5, y: 3.52, w: 4.3, h: 1.6, fontSize: 11 });

  text(s, "Today", { x: 5.2, y: 3.2, w: 4.3, h: 0.3, fontSize: 14, bold: true, color: C.coral });
  bullets(s, [
    "An analyst pulls entries from three systems by hand and writes the root cause",
    "30 to 60 minutes per break (my own estimate from production, not a benchmark)",
    "The queue does not clear on high-volume days; the write-up is one tired human at 11 pm",
    "Settlement cash sits in the nodal account, refunds wait, every unexplained figure is audit exposure",
  ], { x: 5.2, y: 3.52, w: 4.3, h: 1.6, fontSize: 11 });
  s.addNotes("Every lender, PSP and bank runs this reconciliation daily. The break types on the left are exactly the five the system detects and acts on (DATA.md, seeded break catalogue). The manual time is my own estimate from operating this class of system in production; it is labelled as such everywhere.");
}

// ================================================================ 3. business impact (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "What one settlement day costs");
  text(s, "Demo day 2026-09-16 in the synthetic dataset. Every figure below is computed from data/answer-key.json and confirmed by npm run verify.", { x: 0.5, y: 1.0, w: 9, h: 0.3, fontSize: 10.5, color: C.muted });

  tile(s, 0.5, 1.35, 2.15, 1.95, "₹24.71 cr", "disbursed across 388 successful disbursals, 3 partners, 3 rails", "BENCHMARKS.md, section 7");
  tile(s, 2.775, 1.35, 2.15, 1.95, "10", "breaks flagged by one ES|QL query over the whole day, in 30 ms", "BENCHMARKS.md, sections 1 and 7");
  tile(s, 5.05, 1.35, 2.15, 1.95, "₹48.5 lakh", "principal in dispute: 3 missing credits ₹43.17 lakh, 2 double debits ₹5.33 lakh, 1 shortfall ₹1,000", "sum of delta_paise, data/answer-key.json");
  tile(s, 7.325, 1.35, 2.15, 1.95, "₹23.6 lakh", "credited a day late on 2 timing breaks; plus ₹3.85 fee overcharge on 2 transfers no eye would catch", "data/answer-key.json");

  text(s, "Time", { x: 0.5, y: 3.45, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: C.navy });
  bullets(s, [
    "Manual: 30 to 60 minutes per break, so 5 to 10 analyst-hours for this one day (estimate)",
    "LedgerLens: 20 to 45 s per break in the runs we measured, so the whole queue in under 8 minutes of model time; the reviewer reads, approves or dismisses",
    "Elasticsearch is under 0.2 s of every investigation; the rest is the model writing",
  ], { x: 0.5, y: 3.77, w: 4.3, h: 1.35, fontSize: 10 });

  text(s, "Trust and audit", { x: 5.2, y: 3.45, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: C.navy });
  bullets(s, [
    "Every figure and ID in the report is checked against the ES|QL result it came from; a compliance reviewer signs off in seconds",
    "Every action writes an append-only audit record naming the approver and the workflow execution; the audit trail is a by-product, not extra work",
    "A break the system cannot explain is escalated with what was ruled out, never guessed",
  ], { x: 5.2, y: 3.77, w: 4.3, h: 1.35, fontSize: 10 });
  footer(s, "Synthetic data by design (DATA.md). The manual baseline is the builder's estimate, not a benchmark. The agent time is shown live in the console header on every run.");
  s.addNotes("Business impact, sourced. Demo-day totals: 388 successful disbursals worth ₹24,71,32,300 (BENCHMARKS.md section 7). Principal in dispute = missing-credit deltas 431740000 paise (₹43,17,400) + double-debit excess 53340000 paise (₹5,33,400) + unresolved shortfall 100000 paise (₹1,000) = 485180000 paise = ₹48,51,800. Late credits = the two TIMING_T1 principals 196160000 + 40110000 = 236270000 paise = ₹23,62,700. Fee overcharge = 295 + 90 paise = ₹3.85. Time: 10 breaks × 30 to 60 min = 5 to 10 hours; 10 × 45 s = 7.5 min. Observed investigation wall clock: 28 to 45 s through Agent Builder with the Elastic Managed LLM, within 19 s in local mode (CHANGELOG.md); ES|QL per investigation is the sum of medians in BENCHMARKS.md, under 0.2 s.");
}

// ================================================================ 4. the idea (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Split the job: ES|QL decides, the model explains, a workflow acts", { fontSize: 25 });

  text(s, "Why current tools stop short", { x: 0.5, y: 1.15, w: 3.9, h: 0.3, fontSize: 14, bold: true, color: C.coral });
  bullets(s, [
    "Rules engines match or they do not. Then a human starts hunting",
    "Chat and RAG can explain, but nobody can sign off on a number a language model produced. An amount out of a model is an opinion; an amount out of STATS SUM(amount_paise) BY disbursal_id is a fact with a query attached",
    "Agents that only explain stop where the work starts: the case, the reversal, the dispute entry, the audit trail",
  ], { x: 0.5, y: 1.5, w: 3.9, h: 2.5, fontSize: 11.5 });

  const steps = [
    ["ES|QL computes", "Five parameterised tools compute every amount, count, delta, fee and the break classification. The only place money math exists.", C.greenTint, C.green],
    ["The model narrates", "Agent Builder orders the tools, reads the rows and writes the report. It may add ₹ and separators; it may not change a digit.", C.bg, C.line],
    ["The console proves it", "Every amount and ID in the report is matched back to a tool result: green if found verbatim, red if invented. N / N traced, on every report.", C.bg, C.line],
    ["A workflow acts, behind a human", "One Elastic Workflow per break type. It runs only after the reviewer types approve, and writes an append-only audit record.", C.amberTint, C.amber],
  ];
  steps.forEach(([h, d, fill, border], i) => {
    const y = 1.15 + i * 0.72;
    box(s, 4.7, y, 4.8, 0.64, { fill: { color: fill }, line: { color: border, width: 1 } });
    text(s, h, { x: 4.85, y: y + 0.06, w: 1.6, h: 0.52, fontSize: 11.5, bold: true, color: C.navy, valign: "middle" });
    text(s, d, { x: 6.45, y: y + 0.05, w: 2.95, h: 0.56, fontSize: 9, color: C.ink, valign: "middle" });
  });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.2, w: 9, h: 0.7, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  text(s, LINE, { x: 0.7, y: 4.2, w: 8.6, h: 0.7, fontFace: F.title, fontSize: 18, bold: true, color: C.greenBright, valign: "middle", align: "center" });
  footer(s, "Grounded: every fact from the indices. Not just conversational: five gated actions. Measurable: next slides. Built on Elastic, AWS and Sarvam.");
  s.addNotes("The design is inverted relative to most agent projects: the model does not produce the answer with retrieval as support; ES|QL produces every fact and the model is confined to ordering tools and explaining. The console does not assert that confinement, it checks it on every report (src/console/traceability.js). The four things the organisers asked for in the AMA are in the footer.");
}

// ================================================================ 5. architecture (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "How it works", { w: 3.5 });
  text(s, "Elastic Cloud Serverless, Elasticsearch 9.6.0 · Agent Builder · Elastic Workflows · Kibana Cases · Elastic Managed LLM or Amazon Bedrock through an inference endpoint · Sarvam", { x: 4.0, y: 0.45, w: 5.5, h: 0.55, fontSize: 10, color: C.muted, align: "right" });

  const stages = [
    ["Data", "Synthetic ledger events, settlement rows and APM-shaped spans → 3 indices with strict mappings: keyword for every ID, integer paise for money. Past resolved cases in a semantic_text field. Audit index for actions.", C.bg, C.line],
    ["ES|QL tools", "list_breaks: STATS BY disbursal_id over one unified index, no join · break_delta: figures + CASE rule table R0 to R5 · evidence_rows · trace_failure_point · similar_cases: FORK BM25 + semantic, FUSE with RRF", C.greenTint, C.green],
    ["Agent Builder", "Agent ledgerlens, 10 tools: 5 esql + 5 workflow. Orders the tools, batches the independent ones, reads results, writes the report. Never computes. Every conversation has a trace.", C.bg, C.line],
    ["Elastic Workflows", "Five, one per break type: cases.createCase where warranted, elasticsearch.request writes the audit record. Runs only after a human types approve. Computes nothing: every field is passed through.", C.amberTint, C.amber],
    ["Ops console", "Break queue · ES|QL verdict in milliseconds · live stream · every figure highlighted to its tool result · approve / dismiss · chat drawer · Sarvam Hindi and Kannada, voice in and out · link to the Kibana trace.", C.bg, C.line],
  ];
  const w = 1.72, gap = 0.1, y = 1.15, h = 2.55;
  stages.forEach(([h1, d, fill, border], i) => {
    const x = 0.5 + i * (w + gap);
    box(s, x, y, w, h, { fill: { color: fill }, line: { color: border, width: 1 } });
    text(s, h1, { x: x + 0.12, y: y + 0.1, w: w - 0.24, h: 0.35, fontSize: 13, bold: true, color: C.navy });
    text(s, d, { x: x + 0.12, y: y + 0.48, w: w - 0.24, h: h - 0.58, fontSize: 9, color: C.ink });
    if (i < stages.length - 1) arrow(s, x + w - 0.02, y + h / 2, x + w + gap + 0.02);
  });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.9, w: 9, h: 0.7, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  text(s, "Every figure the agent reports originates in an ES|QL result and is passed through verbatim. The LLM receives rows and emits prose. The console checks this live: each amount and ID in the report is matched back to the tool result it came from.", { x: 0.7, y: 3.9, w: 8.6, h: 0.7, fontSize: 11, color: C.white, valign: "middle" });
  text(s, "Search, in one sentence: identifiers are keyword and matched exactly; human descriptions are text plus semantic_text embedded by Elastic's inference service; precedent retrieval FORKs a BM25 branch and a semantic branch and FUSEs them with reciprocal rank fusion, in one ES|QL query, one search API.", { x: 0.5, y: 4.7, w: 9, h: 0.5, fontSize: 10, color: C.muted, italic: true });
  s.addNotes("Walk left to right, one sentence each. Land on hybrid search: precedent retrieval is one ES|QL query, a BM25 branch and a semantic branch fused with RRF. Exact IDs and fuzzy human descriptions in one search API. Elastic embeds at index and query time through the project's default inference endpoint (.jina-embeddings-v5-text-small); there is no embedding code in the repo. Mappings: elastic/mappings/*.json, dynamic strict. Tools: elastic/tools/*.esql. Agent: src/setup-agent.js creates everything through the Kibana API and smoke-tests a tool with no LLM. Model: the project's Elastic Managed LLM, or Amazon Bedrock (anthropic.claude-sonnet-4-5, us-west-2) through the ledgerlens-bedrock inference endpoint; the switch is one environment variable.");
}

// ================================================================ 6. the five break types (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Every break type has a rule, an explanation and an action", { fontSize: 25 });
  const rows = [
    ["Break type", "Rule, computed in ES|QL", "What the evidence and trace show", "Action after approve", "Writes"],
    ["MISSING_CREDIT", "R1: ledger DISBURSAL_SUCCEEDED present, settlement rows = 0", "Success booked on the partner's synchronous ACCEPTED; callback timed out; status poll returned FAILED (beneficiary account invalid, or insufficient nodal balance). Funds never moved", "Open a high-severity case so finance can reverse the ledger entry (ledgerlens.open_case)", "Kibana case + audit CASE_OPENED"],
    ["DOUBLE_DEBIT", "R2: settlement rows > 1", "Gateway timeout (HTTP 504) on attempt 1; retry without an idempotency key; the partner executed both. Two UTRs", "Raise a reversal request with the partner for the duplicate UTR (ledgerlens.raise_reversal)", "Kibana case + audit REVERSAL_REQUESTED"],
    ["FEE_MISMATCH", "R3: principal delta = 0, fee delta ≠ 0", "IMPS slab charged on a NEFT transfer, or GST applied twice. Pipeline clean", "Log the overcharge in the fee dispute register; commercial, not operational, so no case (ledgerlens.log_fee_dispute)", "audit FEE_DISPUTE_LOGGED"],
    ["TIMING_T1", "R4: principal and fee match, value date > business date", "Initiated after the partner's 23:00 IST cut-off; the credit is in the next day's file. Pipeline clean", "Close as self-clearing, citing the next-day row and value date (ledgerlens.close_timing)", "audit CLOSED_SELF_CLEARING"],
    ["UNRESOLVED", "R5: one row, non-zero delta, no rule matches", "Credit ₹1,000 short, fee correct, all spans succeeded. Nothing in the data explains it. The agent says so and lists what it ruled out", "Open a medium-severity case and record the escalation to the partner, quoting the UTR (ledgerlens.escalate_partner)", "Kibana case + audit ESCALATED_TO_PARTNER"],
  ];
  s.addTable(
    rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, fontFace: j === 0 && i > 0 ? F.mono : F.body, color: i === 0 ? C.white : j === 0 ? C.navy : C.ink, fill: { color: i === 0 ? C.navy : i % 2 ? C.white : C.bg }, fontSize: i === 0 ? 10 : 8.5, valign: "middle", margin: [3, 5, 3, 5] } }))),
    { x: 0.5, y: 1.1, w: 9, colW: [1.35, 1.75, 2.75, 2.05, 1.1], border: { type: "solid", color: C.line, pt: 0.5 }, rowH: [0.35, 0.62, 0.55, 0.55, 0.55, 0.62] },
  );
  text(s, "A clean disbursal classifies as MATCHED (R0) and a partner-rejected one as NO_LEDGER_SUCCESS: neither is a break, neither has an action, and npm run verify checks they are never flagged. 14 of 14 seeded breaks found across three days, 0 false positives among 1,170 successful disbursals.", { x: 0.5, y: 4.45, w: 9, h: 0.55, fontSize: 10, color: C.muted });
  footer(s, "Rules: elastic/tools/ledgerlens.break_delta.esql · Actions: elastic/workflows/actions.json and *.yaml · Catalogue: DATA.md");
  s.addNotes("This is the whole reconciliation surface the system covers. Each row is one CASE branch in break_delta.esql, one seeded mechanism in src/generate.js, and one Elastic Workflow. The agent picks the action from break_type, drafts the message the action will carry, and stops. Nothing runs until the reviewer types approve. If asked how this differs from a rules engine: the rules are the classifier, on purpose; what rules cannot do is read a trace, find a precedent, write a root cause a compliance reviewer can sign, and take a gated action.");
}

// ================================================================ 7. demo (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Live demo: one settlement day, ten breaks");
  const steps = [
    ["Match", "388 disbursals, ₹24.71 crore. One ES|QL STATS flags 10 breaks in 30 ms. No join, no application code.", C.green],
    ["Verdict", "Click DSB-20260916-00114. The ES|QL verdict card lands in milliseconds: rule R1, ₹30,42,800.00 booked, ₹0.00 settled. The model has not said a word yet.", C.green],
    ["Investigate", "The agent calls break_delta, then evidence_rows and trace_failure_point together, then similar_cases. Evidence IDs, the failing span (psp.status-poll, CALLBACK_TIMEOUT, beneficiary account invalid), a resolved precedent, a draft message.", C.green],
    ["Prove", "Every figure in the report is highlighted green: found verbatim in a tool result. Open the Agent Builder trace in Kibana: the tool calls, their ES|QL and rows. The model wrote prose only.", C.green],
    ["Admit", "DSB-20260916-00150, UNRESOLVED: ₹1,000 short, one row, correct fee, clean pipeline. No rule matches. The agent lists what it ruled out and escalates. It does not guess.", C.coral],
    ["Act", "Type approve → the matching Elastic Workflow opens the case and writes the audit record; the console shows the case ID. Then the same report in Hindi through Sarvam, re-checked.", C.amber],
  ];
  steps.forEach(([h, d, col], i) => {
    const y = 1.12 + i * 0.63;
    s.addShape(pres.shapes.OVAL, { x: 0.5, y: y + 0.08, w: 0.38, h: 0.38, fill: { color: col }, line: { color: C.white, width: 0 } });
    text(s, String(i + 1), { x: 0.5, y: y + 0.08, w: 0.38, h: 0.38, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle" });
    text(s, h, { x: 1.0, y, w: 1.1, h: 0.55, fontSize: 13, bold: true, color: C.navy, valign: "middle" });
    text(s, d, { x: 2.1, y, w: 4.2, h: 0.58, fontSize: 9.5, color: C.ink, valign: "middle" });
  });

  box(s, 6.55, 1.15, 2.95, 3.65, { fill: { color: C.bg } });
  text(s, "Traceability check, live", { x: 6.75, y: 1.27, w: 2.6, h: 0.3, fontSize: 12, bold: true, color: C.navy });
  text(s, "N / N", { x: 6.75, y: 1.62, w: 2.6, h: 0.8, fontFace: F.title, fontSize: 42, bold: true, color: C.green });
  text(s, "figures and IDs in the report found verbatim in a tool result, recomputed on every report and every translation", { x: 6.75, y: 2.42, w: 2.6, h: 0.6, fontSize: 10, color: C.muted });
  chip(s, "₹30,42,800.00", 6.75, 3.1, 1.5);
  chip(s, "DSB-20260916-00114", 6.75, 3.5, 2.0);
  chip(s, "R1 · settlement_rows = 0", 6.75, 3.9, 2.3, { fill: C.bg, border: C.muted, color: C.ink, fontSize: 9 });
  text(s, "Green: traced. Red would mean the model invented it.", { x: 6.75, y: 4.3, w: 2.6, h: 0.4, fontSize: 9.5, color: C.muted, italic: true });
  footer(s, "Prompts if demoing from the Kibana chat: List the reconciliation breaks for 2026-09-16. · Investigate DSB-20260916-00114. · Investigate DSB-20260916-00150. · approve");
  s.addNotes("Switch to the console at step 1. Keep this slide up only while the page loads. Talk track in DEMO.md. The ten demo-day breaks and their figures are listed in SUBMISSION.md under Sample prompts; all verified by npm run verify on 18 Sep 2026. If wifi fails, play the recorded video and narrate over it.");
}

// ================================================================ 7b. chat layer: built today, planned next (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "Ask it anything: the chat layer, today and next", { fontSize: 26 });

  box(s, 0.5, 1.15, 4.4, 3.1, { fill: { color: C.greenTint }, line: { color: C.green, width: 1 } });
  text(s, "Built today", { x: 0.65, y: 1.25, w: 4.1, h: 0.3, fontSize: 13, bold: true, color: C.green });
  bullets(s, [
    "A chat drawer in the console: the operator asks in their own words. “What did you rule out?” “List today’s breaks.” “Approve.”",
    "Same Agent Builder conversation as the investigation on screen, so a follow-up has the report as context",
    "Every reply passes the same traceability check: each amount and ID highlighted green or red, N / N traced under the bubble",
    "Voice through Sarvam: a spoken question is transcribed (saarika:v2.5), a reply can be read aloud (bulbul:v3); Hindi and Kannada",
    "Today every question is forwarded to Agent Builder, which decides which ES|QL tool to run",
  ], { x: 0.65, y: 1.6, w: 4.1, h: 2.6, fontSize: 10 });

  box(s, 5.1, 1.15, 4.4, 3.1, { fill: { color: C.amberTint }, line: { color: C.amber, width: 1 } });
  text(s, "Next: an intelligence layer in front of Elastic (planned, not yet built)", { x: 5.25, y: 1.25, w: 4.1, h: 0.3, fontSize: 13, bold: true, color: C.amber });
  bullets(s, [
    "A router on our side classifies each question before anything is called",
    "Answerable from the conversation and the report already on screen: answered locally, no Elasticsearch call, no extra model round trip to the agent",
    "Needs fresh data: sent to Agent Builder and the ES|QL tools, as today",
    "An action: sent through the approval gate, never executed from chat alone",
    "Result: fewer calls, lower latency and cost, and a record of exactly which questions touched the data",
  ], { x: 5.25, y: 1.6, w: 4.1, h: 2.6, fontSize: 10 });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.4, w: 9, h: 0.6, fill: { color: C.navy }, line: { color: C.navy, width: 0 } });
  text(s, "The rule does not move: the chat may answer from context, but every number it quotes must exist in a tool result, and the checker runs on every reply.", { x: 0.7, y: 4.4, w: 8.6, h: 0.6, fontSize: 11, color: C.white, valign: "middle" });
  footer(s, "Built: src/console/index.html (chat drawer), src/console/server.js (/api/chat/stream, /api/speak, /api/transcribe) · Planned: routing layer, see What we would do next in SUBMISSION.md");
  s.addNotes("Be explicit: the left box is built and verified (CHANGELOG.md, 18 Sep: a streamed ‘List the reconciliation breaks for 2026-09-16.’ called ledgerlens.list_breaks and returned the ten breaks in 23 s; a follow-up in the same conversation answered from context in 14 s with no new tool call, quoting DSB-20260916-00114 and ₹30,42,800.00, which match /api/summary). The right box is the plan: today the model decides whether to call a tool; the router makes that decision deterministic on our side so only questions that need Elasticsearch reach it. Same traceability rule applies to both.");
}

// ================================================================ 8. numbers (dark)
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  title(s, "What we measured", { color: C.white });
  tile(s, 0.5, 1.15, 2.15, 1.95, "14 / 14", "seeded breaks detected across 3 business days, 0 false positives among 1,170 successful disbursals", "npm run verify vs data/answer-key.json · BENCHMARKS.md §1", true);
  tile(s, 2.775, 1.15, 2.15, 1.95, "30 ms", "median ES|QL time to match 388 disbursals against the settlement file, one STATS, no join", "ES|QL took · BENCHMARKS.md §7 · Elasticsearch 9.6.0 serverless", true);
  tile(s, 5.05, 1.15, 2.15, 1.95, "5 / 5", "break types get a same-type precedent at rank 1 from one hybrid ES|QL query, 128 ms median", "BENCHMARKS.md §6 · FORK + FUSE", true);
  tile(s, 7.325, 1.15, 2.15, 1.95, "0", "numbers computed by the LLM. Every amount and ID is checked against its tool result on every report", "by construction · src/console/traceability.js", true);

  text(s, "Also measured", { x: 0.5, y: 3.3, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: C.white });
  bullets(s, [
    "break_delta 13 ms · trace_failure_point 11 ms · evidence rows carry an ID on every row",
    "19 of 19 unit tests: generator invariants, action registry vs workflow YAML, traceability checker",
    "Investigation end to end: 20 to 45 s in the runs we measured, 4 model calls; Elasticsearch under 0.2 s of it",
  ], { x: 0.5, y: 3.62, w: 4.3, h: 1.3, fontSize: 10.5, color: C.ice });
  text(s, "Baseline, labelled honestly", { x: 5.2, y: 3.3, w: 4.3, h: 0.3, fontSize: 13, bold: true, color: C.white });
  bullets(s, [
    "Manual investigation: 30 to 60 minutes per break, the builder's own estimate from operating this class of system in production, not a benchmark",
    "Agent wall clock is shown in the console header on every run, not quoted from memory",
    "Every number on these slides has a file and a command behind it; BENCHMARKS.md is the verbatim verify output",
  ], { x: 5.2, y: 3.62, w: 4.3, h: 1.3, fontSize: 10.5, color: C.ice });
  footer(s, LINE, C.greenBright);
  s.addNotes("Read the four tiles. Say where each number came from. BENCHMARKS.md run of 18 Sep 2026 against the cloud project: list_breaks median 30 ms over 3 runs, break_delta 13 ms over 14, trace_failure_point 11 ms over 14, similar_cases 128 ms over 5; 14/14, 0 false positives; precedent at rank 1 for all five types. Tests: npm test, 19/19. Wall clock: 28 to 45 s through Agent Builder with the Elastic Managed LLM, within 19 s in local mode (CHANGELOG.md); 4 LLM calls per investigation (OPTIMIZATION.md). Traceability on a captured live run: 18 of 18 (CHANGELOG.md). Stop talking after the baseline.");
}

// ================================================================ 9. platform map (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "How we use Elastic, AWS and Sarvam", { fontSize: 26 });
  const rows = [
    ["Capability", "How LedgerLens uses it", "Rubric"],
    ["Elasticsearch mappings", "4 indices, dynamic: strict, keyword for every identifier and code, integer paise, text only for narration; one schema for ledger and settlement so one STATS matches both sides", "Elasticsearch integration"],
    ["ES|QL", "Match is one STATS ... BY disbursal_id over a unified index; classification is a CASE rule table; VALUES() collects the IDs the report cites; every tool is a parameterised query run verbatim by the agent and the verifier", "Technical implementation"],
    ["Hybrid search", "FORK a BM25 branch and a semantic_text branch, FUSE with RRF, in one query; Elastic embeds at index and query time (.jina-embeddings-v5-text-small), no embedding code", "Elasticsearch integration, AI"],
    ["Agent Builder", "10 tools (5 esql, 5 workflow), one agent, instructions that forbid computing and gate every action; batched tool calls; SSE streaming; per-conversation trace as the explainability artefact", "AI implementation, Innovation"],
    ["Workflows + Cases", "Five workflows exposed as tools; cases.createCase where warranted, elasticsearch.request writes the audit record; run only after a human types approve", "Takes action, UX"],
    ["AWS", "Amazon Bedrock as the narration model through an Elasticsearch inference endpoint (amazonbedrock service, Claude Sonnet 4.5, us-west-2), created by setup:agent; one env var switches to the Elastic Managed LLM", "Technology stack"],
    ["Sarvam", "sarvam-translate:v1 renders the report in Hindi or Kannada and the traceability check re-runs on it; bulbul:v3 reads a reply aloud; saarika:v2.5 transcribes a spoken question", "Impact, UX, sponsor fit"],
    ["Console", "Zero-dependency Node server plus one page: queue, verdict card, live stream, traceability highlights, approve / dismiss, chat drawer, audit line, Kibana trace link", "Interface design, Usability"],
  ];
  s.addTable(
    rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 0, color: i === 0 ? C.white : j === 2 ? C.green : C.ink, fill: { color: i === 0 ? C.navy : i % 2 ? C.white : C.bg }, fontSize: i === 0 ? 10 : 8.5, fontFace: F.body, valign: "middle", margin: [3, 6, 3, 6] } }))),
    { x: 0.5, y: 1.1, w: 9, colW: [1.6, 5.6, 1.8], border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.43 },
  );
  s.addNotes("Only if asked, or as the architecture Q&A backup. Each row is one sentence you can say out loud and one file you can open: elastic/mappings, elastic/tools, elastic/agent/instructions.md, elastic/workflows, src/setup-agent.js (Bedrock endpoint), src/console/server.js (Sarvam routes). The Elastic Cloud project itself is a Serverless project, Elasticsearch 9.6.0; AWS enters through Bedrock for model inference.");
}

// ================================================================ 10. honesty (white)
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  title(s, "What is real, what is synthetic, what production needs", { fontSize: 25 });
  const cols = [
    ["Real and running", ["Strict mappings, ES|QL match, classification, evidence and trace tools", "Hybrid precedent search on Elasticsearch 9.6.0", "Agent Builder agent with 10 tools; 5 workflows registered and valid", "Console with streaming, instant verdict, traceability check, chat drawer", "verify scorecard and 19 unit tests"], C.greenTint, C.green],
    ["Synthetic or conditional, by design", ["All data: generated from seed 20260916 by src/generate.js, no production or customer data (DATA.md)", "Spans generated in APM/ECS shape; the same ES|QL runs against traces-apm-*", "Partner files bulk-loaded, not via S3 and Lambda", "Model: Bedrock via inference endpoint when AWS credentials are valid, else the Elastic Managed LLM", "Sarvam features appear only with SARVAM_API_KEY"], C.bg, C.line],
    ["Out of scope on purpose", ["Live bank or PSP connections: seeded data keeps results reproducible for judging", "Any movement of funds: every write stays behind human approval, the right posture for regulated money", "Pre-build-day work is declared file by file in PRIOR_WORK.md; CHANGELOG.md has the build-day log"], C.amberTint, C.amber],
  ];
  cols.forEach(([h, items, fill, border], i) => {
    const x = 0.5 + i * 3.1;
    box(s, x, 1.15, 2.9, 2.75, { fill: { color: fill }, line: { color: border, width: 1 } });
    text(s, h, { x: x + 0.15, y: 1.25, w: 2.6, h: 0.3, fontSize: 12.5, bold: true, color: C.navy });
    bullets(s, items, { x: x + 0.15, y: 1.6, w: 2.6, h: 2.25, fontSize: 9.5 });
  });
  text(s, "What production needs", { x: 0.5, y: 4.05, w: 9, h: 0.3, fontSize: 13, bold: true, color: C.navy });
  text(s, "Real APM instrumentation (the ES|QL is already ECS-shaped) · S3 → Lambda ingest normalising each partner's file into the one settlement-row schema · Bedrock under the institution's own AWS account with Guardrails · RBAC on who may approve which action, reversals behind a second approval · a learning loop that writes each approved resolution back into the precedent library · time-partitioned data streams by business_date at volume.", { x: 0.5, y: 4.37, w: 9, h: 0.75, fontSize: 10, color: C.ink });
  s.addNotes("Say this slide out loud without apology. Synthetic is stated everywhere (DATA.md). If asked what existed before the 18th: the generator, mappings, tools, agent instructions, the open-case workflow, console, tests and deck were drafted on 17 Sep and tested before build day; on the 18th: one action per break type, the instant ES|QL verdict, the chat drawer and voice, the recording, SUBMISSION.md. PRIOR_WORK.md and the git history tell the same story.");
}

// ================================================================ 11. close (dark)
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  text(s, "The model explains.\nES|QL decides.\nEvery number is traceable.", { x: 0.6, y: 1.1, w: 8.8, h: 2.0, fontFace: F.title, fontSize: 36, bold: true, color: C.greenBright, lineSpacingMultiple: 1.15 });
  text(s, "LedgerLens turns a 30 to 60 minute manual investigation into a report a compliance reviewer signs off in seconds, with the action taken and audited, and with zero figures produced by a language model.", { x: 0.6, y: 3.2, w: 8.8, h: 0.8, fontSize: 14, color: C.ice });
  text(s, "In the repository: SUBMISSION.md (the full write-up) · DATA.md (provenance) · BENCHMARKS.md (every number) · DEMO.md (run of show) · PRIOR_WORK.md (what existed before the 18th)\nDemo video: https://drive.google.com/drive/folders/1NshA5kMjrgcHVpebO42XmyKdH1lsAHc7", { x: 0.6, y: 4.1, w: 8.8, h: 0.8, fontSize: 10.5, color: C.ice });
  footer(s, "Forge the Future 2026 · Elastic × AWS · Track 4: Industry Vertical Demo (BFSI) · Mridul Mahajan, Backend Engineer, Lending", C.ice);
  s.addNotes("Likely questions and the short answers (full versions in DEMO.md).\nHow is this different from a rules engine? The rules are the classifier, on purpose. What rules cannot do is read a trace, find a precedent, write a root cause a compliance reviewer can sign, and take a gated action.\nWhy not let the model compute the delta? Then nobody can sign off on it. An amount from a model is an opinion; an amount from STATS SUM(...) BY disbursal_id is a fact with a query attached.\nExplain your search. Four indices, strict mappings, keyword for every identifier. The match is one STATS over a unified index, no join. Precedent retrieval is hybrid: FORK a BM25 branch and a semantic_text branch, FUSE with RRF, one query; Elastic embeds at index and query time.\nWhat can it actually do? Five actions, one per break type, each an Elastic Workflow: open a case, raise a reversal, log a fee dispute, close a timing break, escalate. Nothing runs until a human types approve; every run writes an audit record.\nWhat would production need? Real APM, S3 to Lambda ingest, Bedrock under the bank's account, RBAC, a second approval on reversals.\nWhat is the manual time you quote? My own estimate from production, 30 to 60 minutes per break. Not a benchmark, and the slide says so.");
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));
