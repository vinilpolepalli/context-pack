// Deterministic Q&A computed from a stored pack at request time. No LLM. Each answer lists the exact cells it used.
import type { AgentPack } from "./service";

export type Cite = { quarter: string; metric: string; value: number; unit: "USD" | "pct" };
export type QA = { q: string; a: string; computed: string; cites: Cite[]; available: boolean };

export const money = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : `$${(a / 1e6).toFixed(0)}M`;
  return v < 0 ? "-" + s : s;
};
export const pct = (v: number) => `${v.toFixed(1)}%`;
export const bytes = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(1)} KB`);
const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

export function buildQA(pack: AgentPack, omitReasons: Record<string, string>): QA[] {
  const qs = pack.quarters as Record<string, number | string>[];
  const f = qs[0], l = qs[qs.length - 1], t = pack.ticker;
  const n = (r: Record<string, number | string>, k: string) => r[k] as number | undefined;
  const unavailable = (q: string, key: string, label: string): QA => ({
    q, available: false, cites: [], computed: "Nothing computed.",
    a: `Cannot answer from this pack: ${label} is omitted (${omitReasons[key] || "not present in the pack"}). Unknown stays unknown; no substitute figure is used.`,
  });
  const out: QA[] = [];

  // 1. Gross margin trend
  const q1 = `What was ${t}'s gross margin trend?`;
  if (n(f, "grossMarginPct") !== undefined && n(l, "grossMarginPct") !== undefined) {
    const gm = qs.map((x) => n(x, "grossMarginPct")!);
    const lo = qs[gm.indexOf(Math.min(...gm))], hi = qs[gm.indexOf(Math.max(...gm))];
    out.push({
      q: q1, available: true,
      computed: "Compared grossMarginPct in the first and last of the 12 quarters; found the min and max over all 12.",
      a: `Gross margin went from ${pct(n(f, "grossMarginPct")!)} (${f.periodEnd}) to ${pct(n(l, "grossMarginPct")!)} (${l.periodEnd}), ${signed(n(l, "grossMarginPct")! - n(f, "grossMarginPct")!)} percentage points. Low ${pct(Math.min(...gm))} (${lo.periodEnd}), high ${pct(Math.max(...gm))} (${hi.periodEnd}).`,
      cites: [
        { quarter: f.periodEnd as string, metric: "grossMarginPct", value: n(f, "grossMarginPct")!, unit: "pct" },
        { quarter: l.periodEnd as string, metric: "grossMarginPct", value: n(l, "grossMarginPct")!, unit: "pct" },
        { quarter: lo.periodEnd as string, metric: "grossMarginPct (low)", value: Math.min(...gm), unit: "pct" },
        { quarter: hi.periodEnd as string, metric: "grossMarginPct (high)", value: Math.max(...gm), unit: "pct" },
      ],
    });
  } else out.push(unavailable(q1, "grossProfit", "gross profit (needed for gross margin)"));

  // 2. Latest QoQ revenue growth
  const q2 = `What was ${t}'s latest quarter-over-quarter revenue growth?`;
  const prev = qs[qs.length - 2];
  if (n(l, "revenue") !== undefined && n(prev, "revenue") !== undefined) {
    const g = (n(l, "revenue")! / n(prev, "revenue")! - 1) * 100;
    out.push({
      q: q2, available: true,
      computed: `latest revenue ÷ prior-quarter revenue − 1, using the last two quarters in the pack. Assumes consecutive fiscal quarters.`,
      a: `Revenue was ${money(n(l, "revenue")!)} in the quarter ending ${l.periodEnd} versus ${money(n(prev, "revenue")!)} in ${prev.periodEnd}: ${signed(g)}% QoQ. Seasonality is not adjusted for.`,
      cites: [
        { quarter: prev.periodEnd as string, metric: "revenue", value: n(prev, "revenue")!, unit: "USD" },
        { quarter: l.periodEnd as string, metric: "revenue", value: n(l, "revenue")!, unit: "USD" },
      ],
    });
  } else out.push(unavailable(q2, "revenue", "revenue"));

  // 3. Debt change - uses totalDebt only when the pack carries it, else the exact-tag longTermDebt
  const dk = n(f, "totalDebt") !== undefined ? "totalDebt" : "longTermDebt";
  const dl = dk === "totalDebt" ? "total debt" : "long-term debt (us-gaap LongTermDebt, which includes the current portion; total debt is not published for this filer)";
  const q3 = `How has ${t}'s ${dk === "totalDebt" ? "total debt" : "long-term debt"} changed?`;
  if (n(f, dk) !== undefined && n(l, dk) !== undefined) {
    const y = qs[qs.length - 5];
    const ch = (n(l, dk)! / n(y, dk)! - 1) * 100;
    const chAll = (n(l, dk)! / n(f, dk)! - 1) * 100;
    const Cap = dk === "totalDebt" ? "Total debt" : "Long-term debt";
    out.push({
      q: q3, available: true,
      computed: `Metric used: ${dk} (${dl}). Compared it at the latest quarter-end with the quarter-end four quarters earlier and with the first quarter in the pack.`,
      a: `${Cap} (${dk === "totalDebt" ? "noncurrent + current portion + short-term borrowings" : "us-gaap LongTermDebt"}) was ${money(n(l, dk)!)} at ${l.periodEnd} versus ${money(n(y, dk)!)} at ${y.periodEnd} (${signed(ch)}% over four quarters), and ${money(n(f, dk)!)} at ${f.periodEnd} (${signed(chAll)}% over the window). Debt definitions differ across filers.`,
      cites: [f, y, l].map((r) => ({ quarter: r.periodEnd as string, metric: dk, value: n(r, dk)!, unit: "USD" as const })),
    });
  } else out.push(unavailable(q3, "totalDebt", "total debt and long-term debt"));

  // 4. TTM net income
  const q4 = `What is ${t}'s trailing-four-quarter net income?`;
  if (n(l, "netIncome") !== undefined) {
    const last4 = qs.slice(-4);
    const ttm = last4.reduce((s, x) => s + n(x, "netIncome")!, 0);
    const rev = n(l, "revenue") !== undefined ? last4.reduce((s, x) => s + n(x, "revenue")!, 0) : undefined;
    out.push({
      q: q4, available: true,
      computed: `Sum of netIncome over the last four quarters${rev !== undefined ? "; divided by the sum of revenue over the same quarters for net margin" : ""}.`,
      a: `${money(ttm)} over ${last4[0].periodEnd} to ${l.periodEnd}${rev !== undefined ? ` on ${money(rev)} of revenue (${pct((ttm / rev) * 100)} net margin)` : ""}.`,
      cites: [
        ...last4.map((r) => ({ quarter: r.periodEnd as string, metric: "netIncome", value: n(r, "netIncome")!, unit: "USD" as const })),
        ...(rev !== undefined ? last4.map((r) => ({ quarter: r.periodEnd as string, metric: "revenue", value: n(r, "revenue")!, unit: "USD" as const })) : []),
      ],
    });
  } else out.push(unavailable(q4, "netIncome", "net income"));
  return out;
}
