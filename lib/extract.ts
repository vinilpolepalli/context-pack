// XBRL companyfacts -> 12-quarter pack. Provenance rules carried forward from the original demo:
//  - quarterly flows use 3-month facts when filed, else the difference of cumulative periods sharing a fiscal-year start
//  - a metric is omitted unless all 12 quarters are covered; every omission is recorded with a reason
//  - unknown stays unknown: no fallback numbers
const N = 12;
const DAY = 86400000;

type Fact = { start?: string; end: string; val: number; accn?: string; filed: string };
export type Facts = Record<string, Fact[]>; // tag -> USD facts (filtered)
type Q = { val: number; derived: boolean };
type QMap = Record<string, Q>;
type Cand = { tag: string; tags: string[]; map: QMap };

export const FLOW_TAGS: Record<string, string[]> = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
};
export const INSTANT_TAGS: Record<string, string[]> = {
  totalAssets: ["Assets"],
};
// Total debt = LongTermDebtNoncurrent + LongTermDebtCurrent + ShortTermBorrowings, published only if all three cover all 12 quarters.
// (us-gaap LongTermDebt already INCLUDES the current portion, so adding LongTermDebtCurrent to it would double count.)
// Otherwise the metric is the exact tag LongTermDebt, labelled "Long-term debt".
const TOTAL_DEBT_PARTS = ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings"];
const DEBT_TAGS = ["LongTermDebt", ...TOTAL_DEBT_PARTS];
export const ALL_TAGS = [...new Set([...Object.values(FLOW_TAGS).flat(), ...Object.values(INSTANT_TAGS).flat(), ...DEBT_TAGS])];

export const LABELS: Record<string, string> = {
  revenue: "Revenue", netIncome: "Net income", grossProfit: "Gross profit", operatingIncome: "Operating income",
  totalAssets: "Total assets", totalDebt: "Total debt", longTermDebt: "Long-term debt", operatingCashFlow: "Operating cash flow",
};
const ORDER = ["revenue", "netIncome", "grossProfit", "operatingIncome", "totalAssets", "debt", "operatingCashFlow"];

const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;
const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * DAY).toISOString().slice(0, 10);

function flowQuarters(facts: Facts, tag: string): QMap {
  const units = facts[tag];
  if (!units) return {};
  const byKey = new Map<string, Fact>();
  for (const e of units) {
    if (!e.start) continue;
    const k = e.start + "|" + e.end;
    const p = byKey.get(k);
    if (!p || e.filed > p.filed) byKey.set(k, e);
  }
  const entries = [...byKey.values()].map((e) => ({ ...e, d: days(e.start!, e.end) }));
  const q: QMap = {};
  for (const e of entries) if (e.d > 80 && e.d < 105) q[e.end] = { val: e.val, derived: false };
  const groups: Record<string, typeof entries> = {};
  for (const e of entries) if (e.d > 80 && e.d < 380) (groups[e.start!] ||= []).push(e);
  for (const g of Object.values(groups)) {
    const cum = [91, 182, 273, 365].map((t) => g.find((e) => Math.abs(e.d - t) < 16) || null);
    for (let i = 1; i < 4; i++) {
      const cur = cum[i], prev = cum[i - 1];
      if (!cur || !prev || q[cur.end]) continue;
      q[cur.end] = { val: cur.val - prev.val, derived: true };
    }
  }
  return q;
}

function instantQuarters(facts: Facts, tag: string): QMap {
  const m: Record<string, Fact> = {};
  for (const e of facts[tag] || []) {
    if (e.start) continue;
    if (!m[e.end] || e.filed > m[e.end].filed) m[e.end] = e;
  }
  return Object.fromEntries(Object.entries(m).map(([k, e]) => [k, { val: e.val, derived: false }]));
}

const near = (map: QMap, end: string): Q | null => {
  for (let o = 0; o <= 5; o++) for (const s of o ? [-o, o] : [0]) { const q = map[addDays(end, s)]; if (q) return q; }
  return null;
};
const coverage = (map: QMap, ends: string[]) => ends.filter((e) => near(map, e)).length;

function pick(cands: Cand[], ends: string[]): (Cand & { cov: number }) | null {
  let best: (Cand & { cov: number }) | null = null;
  for (const c of cands) {
    const cov = coverage(c.map, ends);
    if (cov > 0 && (!best || cov > best.cov)) best = { ...c, cov };
  }
  return best;
}

function sumMaps(maps: QMap[], ends: string[]): QMap {
  const out: QMap = {};
  for (const e of ends) {
    const parts = maps.map((m) => near(m, e));
    if (parts.every(Boolean)) out[e] = { val: parts.reduce((a, p) => a + p!.val, 0), derived: false };
  }
  return out;
}

export type MetricProv = { label: string; tags: string[]; unit: "USD"; derivedQ4OrYtdDifference: string[] };
export type Omission = { key: string; label: string; reason: string };
export type Extraction = {
  quarters: Record<string, number | string>[];
  metrics: Record<string, MetricProv>;
  omitted: Omission[];
  warnings: string[];
};

export class NoUsableData extends Error {}

