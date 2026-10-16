import path from "node:path";
import { createDb } from "../src/lib/db";
import { ingestSource } from "../src/lib/ingest/run";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const keys = args.filter((a) => !a.startsWith("--"));
const db = await createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"));
const targets = keys.length ? keys : (await db.query<{ key: string }>("SELECT key FROM sources WHERE enabled")).rows.map((r) => r.key);
for (const k of targets) {
  try {
    console.log(k, await ingestSource(db, k, { dryRun }));
  } catch (e) {
    console.error(k, "FAILED:", String(e));
    process.exitCode = 1;
  }
}
await db.close();
