"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PackActions({ id, ticker, metaJson }: { id: string; ticker: string; metaJson: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);

  async function call(kind: "refetch" | "delete") {
    if (kind === "delete" && !confirm(`Delete the ${ticker} pack? This cannot be undone.`)) return;
    setBusy(kind); setMsg(null);
    try {
      const res = await fetch(kind === "delete" ? `/api/companies/${id}` : `/api/companies/${id}/refetch`, kind === "delete" ? { method: "DELETE" } : { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) { setMsg(`${data.error.code}: ${data.error.message}`); return; }
      if (kind === "delete") { router.push("/"); router.refresh(); } else { setMsg("Re-fetched from SEC EDGAR."); router.refresh(); }
    } catch { setMsg("Could not reach the server."); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => call("refetch")} className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm disabled:opacity-50">{busy === "refetch" ? "Re-fetching…" : "Re-fetch from SEC"}</button>
        <button disabled={!!busy} onClick={() => call("delete")} className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm text-neg disabled:opacity-50">Delete pack</button>
        <button onClick={() => setRaw(!raw)} aria-expanded={raw} className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm">{raw ? "Hide" : "View"} stored extraction metadata</button>
      </div>
      <p className="text-xs text-ink-faint">Re-fetch bypasses the cache, hits SEC EDGAR, and counts against your 5 adds/hour limit.</p>
      {msg && <p className="text-sm" role="status">{msg}</p>}
      {raw && <pre className="font-mono text-xs bg-white border border-line rounded-card p-3 max-h-96 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(JSON.parse(metaJson), null, 2)}</pre>}
    </div>
  );
}
