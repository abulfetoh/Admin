-- First-party, cookieless, aggregate-only: no IP, no user id, no user agent stored.
CREATE TABLE pageviews (
  id          BIGSERIAL PRIMARY KEY,
  path        TEXT NOT NULL,
  locale      TEXT NOT NULL,
  ref_host    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pageviews_created_idx ON pageviews (created_at);
