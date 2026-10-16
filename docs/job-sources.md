# Job sources & compliance

Rules the framework enforces or assumes:
1. **Only sources we have the right to use**: official public APIs intended for aggregators (e.g. Greenhouse Job Board API), or feeds an employer/partner has authorised. **No scraping of sites that forbid it.**
2. A source row must have `terms_url` recorded; `ingestSource` refuses to run without it. Record where you confirmed permission.
3. Identified User-Agent (`TodayJobsBot`); retries with exponential backoff on 5xx/429/network errors only (never on other 4xx).
4. Apply links point to the employer.
5. Safety: an empty feed never expires existing jobs; malformed items are skipped, not fatal; every run is logged in `ingestion_runs` (including errors). `--dry-run` writes nothing.
6. Dedupe: same company+title+city across different sources is counted as a duplicate and skipped. Expiry: missing from the source feed, or past `valid_through`.

## Adding a source
`INSERT INTO sources(key, adapter, config, terms_url) ...` — adapters: `json_feed` (`{url}`), `greenhouse` (`{board, company?}`).
New adapter: implement `SourceAdapter` in `src/lib/ingest/adapters/` and register it in `run.ts`.

## Adding sources from the admin UI
`/admin` -> "Add a source": key, adapter, strict JSON config, and a **permission/terms URL** (https). New sources are created *disabled*; review, then enable. Feed URLs must be public https (private/loopback/metadata IP literals are rejected at creation and at fetch time).
