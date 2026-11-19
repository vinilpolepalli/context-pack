import { money } from "@/lib/qa";

type Q = Record<string, number | string>;
const W = 560, H = 200, P = { l: 52, r: 12, t: 12, b: 28 };

function Chart({ title, rows, series, fmt, bars }: { title: string; rows: Q[]; series: { key: string; name: string; color: string }[]; fmt: (v: number) => string; bars?: boolean }) {
  const vals = series.flatMap((s) => rows.map((r) => r[s.key] as number).filter((v) => v !== undefined));
  let lo = Math.min(...vals, bars ? 0 : Infinity), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = (i: number) => P.l + ((W - P.l - P.r) * (i + 0.5)) / rows.length;
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo, (lo + hi) / 2, hi];
  const bw = ((W - P.l - P.r) / rows.length) * 0.6;
  return (
    <figure className="bg-white border border-line rounded-card p-3">
      <figcaption className="text-sm font-medium mb-1">{title}</figcaption>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} className="min-w-[560px] w-full h-auto">
          {ticks.map((t) => (<g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#e4e4e7" /><text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#71717a">{fmt(t)}</text></g>))}
          {bars && rows.map((r, i) => <rect key={i} x={x(i) - bw / 2} y={Math.min(y(r[series[0].key] as number), y(0))} width={bw} height={Math.abs(y(r[series[0].key] as number) - y(0))} fill={series[0].color}><title>{`${r.periodEnd}: ${fmt(r[series[0].key] as number)}`}</title></rect>)}
          {!bars && series.map((s) => (
            <g key={s.key}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" points={rows.map((r, i) => `${x(i)},${y(r[s.key] as number)}`).join(" ")} />
              {rows.map((r, i) => <circle key={i} cx={x(i)} cy={y(r[s.key] as number)} r="2.5" fill={s.color}><title>{`${s.name} ${r.periodEnd}: ${fmt(r[s.key] as number)}`}</title></circle>)}
            </g>
          ))}
          {rows.map((r, i) => (i % 2 === 0 || i === rows.length - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#71717a">{(r.periodEnd as string).slice(2, 7)}</text>)}
        </svg>
      </div>
      {series.length > 1 && <p className="text-xs text-ink-soft flex gap-3">{series.map((s) => <span key={s.key}><span style={{ color: s.color }}>●</span> {s.name}</span>)}</p>}
    </figure>
  );
}

export default function Charts({ quarters, omitted }: { quarters: Q[]; omitted: string[] }) {
  const hasRev = !omitted.includes("revenue");
  const margins = [
    { key: "grossMarginPct", name: "Gross margin", color: "#0e7490" },
    { key: "operatingMarginPct", name: "Operating margin", color: "#52525b" },
  ].filter((s) => quarters.every((q) => q[s.key] !== undefined));
  return (
    <div className="space-y-3">
      {hasRev ? <Chart title="Quarterly revenue (USD)" rows={quarters} series={[{ key: "revenue", name: "Revenue", color: "#0e7490" }]} fmt={money} bars /> : <p className="text-sm text-ink-soft">Revenue chart unavailable: revenue is omitted from this pack.</p>}
      {margins.length ? <Chart title="Margins (%)" rows={quarters} series={margins} fmt={(v) => `${v.toFixed(0)}%`} /> : <p className="text-sm text-ink-soft">Margin chart unavailable: gross profit and operating income are both omitted or incomplete.</p>}
    </div>
  );
}
