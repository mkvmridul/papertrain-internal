// LedgerLens history console: a read-only companion to src/console/server.js.
//
// The investigation console answers "what is broken right now". This one answers "what has happened
// so far": every action the agent took, which breaks are closed and which are still open and why,
// which workflow fired and which did not, and the full cross-index history of one disbursal.
//
// It shares nothing with the investigation console but src/es.js, src/actions.js and the ES|QL tool
// files, so neither can break the other. Every figure below is computed by an ES|QL query; this file
// filters, sorts and joins on identifiers, and computes nothing about money.
//
//   GET /                                  the page
//   GET /api/h/config                      indices, business dates, action registry, Kibana URL
//   GET /api/h/audit                       ledgerlens-audit, newest first (view 1)
//   GET /api/h/cases                       every ES|QL-flagged break, resolved or open, with reason (view 2)
//   GET /api/h/workflows                   the five workflows, what each ran and what it did not (view 3)
//   GET /api/h/precedents?q=               ledgerlens-resolved-breaks, hybrid search when q is given
//   GET /api/h/timeline?disbursal_id=      ledger + settlement + pipeline + actions on one time axis

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { es, esql, KIBANA_URL } from "../es.js";
import { ACTIONS, actionFor } from "../actions.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = Number(process.env.HISTORY_PORT || 3100);

const tools = JSON.parse(readFileSync(join(ROOT, "elastic", "tools", "tools.json"), "utf8"));
const queryOf = (id) => readFileSync(join(ROOT, "elastic", "tools", tools.find((t) => t.id === id).query_file), "utf8");

const INDICES = ["ledgerlens-recon", "ledgerlens-traces", "ledgerlens-resolved-breaks", "ledgerlens-audit"];

// ---------------------------------------------------------------- shared reads

/** The business dates the ledger actually covers, ascending. Everything date-scoped derives from this. */
async function businessDates() {
  const { rows } = await esql(
    `FROM ledgerlens-recon
     | WHERE source == "ledger" AND event_type == "DISBURSAL_SUCCEEDED"
     | STATS disbursals = COUNT(*) BY business_date
     | SORT business_date ASC`,
  );
  return rows;
}

/**
 * Every break ES|QL flags, across every business date. ledgerlens.list_breaks is per-day by design,
 * so it is run once per day and the results concatenated; the classification still happens in the
 * one tool file the agent uses, never here.
 */
async function allBreaks(dates) {
  const q = queryOf("ledgerlens.list_breaks");
  const perDay = await Promise.all(dates.map((d) => esql(q, { business_date: d.business_date })));
  return perDay.flatMap((r) => r.rows);
}

/** The audit index in full. Append-only and small by nature; 1000 is far above anything a demo writes. */
async function auditAll() {
  const { rows } = await esql(`FROM ledgerlens-audit | SORT @timestamp DESC | LIMIT 1000`);
  return rows;
}

/** Past human-resolved cases. Fields the page shows, plus the rupee conversions ES|QL computes. */
const PRECEDENT_KEEP = `| EVAL amount_inr = amount_paise / 100.0, delta_inr = delta_paise / 100.0
   | KEEP case_id, opened_at, resolved_at, business_date, break_type, partner, rail, disbursal_id,
          amount_inr, delta_inr, summary, root_cause, resolution, resolved_by, time_to_resolve_minutes, tags`;

async function precedents(q) {
  const search = q && q.trim()
    // The agent's own hybrid retrieval tool: BM25 on summary, semantic on summary_semantic, fused with RRF.
    ? esql(queryOf("ledgerlens.similar_cases"), { query: q.trim() })
    : esql(`FROM ledgerlens-resolved-breaks | SORT resolved_at DESC | LIMIT 100 ${PRECEDENT_KEEP}`);
  const [r, bench] = await Promise.all([search, benchmarks()]);
  return { rows: r.rows, took: r.took, mode: q && q.trim() ? "hybrid" : "recent", benchmarks: bench };
}

