ALTER TABLE companies ADD COLUMN owner_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN posted_by INT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX jobs_posted_by_idx ON jobs (posted_by);
