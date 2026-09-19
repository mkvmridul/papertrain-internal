// Create the LedgerLens indices with explicit mappings and bulk-load the generated NDJSON.
// Re-runnable: drops and recreates the indices every time so the demo dataset is always exactly
// what src/generate.js produced.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { es } from "./es.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const MAPPINGS = join(ROOT, "elastic", "mappings");

const INDICES = [
  { name: "ledgerlens-recon", file: "recon.ndjson" },
  { name: "ledgerlens-traces", file: "traces.ndjson" },
  { name: "ledgerlens-resolved-breaks", file: "resolved-breaks.ndjson" },
  { name: "ledgerlens-audit", file: null },
];

async function recreate(name) {
  try {
    await es("DELETE", `/${name}`);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const mapping = JSON.parse(readFileSync(join(MAPPINGS, `${name}.json`), "utf8"));
  await es("PUT", `/${name}`, mapping);
}

async function bulkLoad(name, file, chunk = 2000) {
  const lines = readFileSync(join(DATA, file), "utf8").split("\n").filter(Boolean);
  let indexed = 0;
  for (let i = 0; i < lines.length; i += chunk) {
    // Only the documents the cluster rejected are re-sent. Re-sending the whole batch would index the
    // documents that had already succeeded a second time.
    let pending = lines.slice(i, i + chunk);
    // semantic_text fields run inference during indexing; the first batch can wait on model start-up.
    for (let attempt = 1; ; attempt++) {
      const body = pending.map((l) => `{"index":{"_index":"${name}"}}\n${l}`).join("\n") + "\n";
      const res = await es("POST", "/_bulk", body, { timeoutMs: 300_000 });
      if (!res.errors) break;
      const failed = res.items.map((it, k) => (it.index?.error ? k : -1)).filter((k) => k >= 0);
      const firstErr = res.items[failed[0]].index.error;
      if (attempt >= 6) throw new Error(`bulk errors in ${name}: ${JSON.stringify(firstErr).slice(0, 600)}`);
      console.log(`  retrying ${failed.length} of ${pending.length} docs in ${name} batch ${i / chunk + 1} in 20s (${firstErr?.type}: ${String(firstErr?.reason).slice(0, 120)})`);
      pending = failed.map((k) => pending[k]);
      await new Promise((r) => setTimeout(r, 20_000));
    }
    indexed += Math.min(chunk, lines.length - i);
    process.stdout.write(`\r  ${name}: ${indexed}/${lines.length}`);
  }
  process.stdout.write("\n");
  return indexed;
}

export async function ingest() {
  if (!existsSync(join(DATA, "recon.ndjson"))) throw new Error("data/ is empty. Run `npm run generate` first.");
  const info = await es("GET", "/");
  console.log(`connected to ${info.cluster_name ?? "elasticsearch"} v${info.version?.number ?? "?"} (${info.version?.build_flavor ?? ""})`);
  const summary = {};
  for (const { name, file } of INDICES) {
    await recreate(name);
    summary[name] = file ? await bulkLoad(name, file) : 0;
  }
  await es("POST", "/ledgerlens-*/_refresh");
  const counts = await es("GET", "/_cat/indices/ledgerlens-*?h=index,docs.count&format=json");
  for (const c of counts.sort((a, b) => a.index.localeCompare(b.index))) console.log(`  ${c.index.padEnd(28)} ${c["docs.count"]} docs`);
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ingest().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