/** How long a human historically took on each break type, so an open break can be read against it. */
async function benchmarks() {
  const { rows } = await esql(
    `FROM ledgerlens-resolved-breaks
     | STATS cases = COUNT(*),
             median_minutes = MEDIAN(time_to_resolve_minutes),
             p90_minutes = PERCENTILE(time_to_resolve_minutes, 90),
             first_case = MIN(opened_at),
             last_case = MAX(resolved_at)
       BY break_type
     | SORT cases DESC`,
  );
  return rows;
}

// ---------------------------------------------------------------- views

async function config() {
  const [dates, counts] = await Promise.all([
    businessDates(),
    es("GET", `/_cat/indices/ledgerlens-*?format=json&h=index,docs.count`).catch(() => []),
  ]);
  const docs = Object.fromEntries((counts ?? []).map((c) => [c.index, Number(c["docs.count"])]));
  return {
    business_dates: dates,
    indices: INDICES.map((index) => ({ index, docs: docs[index] ?? null })),
    actions: ACTIONS.map(({ tool_id, workflow_id, break_type, label, verb, audit_action, severity }) => ({
      tool_id, workflow_id, break_type, label, verb, audit_action, severity,
    })),
    kibana_url: KIBANA_URL(),
    demo_business_date: process.env.DEMO_BUSINESS_DATE || "2026-09-16",
  };
}

/** View 1: past audits. Every record an approved workflow wrote, plus the shape of the set. */
async function auditView() {
  const rows = await auditAll();
  const uniq = (f) => [...new Set(rows.map((r) => r[f]).filter(Boolean))];
  return {
    rows,
    stats: {
      records: rows.length,
      disbursals: uniq("disbursal_id").length,
      approvers: uniq("approved_by"),
      cases: rows.filter((r) => r.case_id && r.case_id !== "no-kibana-case").length,
      first: rows.length ? rows[rows.length - 1]["@timestamp"] : null,
      last: rows.length ? rows[0]["@timestamp"] : null,
      by_action: Object.entries(rows.reduce((a, r) => ((a[r.action] = (a[r.action] ?? 0) + 1), a), {})).map(([action, n]) => ({ action, n })),
    },
  };
}

/**
 * View 2: resolved against unresolved, with the reason for each.
 *
 * A break is resolved when something closed it, and there are exactly two ways that can have happened:
 * an Elastic Workflow wrote an audit record after a human approved in the console, or an analyst
 * resolved it by hand before LedgerLens existed and it sits in the precedent index. Anything else is
 * open, and the reason it is open is the ES|QL rule that classified it.
 */
async function casesView() {
  const dates = await businessDates();
  const breaks = await allBreaks(dates);
  const [deltas, audit, resolved, bench] = await Promise.all([
    // ledgerlens.break_delta is the only place a break is classified, so rule_fired is read from it
    // rather than restated here. One call per flagged break; there are fourteen of them.
    Promise.all(breaks.map((b) => esql(queryOf("ledgerlens.break_delta"), { disbursal_id: b.disbursal_id }).then((r) => r.rows[0] ?? null))),
    auditAll(),
    esql(`FROM ledgerlens-resolved-breaks | SORT resolved_at DESC | LIMIT 500 ${PRECEDENT_KEEP}`).then((r) => r.rows),
    benchmarks(),
  ]);

  const byDisbursal = (list) => list.reduce((a, r) => ((a[r.disbursal_id] ??= []).push(r), a), {});
  const auditBy = byDisbursal(audit);
  const humanBy = byDisbursal(resolved);

  const cases = breaks.map((b, i) => {
    const d = deltas[i];
    const acted = auditBy[b.disbursal_id] ?? [];
    const human = (humanBy[b.disbursal_id] ?? [])[0] ?? null;
    const action = actionFor(b.break_type);
    return {
      ...b,
      rule_fired: d?.rule_fired ?? null,
      utrs: d?.utrs ?? null,
      settlement_row_ids: d?.settlement_row_ids ?? null,
      ledger_event_ids: d?.ledger_event_ids ?? null,
      eligible_action: action ? { label: action.label, workflow_id: action.workflow_id, audit_action: action.audit_action } : null,
      status: acted.length ? "closed_by_agent" : human ? "closed_by_human" : "open",
      agent_actions: acted,
      human_case: human,
    };
  });

  const count = (s) => cases.filter((c) => c.status === s).length;
  return {
    cases,
    benchmarks: bench,
    stats: {
      flagged: cases.length,
      open: count("open"),
      closed_by_agent: count("closed_by_agent"),
      closed_by_human: count("closed_by_human"),
      business_dates: dates,
      precedent_cases: resolved.length,
    },
  };
}

