// Traceability check: does every figure and identifier in the agent's report appear verbatim in a
// tool result? Runs in the browser (console page) and under node:test. No dependencies.
//
// The LLM is allowed to add ₹ and thousands separators. It is not allowed to change digits.
// So we compare numerically after stripping formatting, and compare IDs as exact strings.

const ID_RE = /\b(?:DSB|EVT|STL|TRC|SPN|CASE|LN|CUST)-[A-Z0-9-]+\b|\b(?:PAYS|NRTH|MRDN)\d{16}\b/g;
// ₹ 51,500.00  |  ₹-3,26,100.00  |  -₹1,000  |  INR 590.00  |  Rs. 5.90
const AMOUNT_RE = /(-?\s?(?:₹|INR|Rs\.?)\s?-?[\d,]+(?:\.\d+)?)/g;

/** Walk any JSON value and collect every number (and numeric string) and every string. */
export function extractFacts(steps) {
  const numbers = new Map(); // value -> tool id
  const strings = new Map(); // string -> tool id
  const visit = (v, tool) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number") {
      if (!numbers.has(v)) numbers.set(v, tool);
      return;
    }
    if (typeof v === "string") {
      if (!strings.has(v)) strings.set(v, tool);
      const n = Number(v);
      if (v.trim() !== "" && Number.isFinite(n) && !numbers.has(n)) numbers.set(n, tool);
      for (const id of v.match(ID_RE) ?? []) if (!strings.has(id)) strings.set(id, tool);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => visit(x, tool));
    if (typeof v === "object") {
      // The ES|QL tool result echoes the resolved query text; that is not evidence.
      for (const [k, x] of Object.entries(v)) if (k !== "esql" && k !== "query") visit(x, tool);
    }
  };
  for (const s of steps ?? []) {
    if (s.type !== "tool_call") continue;
    visit(s.results, s.tool_id);
  }
  return { numbers, strings };
}

const parseAmount = (raw) => {
  const negative = /-/.test(raw);
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const v = Number(digits);
  return Number.isFinite(v) ? (negative ? -v : v) : null;
};

/**
 * Check a report against the facts. Returns per-token verdicts and a summary.
 * A figure is traced when its numeric value (or its absolute value, to forgive sign placement)
 * equals a number returned by a tool, or equals a paise value / 100.
 */
export function checkReport(report, facts) {
  const amounts = [];
  for (const m of report.matchAll(AMOUNT_RE)) {
    const raw = m[1];
    const value = parseAmount(raw);
    if (value === null) continue;
    const hit = [value, -value, Math.abs(value)].find((v) => facts.numbers.has(v));
    const paiseHit = hit === undefined ? [...facts.numbers.keys()].find((n) => Number.isInteger(n) && Math.abs(n / 100 - Math.abs(value)) < 1e-9) : undefined;
    amounts.push({ raw: raw.trim(), value, traced: hit !== undefined || paiseHit !== undefined, source: facts.numbers.get(hit ?? paiseHit) ?? null, index: m.index });
  }
  const ids = [];
  for (const m of report.matchAll(ID_RE)) {
    const id = m[0];
    ids.push({ raw: id, traced: facts.strings.has(id), source: facts.strings.get(id) ?? null, index: m.index });
  }
  const traced = amounts.filter((a) => a.traced).length + ids.filter((i) => i.traced).length;
  const total = amounts.length + ids.length;
  return { amounts, ids, total, traced, untraced: total - traced, complete: total > 0 && traced === total };
}

/** Wrap every checked token in <mark> so the page can colour it. Input is plain text; output is HTML. */
export function annotate(report, result) {
  const tokens = [...result.amounts, ...result.ids].sort((a, b) => a.index - b.index);
  let out = "";
  let cursor = 0;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const t of tokens) {
    if (t.index < cursor) continue;
    const start = report.indexOf(t.raw, t.index);
    if (start < 0) continue;
    out += esc(report.slice(cursor, start));
    const title = t.traced ? `traced to ${t.source}` : "NOT found in any tool result";
    out += `<mark class="${t.traced ? "traced" : "untraced"}" title="${title}">${esc(t.raw)}</mark>`;
    cursor = start + t.raw.length;
  }
  out += esc(report.slice(cursor));
  return out;
}
