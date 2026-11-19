"use client";
import { useState } from "react";

export default function JsonView({ json, bytes, tokens }: { json: string; bytes: string; tokens: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft num">{bytes} · ≈{tokens.toLocaleString()} tokens <span className="text-ink-faint">(estimate: bytes ÷ 4, not a tokenizer count)</span></p>
      <div className="flex gap-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm">{open ? "Hide JSON" : "Show JSON"}</button>
        <button onClick={async () => { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="rounded-btn border border-line bg-white px-3 py-1.5 text-sm">{copied ? "Copied" : "Copy"}</button>
      </div>
      {open && <pre className="font-mono text-xs bg-white border border-line rounded-card p-3 max-h-96 overflow-auto whitespace-pre-wrap break-all">{json}</pre>}
    </div>
  );
}
