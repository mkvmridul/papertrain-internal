// Thin, dependency-free HTTP helpers for Elasticsearch and Kibana.
// Every call the project makes to Elastic goes through these two functions, so a reviewer
// can see exactly what is sent. Auth is an API key in both cases (Elastic Cloud Serverless style).

const need = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}. Copy .env.example to .env and fill it in.`);
  return v.replace(/\/+$/, "");
};

export const ES_URL = () => need("ES_URL");
export const KIBANA_URL = () => need("KIBANA_URL");

async function request(url, method, headers, body, { timeoutMs = 120_000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(json).slice(0, 800)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Elasticsearch REST call. `body` may be an object (JSON) or a string (NDJSON for _bulk). */
export function es(method, path, body, opts = {}) {
  const isNdjson = typeof body === "string";
  return request(
    `${ES_URL()}${path}`,
    method,
    {
      Authorization: `ApiKey ${need("ES_API_KEY")}`,
      "Content-Type": isNdjson ? "application/x-ndjson" : "application/json",
      Accept: "application/json",
    },
    body === undefined ? undefined : isNdjson ? body : JSON.stringify(body),
    opts,
  );
}

/** Kibana REST call (Agent Builder, Workflows, Cases). */
export function kbn(method, path, body, opts = {}) {
  return request(
    `${KIBANA_URL()}${path}`,
    method,
    {
      Authorization: `ApiKey ${process.env.KIBANA_API_KEY || need("ES_API_KEY")}`,
      "Content-Type": "application/json",
      "kbn-xsrf": "true",
      Accept: "application/json",
    },
    body === undefined ? undefined : JSON.stringify(body),
    opts,
  );
}

/**
 * Run an ES|QL query with named params and return rows as objects.
 * Params use the same `?name` placeholders Agent Builder tools use, so the tool files in
 * elastic/tools/ can be executed verbatim from Node for verification.
 */
export async function esql(query, params = {}) {
  const body = { query };
  const list = Object.entries(params).map(([k, v]) => ({ [k]: v }));
  if (list.length) body.params = list;
  const res = await es("POST", "/_query", body);
  const cols = res.columns.map((c) => c.name);
  const rows = res.values.map((vals) => Object.fromEntries(vals.map((v, i) => [cols[i], v])));
  return { rows, columns: res.columns, took: res.took };
}
