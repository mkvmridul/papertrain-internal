// The action registry: one Elastic Workflow per break type, exposed to the agent as a workflow tool.
// elastic/workflows/actions.json is the single source; this module reads it and builds workflow inputs
// from a ledgerlens.break_delta row when the console runs a workflow without the agent
// (CASE_MODE=direct, or AGENT_MODE=mock). Shared by src/setup-agent.js, src/console/server.js and tests/.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const ACTIONS = JSON.parse(readFileSync(join(ROOT, "elastic", "workflows", "actions.json"), "utf8"));

/** The one action defined for a break_type, or null (MATCHED and NO_LEDGER_SUCCESS have none). */
export const actionFor = (break_type) => ACTIONS.find((a) => a.break_type === break_type) ?? null;

const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const inr = (v) => "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The text under **Draft message:** in a report, or "" when the report has no such section. */
export function draftFrom(report) {
  // Accepts both `**Draft message:** text` (the report format) and `**Draft message** (to X): text`.
  const m = String(report || "").match(/\*\*Draft message:?\*\*(?:\s*\([^)\n]*\))?\s*:?\s*([\s\S]*?)(?=\n\s*\*\*|\n\s*Reply\b|$)/i);
  return m ? m[1].trim() : "";
}

/**
 * Workflow inputs for one action, built from a break_delta row the same way the agent is instructed
 * to build them: every figure and ID copied from the tool row, formatting only. Without the agent
 * there is no one to single out the duplicate UTR or the next-day row, so every candidate is named
 * and the human reading the case picks.
 */
export function inputsFor(action, d, { report = "", message = "", approved_by = "ops-analyst" } = {}) {
  const base = {
    title: `${d.break_type} · ${d.disbursal_id} · Delta ${inr(d.delta_inr)}`,
    disbursal_id: d.disbursal_id,
    break_type: d.break_type,
    report,
    approved_by,
  };
  const msg = message || draftFrom(report) || `${action.label} for ${d.disbursal_id} (${d.break_type}, ${d.partner}/${d.rail}).`;
  const utrs = asList(d.utrs).join(", ");
  switch (action.tool_id) {
    case "ledgerlens.open_case":
      return { ...base, severity: action.severity };
    case "ledgerlens.raise_reversal":
      return { ...base, partner: d.partner, utr: utrs, delta_inr: String(d.delta_inr), message: msg };
    case "ledgerlens.log_fee_dispute":
      return { ...base, partner: d.partner, rail: d.rail, charged_fee_inr: String(d.charged_fee_inr), expected_fee_inr: String(d.expected_fee_inr), fee_delta_inr: String(d.fee_delta_inr), message: msg };
    case "ledgerlens.close_timing":
      return { ...base, partner: d.partner, settlement_row_id: asList(d.settlement_row_ids).join(", "), value_date: String(d.value_date), message: msg };
    case "ledgerlens.escalate_partner":
      return { ...base, partner: d.partner, utr: utrs, delta_inr: String(d.delta_inr), message: msg };
    default:
      throw new Error(`unknown action ${action.tool_id}`);
  }
}
