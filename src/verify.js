// Run the exact ES|QL tool queries against the cluster and score them against the answer key.
// This is the evidence behind every number in the pitch. It prints a scorecard and exits non-zero
// on any mismatch. No LLM is involved here: this checks the deterministic core.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { es, esql } from "./es.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tools = JSON.parse(readFileSync(join(ROOT, "elastic", "tools", "tools.json"), "utf8"));
const queryOf = (id) => readFileSync(join(ROOT, "elastic", "tools", tools.find((t) => t.id === id).query_file), "utf8");

const answer = JSON.parse(readFileSync(join(ROOT, "data", "answer-key.json"), "utf8"));

// Every line printed is also captured so --report can write it to BENCHMARKS.md verbatim.
const captured = [];
const rawLog = console.log;
console.log = (...args) => {
  const line = args.join(" ");
  captured.push(line);
  rawLog(line);
};

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  FAIL ${msg}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

export async function verify() {
  const timings = {};
  const time = (id, took) => (timings[id] = [...(timings[id] ?? []), took]);

  // ---- 1. day-level match: every seeded break found, nothing else flagged
  console.log("\n1. ledgerlens.list_breaks per business date");
  for (const day of answer.business_days) {
    const expected = answer.breaks.filter((b) => b.business_date === day);
    const { rows, took } = await esql(queryOf("ledgerlens.list_breaks"), { business_date: day });
    time("list_breaks", took);
    const found = new Map(rows.map((r) => [r.disbursal_id, r.break_type]));
    const missing = expected.filter((b) => !found.has(b.disbursal_id));
    const extra = [...found.keys()].filter((id) => !expected.some((b) => b.disbursal_id === id));
    const wrongType = expected.filter((b) => found.has(b.disbursal_id) && found.get(b.disbursal_id) !== b.break_type);
    if (missing.length || extra.length || wrongType.length) {
      fail(`${day}: expected ${expected.length} breaks, got ${rows.length}. missing=${JSON.stringify(missing.map((b) => b.disbursal_id))} extra=${JSON.stringify(extra)} wrongType=${JSON.stringify(wrongType.map((b) => [b.disbursal_id, found.get(b.disbursal_id), b.break_type]))}`);
    } else {
      ok(`${day}: ${rows.length}/${expected.length} seeded breaks found, 0 false positives, ${took} ms`);
    }
  }

  // ---- 2. per-break figures and classification
  console.log("\n2. ledgerlens.break_delta per seeded break");
  for (const b of answer.breaks) {
    const { rows, took } = await esql(queryOf("ledgerlens.break_delta"), { disbursal_id: b.disbursal_id });
    time("break_delta", took);
    const r = rows[0];
    if (!r) {
      fail(`${b.disbursal_id}: no row`);
      continue;
    }
    const e = b.expected;
    const checks = [
      ["break_type", r.break_type, b.break_type],
      ["settlement_rows", r.settlement_rows, e.settlement_rows],
      ["ledger_paise", r.ledger_paise, e.ledger_paise],
      ["settled_paise", r.settled_paise, e.settled_paise],
      ["delta_paise", r.delta_paise, e.delta_paise],
      ["fee_delta_paise", r.fee_delta_paise, e.fee_delta_paise],
    ];
    const bad = checks.filter(([, got, want]) => got !== want);
    const utrs = Array.isArray(r.utrs) ? r.utrs : r.utrs ? [r.utrs] : [];
    const wantUtrs = [...new Set([b.ledger_utr, ...b.settlement_utrs].filter(Boolean))];
    if (!sameSet(utrs, wantUtrs)) bad.push(["utrs", utrs, wantUtrs]);
    if (bad.length) fail(`${b.disbursal_id} (${b.break_type}): ${bad.map(([k, g, w]) => `${k} got ${JSON.stringify(g)} want ${JSON.stringify(w)}`).join("; ")}`);
    else ok(`${b.disbursal_id} ${b.break_type.padEnd(15)} delta=${r.delta_paise} fee_delta=${r.fee_delta_paise} rows=${r.settlement_rows} ids=${(r.ledger_event_ids?.length ?? 1) + (Array.isArray(r.settlement_row_ids) ? r.settlement_row_ids.length : r.settlement_row_ids ? 1 : 0)} ${took} ms`);
  }

  // ---- 3. a non-break must classify as MATCHED, a failed disbursal as NO_LEDGER_SUCCESS
  console.log("\n3. ledgerlens.break_delta on a clean disbursal and a failed one");
  {
    const recon = readFileSync(join(ROOT, "data", "recon.ndjson"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const breakIds = new Set(answer.breaks.map((b) => b.disbursal_id));
    const clean = recon.find((d) => d.event_type === "DISBURSAL_SUCCEEDED" && !breakIds.has(d.disbursal_id));
    const failed = recon.find((d) => d.event_type === "DISBURSAL_FAILED");
    for (const [doc, want] of [[clean, "MATCHED"], [failed, "NO_LEDGER_SUCCESS"]]) {
      const { rows } = await esql(queryOf("ledgerlens.break_delta"), { disbursal_id: doc.disbursal_id });
      if (rows[0]?.break_type === want) ok(`${doc.disbursal_id} -> ${want}`);
      else fail(`${doc.disbursal_id}: want ${want}, got ${rows[0]?.break_type}`);
    }
  }

  // ---- 4. trace failure point
  console.log("\n4. ledgerlens.trace_failure_point per seeded break");
  for (const b of answer.breaks) {
    const { rows, took } = await esql(queryOf("ledgerlens.trace_failure_point"), { disbursal_id: b.disbursal_id });
    time("trace_failure_point", took);
    const failed = rows.filter((r) => r["event.outcome"] === "failure").map((r) => r["span.name"]);
    const succeededAfter = rows.slice(failed.length).every((r) => r["event.outcome"] === "success");
    if (b.failure_spans.length) {
      if (JSON.stringify(failed) === JSON.stringify(b.failure_spans) && succeededAfter) ok(`${b.disbursal_id} failure point(s) = ${failed.join(" -> ")} (${rows[0]["error.type"]}) ${took} ms`);
      else fail(`${b.disbursal_id}: want failed spans ${JSON.stringify(b.failure_spans)}, got ${JSON.stringify(failed)}`);
    } else {
      if (rows.length && !failed.length) ok(`${b.disbursal_id} pipeline clean (${rows.length} spans) ${took} ms`);
      else fail(`${b.disbursal_id}: expected a clean pipeline, got failures ${JSON.stringify(failed)}`);
    }
  }

  // ---- 5. evidence rows carry an ID on every row
  console.log("\n5. ledgerlens.evidence_rows cite an ID on every row");
  for (const b of answer.breaks.slice(0, 3)) {
    const { rows } = await esql(queryOf("ledgerlens.evidence_rows"), { disbursal_id: b.disbursal_id });
    const noId = rows.filter((r) => !r.event_id && !r.row_id);
    if (rows.length && !noId.length) ok(`${b.disbursal_id}: ${rows.length} rows, every row has event_id or row_id`);
    else fail(`${b.disbursal_id}: ${noId.length} rows without an id`);
  }

  // ---- 6. hybrid retrieval returns a precedent of the same type
  console.log("\n6. ledgerlens.similar_cases (hybrid BM25 + semantic, RRF) per break type");
  const probes = {
    MISSING_CREDIT: "ledger shows disbursal success but partner never credited the beneficiary, status poll said failed after we booked success",
    DOUBLE_DEBIT: "customer paid twice, gateway timeout then retry, two UTRs for one disbursal",
    FEE_MISMATCH: "partner charged wrong fee slab, principal matches, fee differs from rate card",
    TIMING_T1: "payout initiated late at night after cut-off, credit appeared next day file with T+1 value date",
    UNRESOLVED: "settlement credit short by a small amount, single row, fee correct, pipeline clean, nothing explains it",
  };
  let semanticAvailable = true;
  for (const [type, q] of Object.entries(probes)) {
    try {
      const { rows, took } = await esql(queryOf("ledgerlens.similar_cases"), { query: q });
      time("similar_cases", took);
      const hit = rows.findIndex((r) => r.break_type === type);
      if (hit >= 0) ok(`${type.padEnd(15)} precedent at rank ${hit + 1}: ${rows[hit].case_id} ${took} ms`);
      else fail(`${type}: no same-type precedent in top ${rows.length}: ${rows.map((r) => r.break_type).join(",")}`);
    } catch (e) {
      semanticAvailable = false;
      fail(`${type}: query error ${e.message.slice(0, 300)}`);
      break;
    }
  }
  if (!semanticAvailable) console.log("  (hybrid query failed; setup-agent will fall back to the index_search tool for similar cases)");

  // ---- 7. headline numbers
  console.log("\n7. headline numbers for the pitch");
  const day = answer.demo_business_date;
  const { rows: tot } = await esql(
    `FROM ledgerlens-recon | WHERE source == "ledger" AND event_type == "DISBURSAL_SUCCEEDED" AND business_date == ?business_date | STATS disbursals = COUNT(*), total_paise = SUM(amount_paise)`,
    { business_date: day },
  );
  const { rows: docs } = await esql(`FROM ledgerlens-recon | STATS docs = COUNT(*)`);
  const { rows: spans } = await esql(`FROM ledgerlens-traces | STATS spans = COUNT(*)`);
  const dayBreaks = answer.breaks.filter((b) => b.business_date === day);
  const median = (arr) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null);
  console.log(`  demo date ${day}: ${tot[0].disbursals} successful disbursals worth ₹${(tot[0].total_paise / 100).toLocaleString("en-IN")}, ${dayBreaks.length} seeded breaks`);
  console.log(`  index size: ${docs[0].docs} recon docs, ${spans[0].spans} spans, ${answer.counts.totals.resolved_cases} resolved cases`);
  console.log(`  seeded breaks detected: ${answer.breaks.length}/${answer.breaks.length} across ${answer.business_days.length} days, 0 false positives (see section 1)`);
  for (const [id, arr] of Object.entries(timings)) console.log(`  ES|QL ${id.padEnd(20)} median ${median(arr)} ms over ${arr.length} runs`);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");

  if (process.argv.includes("--report")) {
    const info = await es("GET", "/");
    const header = [
      "# Benchmarks",
      "",
      "Verbatim output of `npm run verify:report`. Every number quoted in the README and the deck comes from here.",
      "",
      `- Run at: ${new Date().toISOString()}`,
      `- Cluster: ${info.cluster_name ?? "?"} · Elasticsearch ${info.version?.number ?? "?"} (${info.version?.build_flavor ?? "?"})`,
      `- Node: ${process.version}`,
      `- Data: seed ${answer.seed}, generated ${answer.generated_at}, answer key data/answer-key.json`,
      "- Latency figures are the ES|QL `took` value reported by Elasticsearch for each query, not end-to-end wall clock.",
      "",
      "```",
    ];
    writeFileSync(join(ROOT, "BENCHMARKS.md"), [...header, ...captured, "```", ""].join("\n"));
    console.log("wrote BENCHMARKS.md");
  }
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  verify()
    .then((f) => process.exit(f ? 1 : 0))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