/**
 * The steps of a workflow, read from its YAML. Only the step list is parsed: enough to show what the
 * workflow does in order without pulling in a YAML dependency, and it stays honest because it reads
 * the file that actually runs.
 */
function workflowShape(workflow_id) {
  let text;
  try {
    text = readFileSync(join(ROOT, "elastic", "workflows", `${workflow_id}.yaml`), "utf8");
  } catch {
    return { steps: [], inputs: [], missing: true };
  }
  const [head, tail = ""] = text.split(/\nsteps:\n/);
  const split = (s) => s.split(/\n(?=\s{2}- name: )/).slice(1);
  const parse = (chunk) => ({
    name: chunk.match(/- name: (\S+)/)?.[1] ?? null,
    type: chunk.match(/\n\s+type: (\S+)/)?.[1] ?? null,
    required: /\n\s+required: true/.test(chunk),
  });
  const inputsBlock = head.split(/\ninputs:\n/)[1]?.split(/\n(?=[a-z_]+:)/)[0] ?? "";
  return {
    steps: split("\n" + tail).map(parse).filter((s) => s.name && s.type),
    inputs: split("\n" + inputsBlock).map(parse).filter((s) => s.name),
    opens_case: /type:\s*cases\.createCase/.test(tail),
    missing: false,
  };
}

/** View 3: the five workflows, what each one ran, and which eligible breaks it has not run on. */
async function workflowsView() {
  const dates = await businessDates();
  const [breaks, audit, human] = await Promise.all([
    allBreaks(dates),
    auditAll(),
    // A break the workflow never ran on may still be closed: an analyst may have resolved it by hand
    // before LedgerLens existed. Saying "not taken" without that distinction would overstate the gap.
    esql(`FROM ledgerlens-resolved-breaks | KEEP disbursal_id, case_id, resolved_by`).then((r) => r.rows),
  ]);
  const actedIds = new Set(audit.map((r) => r.disbursal_id));
  const humanBy = new Map(human.map((r) => [r.disbursal_id, r]));

  const workflows = ACTIONS.map((a) => {
    const taken = audit.filter((r) => r.action === a.audit_action);
    const eligible = breaks.filter((b) => b.break_type === a.break_type);
    return {
      ...a,
      ...workflowShape(a.workflow_id),
      taken,
      eligible: eligible.length,
      not_taken: eligible
        .filter((b) => !actedIds.has(b.disbursal_id))
        .map((b) => ({ ...b, human_case: humanBy.get(b.disbursal_id) ?? null })),
    };
  });

  // Break types the classifier can produce that no workflow serves. Stated rather than hidden: an
  // empty action list is a decision, not a gap.
  const served = new Set(ACTIONS.map((a) => a.break_type));
  const unserved = [
    { break_type: "MATCHED", why: "Ledger and settlement agree on amount, fee and value date. Nothing to action." },
    { break_type: "NO_LEDGER_SUCCESS", why: "The ledger never booked DISBURSAL_SUCCEEDED, so there is no disbursal to reconcile." },
  ].filter((u) => !served.has(u.break_type));

  return {
    workflows,
    unserved,
    stats: {
      defined: workflows.length,
      runs: audit.length,
      eligible: breaks.length,
      pending: workflows.reduce((n, w) => n + w.not_taken.filter((b) => !b.human_case).length, 0),
      closed_by_hand: workflows.reduce((n, w) => n + w.not_taken.filter((b) => b.human_case).length, 0),
    },
  };
}

