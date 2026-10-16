import type { Db } from "../db";
import { greenhouseAdapter } from "./adapters/greenhouse";
import { jsonFeedAdapter } from "./adapters/json_feed";
import type { FetchContext, RawJob, SourceAdapter } from "./types";
import { USER_AGENT, contentHash, dedupeKey, slugify } from "./util";

export const adapters: Record<string, SourceAdapter> = {
  json_feed: jsonFeedAdapter,
  greenhouse: greenhouseAdapter,
};

export interface RunStats {
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  expired: number;
}

export interface RunOptions {
  dryRun?: boolean;
  fetchFn?: typeof fetch;
  now?: Date;
}

async function upsertCompany(db: Db, name: string, website?: string): Promise<number> {
  const slug = slugify(name);
  const r = await db.query<{ id: number }>(
    `INSERT INTO companies(slug, name, website) VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET website = COALESCE(companies.website, EXCLUDED.website) RETURNING id`,
    [slug, name, website ?? null],
  );
  return r.rows[0].id;
}

export async function ingestSource(db: Db, sourceKey: string, opts: RunOptions = {}): Promise<RunStats> {
  const now = opts.now ?? new Date();
  const src = (await db.query<{ id: number; adapter: string; config: Record<string, unknown>; enabled: boolean; terms_url: string | null }>(
    "SELECT id, adapter, config, enabled, terms_url FROM sources WHERE key = $1",
    [sourceKey],
  )).rows[0];
  if (!src) throw new Error(`Unknown source: ${sourceKey}`);
  if (!src.enabled) throw new Error(`Source disabled: ${sourceKey}`);
  if (!src.terms_url) throw new Error(`Source ${sourceKey} has no terms_url recorded; confirm usage rights first (see docs/job-sources.md)`);
  const adapter = adapters[src.adapter];
  if (!adapter) throw new Error(`Unknown adapter: ${src.adapter}`);

  const stats: RunStats = { fetched: 0, inserted: 0, updated: 0, duplicates: 0, expired: 0 };
  const run = (await db.query<{ id: number }>(
    "INSERT INTO ingestion_runs(source_id, dry_run, started_at) VALUES ($1,$2,$3) RETURNING id",
    [src.id, !!opts.dryRun, now],
  )).rows[0].id;

  try {
    const ctx: FetchContext = { fetchFn: opts.fetchFn ?? fetch, userAgent: USER_AGENT };
    const jobs: RawJob[] = await adapter.fetch(src.config, ctx);
    stats.fetched = jobs.length;
    const seen = new Set<string>();

    for (const j of jobs) {
      seen.add(j.externalId);
      const key = dedupeKey(j);
      const hash = contentHash(j);
      const existing = (await db.query<{ id: number; content_hash: string }>(
        "SELECT id, content_hash FROM jobs WHERE source_id=$1 AND external_id=$2",
        [src.id, j.externalId],
      )).rows[0];

      if (!existing) {
        const dup = (await db.query("SELECT 1 FROM jobs WHERE dedupe_key=$1 AND status='active' AND source_id<>$2 LIMIT 1", [key, src.id])).rows.length;
        if (dup) { stats.duplicates++; continue; }
      }
      if (existing && existing.content_hash === hash) {
        if (!opts.dryRun) await db.query("UPDATE jobs SET last_seen_at=$2, status='active' WHERE id=$1", [existing.id, now]);
        continue;
      }
      if (existing) stats.updated++; else stats.inserted++;
      if (opts.dryRun) continue;

      const companyId = await upsertCompany(db, j.company, j.companyWebsite);
      const vals = [
        src.id, j.externalId, companyId, j.title, j.description ?? "", j.location ?? null, j.country ?? null, j.city ?? null,
        j.remote ?? false, j.employmentType ?? null, j.salaryMin ?? null, j.salaryMax ?? null, j.salaryCurrency ?? null,
        j.applyUrl, j.postedAt ?? now, j.validThrough ?? null, hash, key, now,
      ];
      await db.query(
        `INSERT INTO jobs(source_id, external_id, company_id, title, description, location, country, city, remote, employment_type,
           salary_min, salary_max, salary_currency, apply_url, posted_at, valid_through, content_hash, dedupe_key, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (source_id, external_id) DO UPDATE SET
           company_id=EXCLUDED.company_id, title=EXCLUDED.title, description=EXCLUDED.description, location=EXCLUDED.location,
           country=EXCLUDED.country, city=EXCLUDED.city, remote=EXCLUDED.remote, employment_type=EXCLUDED.employment_type,
           salary_min=EXCLUDED.salary_min, salary_max=EXCLUDED.salary_max, salary_currency=EXCLUDED.salary_currency,
           apply_url=EXCLUDED.apply_url, valid_through=EXCLUDED.valid_through, content_hash=EXCLUDED.content_hash,
           dedupe_key=EXCLUDED.dedupe_key, last_seen_at=EXCLUDED.last_seen_at, status='active'`,
        vals,
      );
    }

    // Expiry. Only trust "not in feed" when the feed returned something (guards against empty/failed responses wiping the DB).
    if (stats.fetched > 0) {
      const seenArr = [...seen];
      const sql = (verb: string) =>
        `${verb} jobs SET status='expired' WHERE source_id=$1 AND status='active' AND NOT (external_id = ANY($2::text[]))`;
      if (opts.dryRun) {
        stats.expired = (await db.query(`SELECT 1 FROM jobs WHERE source_id=$1 AND status='active' AND NOT (external_id = ANY($2::text[]))`, [src.id, seenArr])).rows.length;
      } else {
        stats.expired = (await db.query(sql("UPDATE"), [src.id, seenArr])).affectedRows ?? 0;
      }
    }
    if (!opts.dryRun) {
      stats.expired += (await db.query("UPDATE jobs SET status='expired' WHERE status='active' AND valid_through IS NOT NULL AND valid_through < $1", [now])).affectedRows ?? 0;
    }

    await db.query(
      "UPDATE ingestion_runs SET finished_at=now(), fetched=$2, inserted=$3, updated=$4, duplicates=$5, expired=$6 WHERE id=$1",
      [run, stats.fetched, stats.inserted, stats.updated, stats.duplicates, stats.expired],
    );
    return stats;
  } catch (e) {
    await db.query("UPDATE ingestion_runs SET finished_at=now(), error=$2 WHERE id=$1", [run, String(e)]);
    throw e;
  }
}
