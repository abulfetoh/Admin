import type { Db } from "./db";
import { slugify } from "./ingest/util";

export interface JobRow {
  id: number;
  title: string;
  description: string;
  location: string | null;
  country: string | null;
  city: string | null;
  remote: boolean;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  apply_url: string;
  posted_at: Date;
  valid_through: Date | null;
  status: string;
  company_name: string;
  company_slug: string;
  company_website: string | null;
}

const COLS = `j.id, j.title, j.description, j.location, j.country, j.city, j.remote, j.employment_type, j.salary_min, j.salary_max,
  j.salary_currency, j.apply_url, j.posted_at, j.valid_through, j.status, c.name AS company_name, c.slug AS company_slug, c.website AS company_website`;

export interface SearchParams {
  q?: string;
  location?: string;
  remote?: boolean;
  page?: number;
  pageSize?: number;
}
export interface SearchResult {
  jobs: JobRow[];
  total: number;
  fuzzy: boolean;
}

export async function searchJobs(db: Db, p: SearchParams): Promise<SearchResult> {
  const pageSize = Math.min(Math.max(p.pageSize ?? 20, 1), 50);
  const offset = (Math.max(p.page ?? 1, 1) - 1) * pageSize;
  const q = p.q?.trim().slice(0, 200) ?? "";

  const filters: string[] = ["j.status = 'active'"];
  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), `$${params.length}`);
  if (p.location?.trim()) filters.push(`(j.location ILIKE ${add(`%${p.location.trim()}%`)} OR j.city ILIKE ${add(`%${p.location.trim()}%`)})`);
  if (p.remote) filters.push("j.remote = true");

  const run = async (match: string, order: string, extraParams: unknown[]) => {
    const where = [...filters, match].filter(Boolean).join(" AND ");
    const base = `FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ${where}`;
    const all = [...params, ...extraParams];
    const total = Number((await db.query<{ n: string }>(`SELECT count(*) AS n ${base}`, all)).rows[0].n);
    const rows = (await db.query<JobRow>(`SELECT ${COLS} ${base} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`, all)).rows;
    return { jobs: rows, total };
  };

  if (!q) return { ...(await run("", "j.posted_at DESC, j.id DESC", [])), fuzzy: false };

  const qi = params.length + 1;
  const fts = await run(`j.search_tsv @@ websearch_to_tsquery('simple', $${qi})`, `ts_rank(j.search_tsv, websearch_to_tsquery('simple', $${qi})) DESC, j.posted_at DESC`, [q]);
  if (fts.total > 0) return { ...fts, fuzzy: false };

  // Typo tolerance: trigram similarity against title and company name.
  const tri = await run(
    `(similarity(j.title, $${qi}) > 0.25 OR word_similarity($${qi}, j.title) > 0.45 OR similarity(c.name, $${qi}) > 0.35)`,
    `greatest(similarity(j.title, $${qi}), word_similarity($${qi}, j.title)) DESC, j.posted_at DESC`,
    [q],
  );
  return { ...tri, fuzzy: true };
}

export async function getJob(db: Db, id: number): Promise<JobRow | null> {
  const r = await db.query<JobRow>(`SELECT ${COLS} FROM jobs j JOIN companies c ON c.id = j.company_id WHERE j.id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function listIndexableJobs(db: Db, limit = 45000): Promise<Pick<JobRow, "id" | "title" | "posted_at">[]> {
  return (await db.query<Pick<JobRow, "id" | "title" | "posted_at">>(
    "SELECT id, title, posted_at FROM jobs WHERE status='active' ORDER BY posted_at DESC LIMIT $1",
    [limit],
  )).rows;
}

export const jobPath = (j: { id: number; title: string }) => `/jobs/${j.id}/${slugify(j.title)}`;
