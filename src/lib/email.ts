import type { Db } from "./db";

export interface EmailMessage { to: string; subject: string; body: string }
export interface EmailTransport { send(m: EmailMessage): Promise<void> }

/** Dev transport: prints instead of sending. A real provider (SMTP/API) implements EmailTransport and is chosen in getTransport(). */
export const consoleTransport: EmailTransport = {
  async send(m) {
    console.log(`[email] to=${m.to} subject=${m.subject}`);
  },
};

export function getTransport(): EmailTransport {
  return consoleTransport; // TODO(integration): select provider via env once one is chosen (see docs/integrations-registry.md)
}

export async function enqueueEmail(db: Db, m: EmailMessage): Promise<void> {
  await db.query("INSERT INTO email_outbox(to_email, subject, body) VALUES ($1,$2,$3)", [m.to, m.subject, m.body]);
}

const MAX_ATTEMPTS = 3;

export async function flushOutbox(db: Db, transport: EmailTransport, limit = 50): Promise<{ sent: number; failed: number }> {
  const rows = (await db.query<{ id: number; to_email: string; subject: string; body: string; attempts: number }>(
    "SELECT id, to_email, subject, body, attempts FROM email_outbox WHERE status='pending' ORDER BY id LIMIT $1",
    [limit],
  )).rows;
  let sent = 0, failed = 0;
  for (const r of rows) {
    try {
      await transport.send({ to: r.to_email, subject: r.subject, body: r.body });
      await db.query("UPDATE email_outbox SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1", [r.id]);
      sent++;
    } catch (e) {
      const dead = r.attempts + 1 >= MAX_ATTEMPTS;
      await db.query("UPDATE email_outbox SET status=$2, attempts=attempts+1, error=$3 WHERE id=$1", [r.id, dead ? "failed" : "pending", String(e)]);
      if (dead) failed++;
    }
  }
  return { sent, failed };
}
