// Dev-only demo data: inserts clearly fictional jobs through the real ingestion pipeline.
import path from "node:path";
import { createDb } from "../src/lib/db";
import { ingestSource } from "../src/lib/ingest/run";

const db = await createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"));
await db.query(
  `INSERT INTO sources(key, adapter, config, terms_url) VALUES ('demo','json_feed','{"url":"https://demo.invalid/feed.json"}','https://demo.invalid/terms') ON CONFLICT (key) DO NOTHING`,
);
const jobs = [
  ["1", "Software Engineer", "Demo Co", "Cairo", "Egypt", false, "Build web services in TypeScript."],
  ["2", "Senior Accountant", "Sample Ltd", "Dubai", "AE", false, "Own month-end close and reporting."],
  ["3", "Data Analyst", "Example Inc", "Remote", "", true, "Analyse product metrics with SQL."],
  ["4", "محاسب", "شركة تجريبية", "الرياض", "SA", false, "إعداد القوائم المالية الشهرية."],
].map(([id, title, company, city, country, remote, description]) => ({
  id, title, company, city, country: country || undefined, location: city, remote, description, apply_url: `https://demo.invalid/apply/${id}`,
}));
const fetchFn = (async () => new Response(JSON.stringify({ jobs }))) as typeof fetch;
console.log(await ingestSource(db, "demo", { fetchFn }));
await db.close();
