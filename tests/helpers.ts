import { createDb, type Db } from "@/lib/db";

export async function memDb(): Promise<Db> {
  return createDb(); // in-memory
}

export async function addSource(db: Db, key: string, adapter: string, config: object = {}, terms: string | null = "https://example.com/terms") {
  await db.query("INSERT INTO sources(key, adapter, config, terms_url) VALUES ($1,$2,$3,$4)", [key, adapter, JSON.stringify(config), terms]);
}

export function feedFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}
