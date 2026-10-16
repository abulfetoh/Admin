import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db";

describe("createDb on a fresh checkout", () => {
  it("creates missing nested data directories and persists across reopen", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tj-db-"));
    const dir = path.join(root, "does", "not", "exist", "pg");
    try {
      const db = await createDb(dir);
      await db.query("INSERT INTO companies(slug, name) VALUES ('c','C')");
      await db.close();
      const again = await createDb(dir); // reopen: migrations are not re-applied, data survives
      expect((await again.query("SELECT slug FROM companies")).rows).toEqual([{ slug: "c" }]);
      expect((await again.query("SELECT count(*) n FROM schema_migrations")).rows[0]).toMatchObject({ n: expect.anything() });
      await again.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
