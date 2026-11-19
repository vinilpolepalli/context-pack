import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Context Pack - fundamentals for agents, built from SEC EDGAR",
  description: "Build a 12-quarter fundamentals pack for any US-listed ticker from SEC EDGAR XBRL, with every number carrying its source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink antialiased font-sans flex flex-col">
        <header className="border-b border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 h-12 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">Context Pack</Link>
            <span className="label">source: SEC EDGAR XBRL</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 flex-1">{children}</main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-soft space-y-1">
            <p>Demo built by Vinil Polepalli · data: SEC EDGAR XBRL</p>
            <p>Independent demo; not affiliated with or endorsed by Financial Datasets. Figures are extracted from public filings for demonstration, not investment advice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
