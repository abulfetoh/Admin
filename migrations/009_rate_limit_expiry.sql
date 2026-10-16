-- Buckets of different window sizes share one numeric scale, so cleanup must use an explicit expiry, not the bucket number.
ALTER TABLE rate_limits ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 day';
CREATE INDEX rate_limits_expires_idx ON rate_limits (expires_at);
