# Context Pack v2 - high-fidelity rebuild spec

Rebuild this static demo into a real working product with a live backend. This demo maps to Financial Datasets (financialdatasets.ai, YC S26): market data infrastructure for AI agents - structured, provenance-carrying fundamentals instead of raw filings. The product's point: an agent should never have to parse a 10-K to get 12 quarters of revenue. Context Pack builds those packs on demand from SEC EDGAR, for any ticker, with every number carrying its source.

Do not deploy, do not git commit, do not push. No paid services or API keys.

## Architecture
- Next.js App Router + TypeScript + Tailwind, SERVER runtime (no output:'export'). Remove the static export and the old build-time-only data flow.
- Drizzle ORM: SQLite file (contextpack.db) in dev; Postgres via DATABASE_URL in prod (same pattern as a standard Next prod deploy; schema must work on both).
- SEC EDGAR is the only data source (free public API, no key):
  - https://www.sec.gov/files/company_tickers.json to resolve ticker -> CIK (cache it in the DB, refresh at most daily)
  - https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json for facts
  - https://data.sec.gov/submissions/CIK##########.json for filing metadata
  - latest 10-K primary document fetched for its byte size only
- SEC requires a declared User-Agent. Read it from env SEC_USER_AGENT. If unset, the fetch endpoint returns 503 with a clear "set SEC_USER_AGENT" configuration message. NEVER commit a value or invent one.
- Throttle all SEC requests server-side (max ~5/sec, serialized per process) and cache fetched payloads in the DB so a re-view of a stored pack costs zero SEC requests.

## Product workflow (fitted to THIS product, not a clone of any other demo)
1. Home = pack library: a plain data table (ticker, name, quarters covered, metrics covered/omitted, pack bytes, fetched-at, source chip). Empty state explains the product in two sentences with the add form right there. First useful action above the fold on mobile.
2. Add a company by ticker: POST /api/companies {ticker}. Server resolves CIK, fetches companyfacts + submissions, extracts the pack (see metrics below), measures the latest 10-K primary document byte size, stores everything, returns the pack. Progress and failure states are explicit (unknown ticker, no XBRL data, partial coverage) - never a silent empty.
3. Pack detail page per company:
   - Header: company name, ticker, CIK, exchange if available, fetched-at UTC, "source: SEC EDGAR XBRL" chip, link to the filing index on EDGAR.
   - Agent JSON view: the exact minified JSON an agent would receive (collapsible, copy button), with byte size and rough token estimate (bytes/4, labeled as an estimate, not a tokenizer count).
   - Charts: revenue and margins over the covered quarters, plain inline SVG drawn from the stored pack (no chart lib).
   - Contrast panel: pack bytes vs latest 10-K primary document bytes, with the reduction factor, and one honest sentence: the pack holds only the selected metrics; the filing carries far more; this is not equal-information compression and the pack does not replace the filing.
   - Ask the pack: 3-4 deterministic Q&As computed server-side from the stored pack at request time (e.g. gross margin trend, latest QoQ revenue growth, debt change), each answer citing the exact numbers and quarters it used. No LLM anywhere. Answers state exactly what they computed.
   - Provenance panel: per metric - the us-gaap tag used, the XBRL source URL, units; quarters derived as cumulative differences are flagged; every omitted metric is LISTED with the reason (e.g. "not tagged quarterly for this filer"). Unknown/unparsed stays unknown, never a fallback number.
4. Pack actions: re-fetch (explicit refresh, counts against rate limits), delete (with confirm), view raw stored extraction metadata.

## Metrics (12 most recent quarters where covered)
Revenue (RevenueFromContractWithCustomerExcludingAssessedCost, fallback Revenues), Net income (NetIncomeLoss), Gross profit (GrossProfit), Operating income (OperatingIncomeLoss), Total assets (Assets), Total debt (LongTermDebt with noncurrent+current fallback), Operating cash flow (NetCashProvidedByUsedInOperatingActivities). Derived: gross margin, operating margin, QoQ revenue growth. Omit a metric unless all 12 quarters are covered; record each omission and why. Quarterly flows use 3-month facts when filed, else the difference between cumulative periods sharing a fiscal-year start, flagged derivedQ4OrYtdDifference. Preserve the current repo's provenance rules in README - they were carefully written; carry them forward.

## Truthfulness bar (hard requirements)
- Every displayed figure traces to the XBRL payload; keep per-company sourceUrl and per-metric tags.
- "SAMPLE DATA" chips do not exist here - everything shown is live-fetched from EDGAR; label the fetch time per pack. If seeded example packs are kept for first-run illustration, they must be clearly labeled SAMPLE and deletable, and never blend into live-fetched packs.
- Footer: "Demo built by Vinil Polepalli · data: SEC EDGAR XBRL" and "Independent demo; not affiliated with or endorsed by Financial Datasets. Figures are extracted from public filings for demonstration, not investment advice."

## Abuse and isolation controls (proportionate)
- gl-style owner cookie (cp_uid, httpOnly) scoping: each visitor sees only their own pack library; cross-owner access 403.
- Rate limits: per owner - 5 company adds/hour, 60 other writes/hour, 20-pack cap; 413 at 20KB bodies; ticker input validated (1-6 uppercase letters) before any SEC call.
- All SEC fetch failures are shown honestly; no retries hammering SEC (one retry after 2s max).

## UI bar
- Light theme, near-white ground (#fafafa ok), hairline borders, small-caps section labels, tabular numerals for figures, system font stack (ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif). Mono only for the JSON view.
- Brand accent: deep teal #0e7490 (hover #155e75). Deliberate: data-infrastructure/terminal character, outside the indigo/violet AI-default band, not the cream/serif/sage swap. Record the reason as a comment in tailwind.config.ts. Links and the single primary button use it; everything else is ink.
- Semantic colors only for positive/negative financial figures (muted green/red) and status chips; pills only for status chips; buttons radius 8px, cards 10px, inputs 8px. No gradients, no emoji icons, no hero + three-card grid, no amber-50 fills.
- The layout is a data tool: library table, dense pack detail with a left section nav. Do not copy Governance Lens's layout or components.
- Mobile: library becomes stacked rows; pack detail sections stack; charts scroll horizontally if needed.

## Definition of done
- npm run build passes; typecheck clean.
- Real end-to-end run: start the server, add MSFT and KO through the UI or API, verify the stored pack numbers against the XBRL source for at least revenue and net income, verify provenance panel lists tags and omissions, verify owner isolation (second cookie sees an empty library), verify rate limit returns 429 after the cap.
- Run python3 ~/unslop/devibe_scan.py . - target zero high findings; any kept pattern gets a code comment with unslop-ignore and the reason.
- Update README.md (architecture, run, SEC_USER_AGENT, provenance/caveats) and write IMPLEMENTATION.md (what was built, data model, endpoints, verification results).
- Screenshots to /tmp: cp2-library.png, cp2-pack.png, cp2-mobile.png (390px) from the RUNNING app.
