-- Ride lifecycle hardening
-- Re-dispatch tracking and admin attention flags.

ALTER TABLE rides
  ADD COLUMN searching_since DATETIME NULL AFTER requested_at;

ALTER TABLE rides
  ADD COLUMN redispatch_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER searching_since;

ALTER TABLE rides
  ADD COLUMN needs_attention TINYINT(1) NOT NULL DEFAULT 0 AFTER redispatch_count;

ALTER TABLE rides
  ADD COLUMN attention_reason VARCHAR(255) NULL AFTER needs_attention;

CREATE INDEX idx_ride_attention
ON rides(needs_attention, status);