# Context Pack - build spec

Build a polished working web app demo called "Context Pack". It will be shown to Financial Datasets (financialdatasets.ai, YC S26), whose product is market data and financial research infrastructure built for AI agents: clean, structured, agent-consumable financial data instead of raw filings.

## What it demonstrates
The core problem Financial Datasets solves: an LLM agent that needs a company's fundamentals today has to parse 100+ page 10-K/10-Q filings - huge token counts, error-prone extraction. Financial Datasets gives agents structured fundamentals directly. Context Pack makes that contrast tangible:

1. REAL DATA via SEC EDGAR XBRL (free public API, no key): use https://data.sec.gov/submissions/CIK##########.json for filing metadata and https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json for structured facts. EDGAR requires a declared User-Agent; read it from env var SEC_USER_AGENT (never commit a value).
2. At BUILD TIME, for 4 well-known companies (e.g. NVDA, MSFT, KO, GS): fetch the companyfacts JSON, extract the last 12 quarters of revenue, net income, gross profit, operating income, total assets, total debt, operating cash flow (us-gaap tags: Revenues or RevenueFromContractWithCustomerExcludingAssessedCost, NetIncomeLoss, GrossProfit, OperatingIncomeLoss, Assets, LongTermDebt + ShortTermDebt fallbacks, NetCashProvidedByUsedInOperatingActivities). Derive simple ratios (gross margin, operating margin, revenue growth QoQ). Save as committed JSON in app/data/. Also record the byte size of the raw latest 10-K filing document vs the byte size of the assembled context pack, to quantify the token/context reduction. Use only real extracted numbers; omit what cannot be extracted reliably.
3. THE APP (Next.js App Router + TypeScript + Tailwind, static export output:'export', dark navy/indigo sleek design, rounded corners):
   - Company picker. For each company show: (a) the "agent view" - the exact compact JSON context pack an agent would receive, syntax highlighted, with byte/token estimate; (b) charts (simple SVG, no chart lib needed) of revenue and margins over 12 quarters built from the same pack; (c) the contrast panel: raw 10-K size vs pack size with the reduction factor, and a short line on why structured beats parsing.
   - An "ask the pack" section: 3-4 precomputed deterministic Q&A per company (e.g. "What was NVDA's gross margin trend?") answered from the pack data with the numbers cited - showing an agent can answer from a small context. Deterministic, no LLM at runtime.
   - Footer: "Demo built by Vinil Polepalli · data: SEC EDGAR XBRL" and "Independent demo; not affiliated with or endorsed by Financial Datasets. Figures are extracted from public filings for demonstration, not investment advice."
4. scripts/fetch-facts.mjs does the fetching/extraction, documented in README, re-runnable. README: what it is, why it maps to Financial Datasets' problem (agents need structured fundamentals, not raw filings), how to run, data provenance and caveats.

## Quality bar
- npm run build passes cleanly. No paid services, no API keys, no databases, no invented numbers. Every figure traces to the XBRL companyfacts payload; keep per-company sourceUrl.
- No lorem ipsum, no placeholders, no fake metrics.

Work fully autonomously in the current directory. Run the fetch for real (network available). Run npm install and npm run build and fix all errors until green. Do not deploy, do not git commit.
