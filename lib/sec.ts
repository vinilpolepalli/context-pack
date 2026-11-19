// SEC EDGAR client: declared User-Agent from env, serialized + throttled (~4/sec), one retry after 2s.
import { AppError } from "./errors";

const GAP_MS = 250;
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function userAgent(): string {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua || !ua.trim()) {
    throw new AppError(503, "sec_user_agent_missing", "Server is not configured: set the SEC_USER_AGENT environment variable (e.g. \"Your Name you@example.com\") to fetch from SEC EDGAR.");
  }
  return ua.trim();
}

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastAt = Date.now();
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

async function once(url: string, ua: string): Promise<Response> {
  return throttled(() => fetch(url, { headers: { "User-Agent": ua, "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(60_000) }));
}

/** GET with at most one retry (after 2s) on network error, 429 or 5xx. Returns the OK response. */
export async function secGet(url: string): Promise<Response> {
  const ua = userAgent();
  let res: Response | null = null;
  let err = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000));
    try {
      res = await once(url, ua);
      if (res.ok) return res;
      err = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      res = null;
      err = e instanceof Error ? e.message : String(e);
    }
  }
  const status = res?.status;
  throw new AppError(status === 404 ? 404 : 502, status === 404 ? "sec_not_found" : "sec_fetch_failed", `SEC EDGAR request failed (${err}): ${url}`);
}

export const secJson = async <T = unknown>(url: string): Promise<T> => (await secGet(url)).json() as Promise<T>;
export const secBytes = async (url: string): Promise<number> => (await (await secGet(url)).arrayBuffer()).byteLength;