/** View 5: one disbursal, every index, one time axis. */
async function timelineView(disbursal_id) {
  const [delta, evidence, spans, audit] = await Promise.all([
    esql(queryOf("ledgerlens.break_delta"), { disbursal_id }).then((r) => r.rows[0] ?? null),
    esql(queryOf("ledgerlens.evidence_rows"), { disbursal_id }).then((r) => r.rows),
    esql(queryOf("ledgerlens.trace_failure_point"), { disbursal_id }).then((r) => r.rows),
    esql(`FROM ledgerlens-audit | WHERE disbursal_id == ?disbursal_id | SORT @timestamp ASC`, { disbursal_id }).then((r) => r.rows),
  ]);

  // The trace tool sorts failures first so the agent sees the failure point immediately. A timeline
  // needs clock order, so the same rows are re-sorted here. Presentation only; no row is changed.
  const events = [
    ...evidence.map((r) => ({ lane: r.source === "settlement" ? "settlement" : "ledger", at: r["@timestamp"], row: r })),
    ...spans.map((r) => ({ lane: "pipeline", at: r["@timestamp"], row: r })),
    ...audit.map((r) => ({ lane: "action", at: r["@timestamp"], row: r })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return { disbursal_id, delta, events, counts: { ledger: evidence.filter((r) => r.source === "ledger").length, settlement: evidence.filter((r) => r.source === "settlement").length, pipeline: spans.length, action: audit.length } };
}

// ---------------------------------------------------------------- http

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "Content-Type": type + (type.startsWith("text") ? "; charset=utf-8" : ""), "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

/**
 * Handle one request when it belongs to the history console: GET /history (the page) or GET /api/h/*.
 * Returns true when it answered, so src/console/server.js can mount this on its own port and fall through
 * to its own routes otherwise. Standalone (see below) the page is also served at /.
 */
export async function handleHistory(req, res, url, { root = false } = {}) {
  const isPage = url.pathname === "/history" || (root && url.pathname === "/");
  if (!isPage && !url.pathname.startsWith("/api/h/")) return false;
  try {
    if (req.method !== "GET") {
      send(res, 405, { error: "this console is read-only" });
      return true;
    }
    if (isPage) {
      send(res, 200, readFileSync(join(HERE, "history.html"), "utf8"), "text/html");
      return true;
    }
    switch (url.pathname) {
      case "/api/h/config":
        send(res, 200, await config());
        return true;
      case "/api/h/audit":
        send(res, 200, await auditView());
        return true;
      case "/api/h/cases":
        send(res, 200, await casesView());
        return true;
      case "/api/h/workflows":
        send(res, 200, await workflowsView());
        return true;
      case "/api/h/precedents":
        send(res, 200, await precedents(url.searchParams.get("q") ?? ""));
        return true;
      case "/api/h/timeline": {
        const id = url.searchParams.get("disbursal_id") ?? "";
        if (!/^DSB-\d{8}-\d{5}$/.test(id)) send(res, 400, { error: "disbursal_id must look like DSB-YYYYMMDD-NNNNN" });
        else send(res, 200, await timelineView(id));
        return true;
      }
      default:
        send(res, 404, { error: "not found" });
        return true;
    }
  } catch (e) {
    console.error(`${req.method} ${url.pathname} -> ${e.message}`);
    send(res, e.status >= 400 && e.status < 600 ? e.status : 500, { error: e.message });
    return true;
  }
}

// Standalone: `node --env-file=.env src/console/history-server.js` listens on HISTORY_PORT (default 3100).
// When src/console/server.js imports this file, nothing here listens; the main console serves /history itself.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (!(await handleHistory(req, res, url, { root: true }))) send(res, 404, { error: "not found" });
  }).listen(PORT, () => {
    console.log(`LedgerLens history  http://localhost:${PORT}`);
    console.log(`  read-only. audit trail, case ledger, workflow log, precedent library, per-disbursal timeline.`);
  });
}
