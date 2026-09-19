// Question refinement for the chat drawer. One small model call rewrites the analyst's free-text message into a
// precise instruction before it is sent to the agent (the local loop or Agent Builder). The rewriter sees the
// console's context only: business date, selected disbursal, the tool list. It never sees tool results and is told
// not to answer, so it cannot introduce a figure. It fails open: on any error, or when the message must not be
// touched (approvals, dismissals, the standard Investigate command), the original text is used unchanged.
// The pure helpers are exported for tests; refineQuestion() takes the model call as a parameter so tests never touch the network.

const PASS_THROUGH_RE = /\b(approve|approved|yes|go ahead|do it|confirm|proceed|dismiss|dismissed|cancel|stop)\b/i;
const INVESTIGATE_RE = /^\s*investigate\s+DSB-\d{8}-\d{5}\.?\s*$/i;
const DISBURSAL_RE = /DSB-\d{8}-\d{5}/g;
export const BREAK_TYPES = ["MATCHED", "NO_LEDGER_SUCCESS", "MISSING_CREDIT", "DOUBLE_DEBIT", "FEE_MISMATCH", "TIMING_T1", "UNRESOLVED"];

/** False for approvals and dismissals (the approval gate reads those words), the standard Investigate command, and messages too short to carry intent. */
export function shouldRefine(input) {
  const s = String(input ?? "").trim();
  if (s.length < 8) return false;
  if (PASS_THROUGH_RE.test(s)) return false;
  if (INVESTIGATE_RE.test(s)) return false;
  return true;
}

/** System prompt for the rewrite. `ctx` carries business_date and active_disbursal; `tools` is the tools.json array. */
export function refinePrompt(ctx, tools) {
  const toolLines = tools.map((t) => `- ${t.id}(${Object.keys(t.params).join(", ")}): ${t.description.split(". ")[0]}.`).join("\n");
  return [
    "You rewrite one message from a payments-operations analyst into a precise instruction for LedgerLens, a reconciliation-break agent that answers only from ES|QL tools over Elasticsearch.",
    "",
    "Context",
    `- Console business date: ${ctx.business_date}. Use it whenever the analyst names no date.`,
    `- Selected disbursal: ${ctx.active_disbursal || "none"}. Words like "this break", "this one" or "it" refer to it. If none is selected and the analyst says "this", keep the message as it is.`,
    "- Tools the agent can call:",
    toolLines,
    `- Break types: ${BREAK_TYPES.join(", ")}.`,
    "- Identifier shapes: disbursal DSB-YYYYMMDD-NNNNN, ledger event EVT-..., case CASE-..., bank UTR.",
    "",
    "Rules",
    "1. Keep the analyst's intent. Add only what is missing: the business date, the selected disbursal, and which tool answers it.",
    "2. Copy every identifier, amount and date from the message verbatim. Never add a figure the analyst did not write.",
    "3. Do not answer the question. Do not use the words approve, dismiss, confirm or proceed.",
    "4. Vague requests about the ledger, the day, overall behaviour or health mean the break queue for the business date: ask for ledgerlens.list_breaks on that date and a summary by break type and partner, quoting the tool's figures verbatim.",
    "5. If the message is already precise, return it unchanged.",
    "6. Reply with the rewritten message only: one to three sentences, plain English, no preamble, no quotes.",
  ].join("\n");
}

/**
 * Rewrite `input` for the agent. Returns { input, changed, original?, reason? }; `input` is always safe to send on.
 * `callModel(system, user)` returns the model's text. A rewrite is rejected when it is empty, over 1200 characters,
 * drops a disbursal ID the analyst wrote, or contains an approval word the analyst did not write.
 */
export async function refineQuestion(input, ctx, tools, callModel) {
  const original = String(input ?? "").trim();
  if (!shouldRefine(original) || typeof callModel !== "function") return { input: original, changed: false };
  try {
    const out = String((await callModel(refinePrompt(ctx, tools), original)) ?? "").trim();
    if (!out || out.length > 1200) return { input: original, changed: false, reason: "rewrite empty or too long" };
    if (PASS_THROUGH_RE.test(out)) return { input: original, changed: false, reason: "rewrite contained an approval word" };
    const ids = original.match(DISBURSAL_RE) || [];
    if (ids.some((id) => !out.includes(id))) return { input: original, changed: false, reason: "rewrite dropped a disbursal id" };
    if (out === original) return { input: original, changed: false };
    return { input: out, original, changed: true };
  } catch (e) {
    return { input: original, changed: false, reason: e.message };
  }
}

/** The model call for refineQuestion(): one Anthropic Messages request with the console's ANTHROPIC settings, temperature 0. */
export function anthropicCaller(cfg) {
  return async (system, user) => {
    const res = await fetch(`${cfg.url}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(cfg.workspace ? { "anthropic-workspace-id": cfg.workspace } : {}) },
      body: JSON.stringify({ model: cfg.model, max_tokens: 300, temperature: 0, system, messages: [{ role: "user", content: user }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`refine ${cfg.model} -> ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
    return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  };
}
