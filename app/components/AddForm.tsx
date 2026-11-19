"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setNote(null);
    const t = ticker.trim().toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(t)) { setErr({ code: "bad_ticker", message: "Ticker must be 1-6 letters (A-Z)." }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: t }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error); return; }
      const w: string[] = data.meta.warnings;
      if (w.length) { setNote(`${t} added with notes: ${w.join(" ")}`); }
      setTicker("");
      router.refresh();
      if (!w.length) router.push(`/pack/${data.id}`);
    } catch {
      setErr({ code: "network", message: "Could not reach the server." });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-busy={busy}>
      <div className="flex gap-2">
        <label htmlFor="ticker" className="sr-only">Ticker</label>
        <input id="ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={6} placeholder="Ticker, e.g. MSFT" autoComplete="off" spellCheck={false}
          className="w-44 rounded-input border border-line bg-white px-3 py-2 text-sm uppercase" />
        <button disabled={busy || !ticker} className="rounded-btn bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 text-sm font-medium">
          {busy ? "Fetching…" : "Build pack"}
        </button>
      </div>
      {busy && <p className="text-sm text-ink-soft" role="status">Resolving ticker, fetching XBRL facts and the latest 10-K from SEC EDGAR (throttled; can take 10-30 seconds)…</p>}
      {err && <p className="text-sm text-neg" role="alert"><span className="font-medium">{err.code}:</span> {err.message}</p>}
      {note && <p className="text-sm text-ink-soft" role="status">{note}</p>}
    </form>
  );
}
