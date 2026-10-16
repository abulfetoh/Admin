CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE companies (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  website     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sources (
  id          SERIAL PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  adapter     TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  terms_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id            SERIAL PRIMARY KEY,
  source_id     INT REFERENCES sources(id),
  external_id   TEXT NOT NULL,
  company_id    INT NOT NULL REFERENCES companies(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  location      TEXT,
  country       TEXT,
  city          TEXT,
  remote        BOOLEAN NOT NULL DEFAULT false,
  employment_type TEXT,
  salary_min    INT,
  salary_max    INT,
  salary_currency TEXT,
  apply_url     TEXT NOT NULL,
  posted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_through TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','removed')),
  content_hash  TEXT NOT NULL,
  dedupe_key    TEXT NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  search_tsv    TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(location,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description,'')), 'C')
  ) STORED,
  UNIQUE (source_id, external_id)
);

CREATE INDEX jobs_tsv_idx ON jobs USING GIN (search_tsv);
CREATE INDEX jobs_title_trgm_idx ON jobs USING GIN (title gin_trgm_ops);
CREATE INDEX jobs_status_posted_idx ON jobs (status, posted_at DESC);
CREATE INDEX jobs_dedupe_idx ON jobs (dedupe_key);

CREATE TABLE ingestion_runs (
  id          SERIAL PRIMARY KEY,
  source_id   INT NOT NULL REFERENCES sources(id),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  dry_run     BOOLEAN NOT NULL DEFAULT false,
  fetched     INT NOT NULL DEFAULT 0,
  inserted    INT NOT NULL DEFAULT 0,
  updated     INT NOT NULL DEFAULT 0,
  duplicates  INT NOT NULL DEFAULT 0,
  expired     INT NOT NULL DEFAULT 0,
  error       TEXT
);
