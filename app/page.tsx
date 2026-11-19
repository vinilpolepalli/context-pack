import Link from "next/link";
import { cookies } from "next/headers";
import AddForm from "./components/AddForm";
import { listPacks, isUid } from "@/lib/service";
import { bytes } from "@/lib/qa";

export const dynamic = "force-dynamic";

export default async function Home() {
  const uid = (await cookies()).get("cp_uid")?.value;
  const packs = isUid(uid) ? await listPacks(uid) : [];
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight">Pack library</h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          {packs.length === 0
            ? "An agent should never have to parse a 10-K to get 12 quarters of revenue. Context Pack builds a small structured fundamentals pack for any US-listed ticker from SEC EDGAR XBRL, with every number carrying its source."
            : "Each pack holds 12 quarters of selected metrics from SEC EDGAR XBRL. Add another ticker below."}
        </p>
        <AddForm />
      </section>

      {packs.length === 0 ? (
        <p className="text-sm text-ink-faint border border-dashed border-line rounded-card p-6 bg-white">Your library is empty. Enter a ticker above (try MSFT or KO). Packs are private to this browser.</p>
      ) : (
        <>
          <table className="hidden md:table w-full text-sm bg-white border border-line rounded-card overflow-hidden">
            <thead className="text-left border-b border-line"><tr className="label">
              {["Ticker", "Name", "Quarters", "Metrics covered / omitted", "Pack size", "Fetched (UTC)", "Source"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-semibold"><Link className="text-accent hover:text-accent-hover hover:underline" href={`/pack/${p.id}`}>{p.ticker}</Link></td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 num">{p.quarters}</td>
                  <td className="px-3 py-2 num">{p.metricsCovered} / {p.metricsOmitted}</td>
                  <td className="px-3 py-2 num">{bytes(p.packBytes)}</td>
                  <td className="px-3 py-2 num">{p.fetchedAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2"><Chip /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden space-y-2">
            {packs.map((p) => (
              <li key={p.id} className="bg-white border border-line rounded-card p-3 text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <Link className="font-semibold text-accent" href={`/pack/${p.id}`}>{p.ticker}</Link><Chip />
                </div>
                <div>{p.name}</div>
                <div className="num text-ink-soft">{p.quarters} quarters · {p.metricsCovered} covered / {p.metricsOmitted} omitted · {bytes(p.packBytes)}</div>
                <div className="num text-ink-faint text-xs">Fetched {p.fetchedAt.slice(0, 16).replace("T", " ")} UTC</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// unslop-ignore: pill shape is reserved for status chips, as the spec allows
function Chip() {
  return <span /* unslop-ignore: status chip, pills allowed for chips only */ className="inline-block rounded-full border border-line bg-zinc-50 px-2 py-0.5 text-xs text-ink-soft whitespace-nowrap">SEC EDGAR XBRL</span>;
}
