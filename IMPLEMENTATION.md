# Implementation notes (v2 rebuild)

## What was built
Replaced the static, build-time demo (committed JSON, `output: 'export'`) with a server-rendered Next.js app backed by Drizzle. Removed `scripts/fetch-facts.mjs`, `app/data/*`, and the old client components.

- `lib/sec.ts` - SEC client: `SEC_USER_AGENT` from env (503 if unset), serialized throttle, one retry after 2s.
- `lib/extract.ts` - XBRL to 12-quarter metrics, cumulative-difference quarters, omission reasons.
- `lib/service.ts` - ticker resolution (daily-cached), pack build, persistence, rate limits.
- `lib/qa.ts` - deterministic Q&A with cited numbers (unavailable questions say why).
- `lib/http.ts` - owner cookie, same-origin check, 20KB body guard.
- `app/page.tsx` library table; `app/pack/[id]/page.tsx` detail with left section nav; `app/components/*` (add form, JSON view, SVG charts, actions).
- `tailwind.config.ts` records the accent-colour rationale.

## Data model (identical shape in SQLite and Postgres)
- `sec_cache(url pk, body, fetched_at)` - ticker map, filtered companyfacts (only used us-gaap USD tags), reduced submissions, 10-K byte size.
- `packs(id pk, owner_id, ticker, cik, name, exchange, fetched_at, quarters, metrics_covered, metrics_omitted, pack_bytes, tenk_bytes, pack_json, meta_json)`, unique `(owner_id, ticker)`.
- `rate_events(id pk, owner_id, kind, at)`.

## Endpoints
| Method | Path | Notes |
|---|---|---|
| GET | /api/companies | own library |
| POST | /api/companies `{ticker}` | build pack: 400 bad ticker, 404 unknown, 409 exists/cap, 413, 422 no XBRL, 429, 502 SEC failure, 503 no UA |
| GET / DELETE | /api/companies/:id | owner only, else 403 (404 if absent) |
| POST | /api/companies/:id/refetch | bypasses cache, counts as an add |
| GET | /api/companies/:id/ask | Q&A from the stored pack |

## Verification (run locally, placeholder SEC_USER_AGENT via env only)
- `npm run build` passes; `tsc --noEmit` clean.
- Added MSFT, KO, AAPL, NVDA live. MSFT: 7/7 metrics, pack 4,218 B vs 10-K 8,585,613 B (2035.5x). KO: 5/7 covered (superseded by the debt correction below).
- Stored revenue and net income for the last quarters of MSFT and KO compared against the SEC companyconcept payloads: all matched exactly (KO's two latest quarters genuinely both report revenue of 13.38B in the source).
- Provenance panel lists tags, units, derived quarters, omitted metrics with reasons.
- Isolation: a second cookie sees `{"packs":[]}`; GET/DELETE/page on another owner's pack return 403.
- Limits: 413 on a 30KB body; 429 on the 6th add within an hour; 503 with no `SEC_USER_AGENT`.
- `devibe_scan.py .`: 0 findings (the two status-chip pills carry `unslop-ignore` comments).
- Screenshots: /tmp/cp2-library.png, /tmp/cp2-pack.png, /tmp/cp2-mobile.png (390px).

## Not verified / known limits
- Postgres path is written (schema + driver) but was not run against a live Postgres.
- Rate limiting is keyed by cookie; a client that discards cookies can mint new owners, limited only by the process-wide add cap.
- The UI shows one request-length progress message rather than per-stage progress.

## Debt-label correction (DEBT-FIX.md)
- The old metric extracted `LongTermDebt` but called it "Total debt". Now `totalDebt` is published only if `LongTermDebtNoncurrent` + `LongTermDebtCurrent` + `ShortTermBorrowings` all cover 12/12 quarters; else the exact-tag `longTermDebt` ("Long-term debt", us-gaap `LongTermDebt`) is published if it covers 12/12; else nothing. When the total is not published, a `totalDebt` omission with component coverage is recorded.
- Deviation from DEBT-FIX.md wording: it suggested LongTermDebt + LongTermDebtCurrent + ShortTermBorrowings. us-gaap `LongTermDebt` includes the current portion, so that would double count; the total uses the noncurrent tag instead. `CommercialPaper` is no longer a short-term substitute.
- Carried through: `lib/extract.ts` (keys, labels, provenance tags), `lib/qa.ts` (question and answer name the metric used and keep the "definitions differ across filers" caveat), `lib/service.ts` warning wording, README. Charts, JSON view and provenance render keys generically.
- Rebuild: `tsc --noEmit` clean, `npm run build` passes, `devibe_scan.py .` 0 findings.

## Second-company verification (live fetch, fresh DB, 2026-11-17)
Packs added live for KO (calendar FY), NVDA (Feb-Jan FY) and MSFT.
- Debt: MSFT and NVDA: total debt omitted (ShortTermBorrowings 0/12; NVDA LongTermDebtCurrent 10/12); `longTermDebt` published from `LongTermDebt` (12/12). KO: neither published (LongTermDebtNoncurrent 2/12, LongTermDebtCurrent 2/12, ShortTermBorrowings 0/12, LongTermDebt 2/12); both omissions listed with reasons. NVDA `longTermDebt` steps from $8.47B (2026-04-26) to $33.37B (2026-07-26) in the source data; reported as filed, not investigated.
- (a) Derived quarters, revenue (`Revenues`), hand-checked against EDGAR companyfacts:
  - NVDA Q4 FY26 (2026-01-25): 215,938,000,000 annual minus (44,062,000,000 + 46,743,000,000 + 57,006,000,000) = 68,127,000,000. Pack: 68,127,000,000. Flagged derived: 2024-01-28, 2025-01-26, 2026-01-25.
  - KO Q4 2025: 47,941,000,000 minus (11,129,000,000 + 12,535,000,000 + 12,455,000,000) = 11,822,000,000. Pack matches.
  - KO Q4 2024: 47,061,000,000 minus (11,300,000,000 + 12,363,000,000 + 11,854,000,000) = 11,544,000,000. Pack matches.
  - KO flagged derived: 2023-12-31, 2024-12-31, 2025-12-31. MSFT: 2024-06-30, 2025-06-30, 2026-06-30.
- (b) Restatements: the extractor keeps the latest-filed fact per period (`e.filed > p.filed` in `flowQuarters` and `instantQuarters`). In the KO/NVDA payloads no checked tag (Revenues, NetIncomeLoss, GrossProfit, OperatingIncomeLoss, LongTermDebt) had differing values across filings (KO FY2024 revenue appears 3 times, all 47,061,000,000), so the rule did not change these numbers. A synthetic check (555 filed 2025-06, 999 filed 2026-06, listed in either order) yields 999.
- (c) KO debt: no debt metric is published; the omission list explains the component coverage.
- Only revenue was hand-checked; the derived-quarter logic is shared by all flow metrics.
