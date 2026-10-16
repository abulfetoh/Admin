// Usage: npm run make-admin -- email@example.com  (user must already be registered)
import path from "node:path";
import { createDb } from "../src/lib/db";
const email = process.argv[2];
if (!email) throw new Error("email required");
const db = await createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"));
const r = await db.query("UPDATE users SET role='admin' WHERE lower(email)=lower($1)", [email]);
console.log(r.affectedRows ? "promoted" : "no such user");
await db.close();