export function extract(facts: Facts): Extraction {
  const flow = (tags: string[]): Cand[] => tags.map((t) => ({ tag: t, tags: [t], map: flowQuarters(facts, t) }));
  const inst = (tags: string[]): Cand[] => tags.map((t) => ({ tag: t, tags: [t], map: instantQuarters(facts, t) }));
  const present = (tags: string[]) => tags.filter((t) => facts[t]?.length);

  // Quarter axis: latest contiguous 12 quarter-ends of net income (reported by every filer).
  const niC = flow(FLOW_TAGS.netIncome);
  const niEnds = [...new Set(niC.flatMap((c) => Object.keys(c.map)))].sort();
  if (!niEnds.length) throw new NoUsableData("No quarterly net income (NetIncomeLoss/ProfitLoss, USD) found in the XBRL facts. The filer may report in another currency, use non-us-gaap tags, or have no XBRL financial data.");
  const run: string[] = [];
  for (let i = niEnds.length - 1; i >= 0 && run.length < N; i--) {
    if (run.length && days(niEnds[i], run[0]) > 110) break;
    run.unshift(niEnds[i]);
  }
  if (run.length < N) throw new NoUsableData(`Only ${run.length} contiguous quarters of net income available; ${N} are required.`);
  const ends = run;
  const warnings: string[] = [];
  const ageDays = days(ends[N - 1], new Date().toISOString().slice(0, 10));
  if (ageDays > 200) warnings.push(`Latest covered quarter ends ${ends[N - 1]} (${Math.round(ageDays)} days ago); the filer may have stopped reporting.`);

  const defs: Record<string, { cands: Cand[]; tagsToCheck: string[] }> = {};
  for (const [k, tags] of Object.entries(FLOW_TAGS)) defs[k] = { cands: flow(tags), tagsToCheck: tags };
  for (const [k, tags] of Object.entries(INSTANT_TAGS)) defs[k] = { cands: inst(tags), tagsToCheck: tags };

  // Debt slot: "totalDebt" only when every component is covered for all 12 quarters; else exact-tag "longTermDebt".
  const parts = TOTAL_DEBT_PARTS.map((t) => ({ t, cov: coverage(instantQuarters(facts, t), ends) }));
  const totalOk = parts.every((p) => p.cov === N);
  const ltd = { tag: "LongTermDebt", tags: ["LongTermDebt"], map: instantQuarters(facts, "LongTermDebt") };
  const ltdCov = coverage(ltd.map, ends);
  let debtKey = "totalDebt";
  let debt: (Cand & { cov: number }) | null = null;
  const debtOmissions: Omission[] = [];
  if (totalOk) {
    debt = { tag: TOTAL_DEBT_PARTS.join("+"), tags: TOTAL_DEBT_PARTS, map: sumMaps(TOTAL_DEBT_PARTS.map((t) => instantQuarters(facts, t)), ends), cov: N };
  } else {
    const why = parts.map((p) => `${p.t} ${p.cov}/${N}`).join(", ");
    debtOmissions.push({ key: "totalDebt", label: LABELS.totalDebt, reason: `components not consistently tagged quarterly (${why}); a partial total is not published. Total debt would be ${TOTAL_DEBT_PARTS.join(" + ")}` });
    debtKey = "longTermDebt";
    if (ltdCov > 0) debt = { ...ltd, cov: ltdCov };
  }

  const picked: Record<string, (Cand & { cov: number }) | null> = {};
  for (const k of ORDER) picked[k] = k === "debt" ? debt : pick(defs[k].cands, ends);
  defs.longTermDebt = { cands: [], tagsToCheck: ["LongTermDebt"] };
  defs.totalDebt = { cands: [], tagsToCheck: TOTAL_DEBT_PARTS };
  const KEYS = ORDER.map((k) => (k === "debt" ? debtKey : k));
  const SRC = (k: string) => (k === "totalDebt" || k === "longTermDebt" ? "debt" : k);

  const series: Record<string, number[]> = {};
  const metrics: Record<string, MetricProv> = {};
  const omitted: Omission[] = [...debtOmissions];
  for (const k of KEYS) {
    const m = picked[SRC(k)];
    if (m && m.cov === N) {
      series[k] = ends.map((e) => near(m.map, e)!.val);
      metrics[k] = { label: LABELS[k], tags: m.tags, unit: "USD", derivedQ4OrYtdDifference: ends.filter((e) => near(m.map, e)!.derived) };
    } else {
      const has = present(defs[k].tagsToCheck);
      const reason = !has.length
        ? `not tagged for this filer: none of ${defs[k].tagsToCheck.join(", ")} appear in its us-gaap USD facts`
        : !m
          ? `tagged (${has.join(", ")}) but none of the ${N} quarter-ends are covered by quarterly or cumulative-difference facts`
          : `not tagged quarterly for this filer: best tag ${m.tag} covers ${m.cov} of ${N} quarters; ${N} required`;
      omitted.push({ key: k, label: LABELS[k], reason });
    }
  }

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const quarters = ends.map((end, i) => {
    const row: Record<string, number | string> = { periodEnd: end };
    for (const k of KEYS) if (series[k]) row[k] = series[k][i];
    if (series.grossProfit && series.revenue && series.revenue[i]) row.grossMarginPct = r1((series.grossProfit[i] / series.revenue[i]) * 100);
    if (series.operatingIncome && series.revenue && series.revenue[i]) row.operatingMarginPct = r1((series.operatingIncome[i] / series.revenue[i]) * 100);
    if (series.revenue && i > 0 && series.revenue[i - 1]) row.revenueGrowthQoQPct = r1((series.revenue[i] / series.revenue[i - 1] - 1) * 100);
    return row;
  });
  return { quarters, metrics, omitted, warnings };
}

/** Reduce a companyfacts payload to the USD facts of the tags we use. */
export function filterFacts(raw: { facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>> }): Facts {
  const gaap = raw.facts?.["us-gaap"] || {};
  const out: Facts = {};
  for (const t of ALL_TAGS) {
    const u = gaap[t]?.units?.USD;
    if (u?.length) out[t] = u.map((e) => ({ start: e.start, end: e.end, val: e.val, accn: e.accn, filed: e.filed }));
  }
  return out;
}
