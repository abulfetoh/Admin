# Architecture

- **Next.js 15 (App Router) + TypeScript + Tailwind 4.** Pages are server-rendered (`force-dynamic`) from the DB.
- **DB:** embedded Postgres (PGlite, `data/pg`) for dev with `pg_trgm`. SQL migrations in `migrations/`, applied by `src/lib/db.ts#migrate`. Production should use managed Postgres; the SQL is plain Postgres.
- **Search** (`src/lib/jobs.ts`): `websearch_to_tsquery('simple')` over a weighted generated `tsvector` (title > location > description); if nothing matches, falls back to trigram similarity on title/company for typo tolerance. The `simple` config keeps Arabic searchable (no stemming).
- **i18n:** EN/AR dictionaries in `src/lib/i18n.ts`; locale in a `lang` cookie, `<html lang dir>` set (RTL for Arabic). Locale-prefixed URLs + hreflang are NOT done yet.
- **SEO:** `robots.ts`, `sitemap.ts`, canonical URLs, slug redirect (308), `JobPosting` JSON-LD only for active, unexpired jobs with a description (`src/lib/jsonld.ts`).
- **Ingestion:** `src/lib/ingest/` — adapters return the full current job set; `run.ts` handles dedupe, upsert, expiry, run logging.

## Commands
`npm run migrate | seed | ingest [-- <source> --dry-run] | test | typecheck | lint | build`
`SITE_URL` sets the canonical origin (default https://today-jobs.com — domain not purchased/verified).
