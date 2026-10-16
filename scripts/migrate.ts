import { openDb } from "../src/lib/db";
const db = await openDb();
console.log("migrations up to date");
await db.close();
