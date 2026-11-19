import { randomUUID } from "node:crypto";
import { and, eq, gte, count } from "drizzle-orm";
import { getStore } from "./db";
import { AppError } from "./errors";
import { secJson, secBytes } from "./sec";
import { extract, filterFacts, NoUsableData, type Extraction, type Facts } from "./extract";

export const LIMITS = { addsPerHour: 5, writesPerHour: 60, packCap: 20, bodyBytes: 20 * 1024, globalAddsPerHour: 100 };
const HOUR = 3600_000;
const DAY_MS = 24 * HOUR;

export type Meta = {
  sourceUrl: string; submissionsUrl: string; tenKUrl: string | null; filingIndexUrl: string | null; exchange: string | null;
  fetchedAt: string; payloadFetchedAt: { facts: string; submissions: string; tenK: string | null };
  metrics: Extraction["metrics"]; omitted: Extraction["omitted"];
  derivedQ4OrYtdDifference: Record<string, string[]>;
  derivedMetrics: { key: string; formula: string }[];
  sizes: { packBytes: number; tenKBytes: number | null; reductionFactor: number | null };
  warnings: string[]; extractor: string;
};
export type PackRow = {
  id: string; ownerId: string; ticker: string; cik: string; name: string; exchange: string | null; fetchedAt: string;
  quarters: number; metricsCovered: number; metricsOmitted: number; packBytes: number; tenKBytes: number | null;
  packJson: string; metaJson: string;
};
export type AgentPack = {
  company: string; ticker: string; cik: string; currency: "USD"; fiscalPeriods: string;
  units: { money: string; marginsAndGrowth: string };
  latestAnnualFiling: { form: string; filed: string; reportDate: string; accession: string } | null;
  source: { name: string; url: string; fetchedAt: string; xbrlTags: Record<string, string[]> };
  omitted: string[];
  quarters: Record<string, number | string>[];
};

export const validTicker = (t: unknown): t is string => typeof t === "string" && /^[A-Z]{1,6}$/.test(t);
export const isUid = (s: string | undefined | null): s is string => !!s && /^[0-9a-f-]{36}$/.test(s);

// ---- rate limits -------------------------------------------------------------------------
export async function checkRate(owner: string, kind: "add" | "write") {
  const { db, t } = await getStore();
  const since = Date.now() - HOUR;
  const cnt = async (where: unknown) => Number((await db.select({ n: count() }).from(t.rateEvents).where(where))[0].n);
  if (kind === "add") {
    const g = await cnt(and(eq(t.rateEvents.kind, "add"), gte(t.rateEvents.at, since)));
    if (g >= LIMITS.globalAddsPerHour) throw new AppError(429, "rate_limited_global", "This server has hit its hourly cap on SEC fetches. Try again later.");
  }
  const n = await cnt(and(eq(t.rateEvents.ownerId, owner), eq(t.rateEvents.kind, kind), gte(t.rateEvents.at, since)));
  const max = kind === "add" ? LIMITS.addsPerHour : LIMITS.writesPerHour;
  if (n >= max) throw new AppError(429, "rate_limited", `Rate limit: ${max} ${kind === "add" ? "company adds/re-fetches" : "other writes"} per hour per visitor. Try again later.`);
  await db.insert(t.rateEvents).values({ id: randomUUID(), ownerId: owner, kind, at: Date.now() });
}

// ---- cache helpers -----------------------------------------------------------------------
async function cached<T>(url: string, maxAgeMs: number, force: boolean, load: () => Promise<T>): Promise<{ value: T; fetchedAt: string }> {
  const { db, t } = await getStore();
  if (!force) {
    const row = (await db.select().from(t.secCache).where(eq(t.secCache.url, url)))[0];
    if (row && Date.now() - Date.parse(row.fetchedAt) < maxAgeMs) return { value: JSON.parse(row.body) as T, fetchedAt: row.fetchedAt };
  }
  const value = await load();
  const fetchedAt = new Date().toISOString();
  const body = JSON.stringify(value);
  await db.insert(t.secCache).values({ url, body, fetchedAt }).onConflictDoUpdate({ target: t.secCache.url, set: { body, fetchedAt } });
  return { value, fetchedAt };
}

