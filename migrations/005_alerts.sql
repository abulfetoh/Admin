CREATE TABLE saved_searches (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  q            TEXT NOT NULL DEFAULT '',
  location     TEXT NOT NULL DEFAULT '',
  remote       BOOLEAN NOT NULL DEFAULT false,
  token        TEXT NOT NULL UNIQUE,
  last_run_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_searches_user_idx ON saved_searches (user_id);

CREATE TABLE email_outbox (
  id          SERIAL PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts    INT NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at     TIMESTAMPTZ
);
CREATE INDEX email_outbox_status_idx ON email_outbox (status);
