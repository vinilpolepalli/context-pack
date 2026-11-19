import Link from "next/link";
import { cookies } from "next/headers";
import { getPack, isUid, type AgentPack, type Meta } from "@/lib/service";
import { AppError } from "@/lib/errors";
import { buildQA, bytes, money, pct } from "@/lib/qa";
import JsonView from "../../components/JsonView";
import Charts from "../../components/Charts";
import PackActions from "../../components/PackActions";

export const dynamic = "force-dynamic";

const SECTIONS = [["json", "Agent JSON"], ["charts", "Charts"], ["contrast", "Size contrast"], ["ask", "Ask the pack"], ["provenance", "Provenance"], ["actions", "Actions"]];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="label mb-2 scroll-mt-4">{children}</h2>;
}

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = (await cookies()).get("cp_uid")?.value;
  let row;
  try {
    row = await getPack(id, isUid(uid) ? uid : null);
  } catch (e) {
    const err = e as AppError;
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{err.status === 403 ? "403 - not your pack" : "404 - pack not found"}</h1>
        <p className="text-sm text-ink-soft">{err.message}</p>
        <Link href="/" className="text-accent hover:text-accent-hover text-sm">Back to library</Link>
      </div>
    );
  }
  const pack: AgentPack = JSON.parse(row.packJson);
  const meta: Meta = JSON.parse(row.metaJson);
  const qa = buildQA(pack, Object.fromEntries(meta.omitted.map((o) => [o.key, o.reason])));
  const tokens = Math.round(row.packBytes / 4);
  const num = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link href="/" className="text-sm text-accent hover:text-accent-hover">← Library</Link>
        <h1 className="text-xl font-semibold tracking-tight">{pack.company} <span className="text-ink-faint font-normal">{pack.ticker}</span></h1>
        <p className="text-sm text-ink-soft num">
          CIK {pack.cik}{meta.exchange ? ` · ${meta.exchange}` : ""} · fetched {row.fetchedAt.slice(0, 19).replace("T", " ")} UTC ·{" "}
          <span /* unslop-ignore: status chip, pills allowed for chips only */ className="inline-block rounded-full border border-line bg-zinc-50 px-2 py-0.5 text-xs">source: SEC EDGAR XBRL</span>{" "}
          {meta.filingIndexUrl && <a className="text-accent hover:text-accent-hover hover:underline" href={meta.filingIndexUrl}>Latest 10-K filing index on EDGAR</a>}
        </p>
        {meta.warnings.map((w) => <p key={w} className="text-sm text-ink border-l-2 border-ink-faint pl-2">{w}</p>)}
      </header>

      <div className="md:grid md:grid-cols-[11rem_1fr] md:gap-8">
        <nav aria-label="Sections" className="mb-4 md:mb-0 md:sticky md:top-4 md:self-start flex md:flex-col gap-1 overflow-x-auto text-sm">
          {SECTIONS.map(([k, l]) => <a key={k} href={`#${k}`} className="px-2 py-1 rounded-btn whitespace-nowrap text-ink-soft hover:text-accent hover:bg-white">{l}</a>)}
        </nav>

        <div className="space-y-8 min-w-0">
          <section><H id="json">Agent JSON</H>
            <p className="text-sm text-ink-soft mb-2">The exact minified payload an agent would receive for this company.</p>
            <JsonView json={row.packJson} bytes={bytes(row.packBytes)} tokens={tokens} />
          </section>

          <section><H id="charts">Charts</H><Charts quarters={pack.quarters} omitted={pack.omitted} /></section>

          <section><H id="contrast">Size contrast</H>
            {meta.sizes.tenKBytes ? (
              <div className="bg-white border border-line rounded-card p-4 space-y-3">
                <dl className="grid grid-cols-3 gap-3 text-sm num">
                  <div><dt className="label">Pack</dt><dd className="text-lg font-semibold">{bytes(meta.sizes.packBytes)}</dd><dd className="text-ink-faint text-xs">{num(meta.sizes.packBytes)} bytes</dd></div>
                  <div><dt className="label">Latest 10-K primary doc</dt><dd className="text-lg font-semibold">{bytes(meta.sizes.tenKBytes)}</dd><dd className="text-ink-faint text-xs">{num(meta.sizes.tenKBytes)} bytes</dd></div>
                  <div><dt className="label">Ratio</dt><dd className="text-lg font-semibold">{meta.sizes.reductionFactor}×</dd></div>
                </dl>
                <p className="text-sm text-ink-soft">The pack holds only the selected metrics; the filing carries far more (notes, segments, risk factors, MD&amp;A). This is not equal-information compression, and the pack does not replace the filing.</p>
                {meta.tenKUrl && <a className="text-sm text-accent hover:text-accent-hover hover:underline" href={meta.tenKUrl}>Filing document on EDGAR</a>}
              </div>
            ) : <p className="text-sm text-ink-soft">The 10-K size is unavailable for this pack (see notes above), so no contrast is shown.</p>}
          </section>

          <section><H id="ask">Ask the pack</H>
            <p className="text-sm text-ink-soft mb-2">Computed server-side from the stored pack on each request. No LLM.</p>
            <ul className="space-y-3">
              {qa.map((x) => (
                <li key={x.q} className="bg-white border border-line rounded-card p-3 text-sm space-y-1">
                  <p className="font-medium">{x.q}</p>
                  <p>{x.a}</p>
                  <p className="text-ink-soft text-xs">Computed: {x.computed}</p>
                  {x.cites.length > 0 && (
                    <details className="text-xs text-ink-soft"><summary className="cursor-pointer">Numbers used ({x.cites.length})</summary>
                      <ul className="num mt-1">{x.cites.map((c, i) => <li key={i}>{c.quarter} · {c.metric}: {c.unit === "pct" ? pct(c.value) : money(c.value)} <span className="text-ink-faint">({c.value})</span></li>)}</ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section><H id="provenance">Provenance</H>
            <div className="bg-white border border-line rounded-card overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-left border-b border-line"><tr className="label"><th className="px-3 py-2">Metric</th><th className="px-3 py-2">us-gaap tag(s)</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Derived quarters (cumulative difference)</th></tr></thead>
                <tbody>
                  {Object.entries(meta.metrics).map(([k, m]) => (
                    <tr key={k} className="border-b border-line last:border-0 align-top">
                      <td className="px-3 py-2">{m.label}</td>
                      <td className="px-3 py-2 num">{m.tags.map((t, i) => <div key={t}><a className="text-accent hover:underline" href={`https://data.sec.gov/api/xbrl/companyconcept/CIK${pack.cik}/us-gaap/${t}.json`}>{t}</a>{i < m.tags.length - 1 ? " +" : ""}</div>)}</td>
                      <td className="px-3 py-2">{m.unit}</td>
                      <td className="px-3 py-2 num text-xs">{m.derivedQ4OrYtdDifference.length ? `${m.derivedQ4OrYtdDifference.length}: ${m.derivedQ4OrYtdDifference.join(", ")}` : "none - all 3-month facts"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">Source payload: <a className="text-accent hover:underline break-all" href={meta.sourceUrl}>{meta.sourceUrl}</a></p>
            {meta.derivedMetrics.length > 0 && <ul className="text-xs text-ink-soft mt-2">{meta.derivedMetrics.map((d) => <li key={d.key}><span className="font-medium">{d.key}</span>: {d.formula}</li>)}</ul>}
            <h3 className="label mt-4 mb-1">Omitted metrics ({meta.omitted.length})</h3>
            {meta.omitted.length ? (
              <ul className="text-sm space-y-1">{meta.omitted.map((o) => <li key={o.key}><span className="font-medium">{o.label}</span> - {o.reason}</li>)}</ul>
            ) : <p className="text-sm text-ink-soft">None. All 7 metrics cover all 12 quarters.</p>}
            <p className="text-xs text-ink-faint mt-3">Values are as filed and may be restated later. Quarter ends are the company&apos;s own fiscal period ends.</p>
          </section>

          <section><H id="actions">Actions</H><PackActions id={row.id} ticker={row.ticker} metaJson={row.metaJson} /></section>
        </div>
      </div>
    </div>
  );
}