type TickerMap = Record<string, { cik_str: number; ticker: string; title: string }>;
async function resolveTicker(ticker: string) {
  const url = "https://www.sec.gov/files/company_tickers.json";
  // Refresh at most daily. Cached as a compact ticker -> [cik, title] map.
  const { value } = await cached<Record<string, [number, string]>>(url, DAY_MS, false, async () => {
    const raw = await secJson<TickerMap>(url);
    return Object.fromEntries(Object.values(raw).map((r) => [r.ticker.toUpperCase(), [r.cik_str, r.title] as [number, string]]));
  });
  const hit = value[ticker];
  if (!hit) throw new AppError(404, "unknown_ticker", `Ticker ${ticker} is not in SEC EDGAR's company_tickers.json. Check the symbol (US-listed SEC registrants only).`);
  return { cik: hit[0], title: hit[1] };
}

type Sub = { name: string; exchanges: string[]; latest10K: { filed: string; reportDate: string; accession: string; doc: string } | null };

// ---- build -------------------------------------------------------------------------------
export async function buildPack(ticker: string, force: boolean) {
  const { cik, title } = await resolveTicker(ticker);
  const id10 = String(cik).padStart(10, "0");
  const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${id10}.json`;
  const subUrl = `https://data.sec.gov/submissions/CIK${id10}.json`;

  let factsRes;
  try {
    factsRes = await cached<{ entityName: string; facts: Facts }>(factsUrl, DAY_MS, force, async () => {
      const raw = await secJson<{ entityName: string; facts?: never }>(factsUrl);
      return { entityName: raw.entityName, facts: filterFacts(raw as never) };
    });
  } catch (e) {
    if (e instanceof AppError && e.code === "sec_not_found") throw new AppError(422, "no_xbrl_data", `${ticker} (CIK ${id10}) has no XBRL companyfacts on SEC EDGAR.`);
    throw e;
  }
  const subRes = await cached<Sub>(subUrl, DAY_MS, force, async () => {
    const raw = await secJson<{ name: string; exchanges?: string[]; filings: { recent: Record<string, string[]> } }>(subUrl);
    const r = raw.filings.recent;
    const i = r.form.findIndex((f) => f === "10-K");
    return {
      name: raw.name, exchanges: raw.exchanges || [],
      latest10K: i < 0 ? null : { filed: r.filingDate[i], reportDate: r.reportDate[i], accession: r.accessionNumber[i], doc: r.primaryDocument[i] },
    };
  });

  let ex: Extraction;
  try {
    ex = extract(factsRes.value.facts);
  } catch (e) {
    if (e instanceof NoUsableData) throw new AppError(422, "no_xbrl_data", `${ticker}: ${e.message}`);
    throw e;
  }
  const warnings = [...ex.warnings];
  const sub = subRes.value;
  const k = sub.latest10K;
  const tenKUrl = k ? `https://www.sec.gov/Archives/edgar/data/${cik}/${k.accession.replace(/-/g, "")}/${k.doc}` : null;
  const filingIndexUrl = k ? `https://www.sec.gov/Archives/edgar/data/${cik}/${k.accession.replace(/-/g, "")}/${k.accession}-index.htm` : null;
  let tenK: { bytes: number; fetchedAt: string } | null = null;
  if (tenKUrl) {
    try {
      const r = await cached<number>(tenKUrl, 7 * DAY_MS, force, () => secBytes(tenKUrl));
      tenK = { bytes: r.value, fetchedAt: r.fetchedAt };
    } catch (e) {
      warnings.push(`Latest 10-K size unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else warnings.push("No 10-K found in the filer's recent filings; the size contrast is unavailable.");
  if (ex.omitted.length) warnings.push(`${ex.omitted.length} metric(s) omitted or not published under their preferred definition; see the provenance panel.`);

  const fetchedAt = [factsRes.fetchedAt, subRes.fetchedAt, tenK?.fetchedAt].filter(Boolean).sort()[0] as string;
  const xbrlTags = Object.fromEntries(Object.entries(ex.metrics).map(([m, v]) => [m, v.tags]));
  const name = factsRes.value.entityName || sub.name || title;
  const pack: AgentPack = {
    company: name, ticker, cik: id10, currency: "USD",
    fiscalPeriods: "quarterly, last 12 quarters (company fiscal period-end dates)",
    units: { money: "USD", marginsAndGrowth: "percent" },
    latestAnnualFiling: k ? { form: "10-K", filed: k.filed, reportDate: k.reportDate, accession: k.accession } : null,
    source: { name: "SEC EDGAR XBRL companyfacts", url: factsUrl, fetchedAt, xbrlTags },
    omitted: ex.omitted.map((o) => o.key),
    quarters: ex.quarters,
  };
  const packJson = JSON.stringify(pack);
  const packBytes = Buffer.byteLength(packJson);
  const has = (m: string) => !!ex.metrics[m];
  const derivedMetrics = [
    has("grossProfit") && has("revenue") && { key: "grossMarginPct", formula: "grossProfit / revenue × 100, per quarter, 1 decimal" },
    has("operatingIncome") && has("revenue") && { key: "operatingMarginPct", formula: "operatingIncome / revenue × 100, per quarter, 1 decimal" },
    has("revenue") && { key: "revenueGrowthQoQPct", formula: "revenue / prior-quarter revenue − 1, ×100, 1 decimal (absent for the first quarter)" },
  ].filter(Boolean) as { key: string; formula: string }[];
  const meta: Meta = {
    sourceUrl: factsUrl, submissionsUrl: subUrl, tenKUrl, filingIndexUrl, exchange: sub.exchanges[0] || null, fetchedAt,
    payloadFetchedAt: { facts: factsRes.fetchedAt, submissions: subRes.fetchedAt, tenK: tenK?.fetchedAt ?? null },
    metrics: ex.metrics, omitted: ex.omitted,
    derivedQ4OrYtdDifference: Object.fromEntries(Object.entries(ex.metrics).map(([m, v]) => [m, v.derivedQ4OrYtdDifference])),
    derivedMetrics,
    sizes: { packBytes, tenKBytes: tenK?.bytes ?? null, reductionFactor: tenK ? Math.round((tenK.bytes / packBytes) * 10) / 10 : null },
    warnings, extractor: "contextpack-extract/2",
  };
  return { pack, packJson, meta, name, packBytes, tenKBytes: tenK?.bytes ?? null, covered: Object.keys(ex.metrics).length, omitted: ex.omitted.length, fetchedAt, exchange: meta.exchange, cik: id10 };
}

// ---- persistence -------------------------------------------------------------------------
export async function listPacks(owner: string): Promise<Omit<PackRow, "packJson" | "metaJson">[]> {
  const { db, t } = await getStore();
  const rows: PackRow[] = await db.select().from(t.packs).where(eq(t.packs.ownerId, owner));
  return rows.map(({ packJson: _p, metaJson: _m, ...r }) => r).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export async function getPack(id: string, owner: string | null): Promise<PackRow> {
  const { db, t } = await getStore();
  const row: PackRow | undefined = (await db.select().from(t.packs).where(eq(t.packs.id, id)))[0];
  if (!row) throw new AppError(404, "not_found", "No such pack.");
  if (!owner || row.ownerId !== owner) throw new AppError(403, "forbidden", "This pack belongs to a different visitor.");
  return row;
}

export async function savePack(owner: string, b: Awaited<ReturnType<typeof buildPack>>, existingId?: string): Promise<PackRow> {
  const { db, t } = await getStore();
  const id = existingId ?? randomUUID();
  const values = {
    ownerId: owner, ticker: b.pack.ticker, cik: b.cik, name: b.name, exchange: b.exchange, fetchedAt: b.fetchedAt,
    quarters: b.pack.quarters.length, metricsCovered: b.covered, metricsOmitted: b.omitted, packBytes: b.packBytes, tenKBytes: b.tenKBytes,
    packJson: b.packJson, metaJson: JSON.stringify(b.meta),
  };
  if (existingId) await db.update(t.packs).set(values).where(eq(t.packs.id, id));
  else await db.insert(t.packs).values({ id, ...values });
  return { id, ...values };
}

export async function deletePack(id: string) {
  const { db, t } = await getStore();
  await db.delete(t.packs).where(eq(t.packs.id, id));
}

export async function countPacks(owner: string): Promise<number> {
  const { db, t } = await getStore();
  return Number((await db.select({ n: count() }).from(t.packs).where(eq(t.packs.ownerId, owner)))[0].n);
}

export async function findByTicker(owner: string, ticker: string): Promise<PackRow | undefined> {
  const { db, t } = await getStore();
  return (await db.select().from(t.packs).where(and(eq(t.packs.ownerId, owner), eq(t.packs.ticker, ticker))))[0];
}
