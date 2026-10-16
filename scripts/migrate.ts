import path from "node:path";
import { createDb } from "../src/lib/db";
const db = await createDb(process.env.DB_DIR ?? path.join(process.cwd(), "data", "pg"));
console.log("migrations up to date");
await db.close();
