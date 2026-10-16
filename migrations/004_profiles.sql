CREATE TABLE profiles (
  user_id     INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline    TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  skills      TEXT[] NOT NULL DEFAULT '{}',
  experience  JSONB NOT NULL DEFAULT '[]',
  education   JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
