-- Defense-in-depth: user-owned tables are row-level secured for the unprivileged app_user role.
-- The app sets `app.user_id` per transaction (see src/lib/rls.ts). Superuser/maintenance connections bypass RLS by design.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN CREATE ROLE app_user NOLOGIN; END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; -- lost a race with a concurrent migration
END $$;
-- lets a non-superuser application login (the one running migrations) `SET ROLE app_user`
GRANT app_user TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, saved_searches TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE saved_searches FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_owner ON profiles
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);
CREATE POLICY saved_searches_owner ON saved_searches
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);

CREATE TABLE ai_usage (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_idx ON ai_usage (user_id, created_at);
