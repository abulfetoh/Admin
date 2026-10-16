import { runAlerts } from "../src/lib/alerts";
import { openDb } from "../src/lib/db";
import { flushOutbox, getTransport } from "../src/lib/email";
const db = await openDb();
console.log(await runAlerts(db), await flushOutbox(db, getTransport()));
await db.close();
