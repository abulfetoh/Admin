import type { Db, Tx } from "./db";

/**
 * Runs `fn` in a transaction as the unprivileged `app_user` role with `app.user_id` set,
 * so Postgres RLS policies (migration 006) enforce row ownership even if a query forgets its WHERE.
 */
export async function withUser<T>(db: Db, userId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE app_user");
    await tx.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
    return fn(tx);
  });
}
