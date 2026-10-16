import path from "node:path";
import { runAlerts } from "../src/lib/alerts";
import { createDb } from "../src/lib/db";
import { flushOutbox, getTransport } from "../src/lib/email";
const db = await createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"));
console.log(await runAlerts(db), await flushOutbox(db, getTransport()));
await db.close();
