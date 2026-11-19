# Context Pack

A live fundamentals-pack builder. Enter a US-listed ticker and the server builds a **12-quarter pack of selected metrics** from SEC EDGAR XBRL, stores it, and shows it next to the size of the company's latest 10-K primary document. Every number carries its source (us-gaap tag, XBRL URL, units, derived-quarter flags). The point: an agent should never have to parse a 10-K to get 12 quarters of revenue.

The size comparison is not an equal-information compression: the pack holds only the selected metrics, while the filing carries far more (notes, segments, risk factors, MD&A). The pack does not replace the filing.

## Architecture

- Next.js App Router + TypeScript + Tailwind, **server runtime** (no static export).
- Drizzle ORM. SQLite file `contextpack.db` in dev (better-sqlite3); Postgres when `DATABASE_URL` is set (`lib/db/schema.pg.ts` mirrors `lib/db/schema.ts`). Tables are created on first use.
- SEC EDGAR is the only data source: `company_tickers.json` (ticker to CIK, cached in the DB, refreshed at most daily), `companyfacts`, `submissions`, and the latest 10-K primary document (byte size only).
- All SEC requests are serialized per process and throttled (about 4/sec); one retry after 2s at most. Fetched payloads are cached in the DB, so viewing a stored pack costs zero SEC requests.
- Owner scoping: an httpOnly `cp_uid` cookie. Each visitor sees only their own library; other owners' packs return 403.
- Limits per owner: 5 adds/re-fetches per hour, 60 other writes per hour, 20 packs, 413 above 20KB bodies, ticker validated as 1-6 uppercase letters before any SEC call. A process-wide cap of 100 SEC-hitting adds per hour backstops cookie-less clients.

## Run

```bash
npm install
export SEC_USER_AGENT="Your Name you@example.com"   # required by SEC; never commit it
npm run dev                                          # or: npm run build && npm start
```

Without `SEC_USER_AGENT`, `POST /api/companies` and re-fetch return **503** with a configuration message. For Postgres set `DATABASE_URL`. `SQLITE_PATH` overrides the dev DB location.

`node scripts/screenshots.mjs <base-url> <cp_uid> <pack-id> [outdir]` captures screenshots from a running app.

## Data provenance and caveats

- Every figure comes from the XBRL companyfacts payload. The pack carries `source.url` and the us-gaap tag(s) per metric; the pack page lists each tag with its companyconcept URL, unit, and derived quarters.
- Metrics: revenue, net income, gross profit, operating income, total assets, debt (see below), operating cash flow; derived gross margin, operating margin, QoQ revenue growth.
- Quarterly flows use 3-month facts when filed. Otherwise (Q4, and cash flow reported year-to-date) the quarter is the difference between cumulative periods that share a fiscal-year start; those quarters are flagged in `derivedQ4OrYtdDifference`.
- For each metric the extractor picks the candidate tag with the best coverage and **omits the metric unless all 12 quarters are covered**. Every omission is recorded with a reason (not tagged for this filer, or tagged but only N of 12 quarters covered). Unknown stays unknown; no fallback numbers.
- Revenue candidates: `RevenueFromContractWithCustomerExcludingAssessedTax` (the real us-gaap name), `Revenues`, `RevenueFromContractWithCustomerIncludingAssessedTax`, `SalesRevenueNet`, `RevenuesNetOfInterestExpense`.
- Debt: **Total debt** (`totalDebt`) is published only when `LongTermDebtNoncurrent` + `LongTermDebtCurrent` + `ShortTermBorrowings` are all tagged for all 12 quarters; the component tags are listed in provenance. (us-gaap `LongTermDebt` already includes the current portion, so it is not added to `LongTermDebtCurrent`.) Otherwise no partial total is published: the metric falls back to **Long-term debt** (`longTermDebt`, exactly the `LongTermDebt` tag) if that covers all 12 quarters, and the omission list says why total debt is absent. Definitions differ across filers, so cross-company debt comparisons are not like-for-like.
- Restated facts: when several facts exist for the same period, the extractor takes the latest-filed one.
- The 12 quarters are the latest contiguous run of net-income quarter ends. Quarter-end dates are the companies' own fiscal period ends; values are as filed and may be restated later. Only USD, us-gaap facts are read.
- Raw 10-K size is the byte length of the primary document; token figures are bytes ÷ 4, an estimate, not a tokenizer count. Pack bytes are the exact stored minified JSON (including its `source` block).
- A pack's fetched-at time is the oldest underlying payload fetch, so a pack served from a payload cached by an earlier add shows that earlier time. Re-fetch bypasses the cache.
- "Ask the pack" answers are computed server-side from the stored pack with no LLM, and cite the exact quarters and numbers used.
- Independent demo; not affiliated with or endorsed by Financial Datasets. Figures are for demonstration, not investment advice.
