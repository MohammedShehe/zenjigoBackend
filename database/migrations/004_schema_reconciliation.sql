-- Reconcile installations created before admin OTP and finance hardening were added.
-- Safe to run on an existing ZenjiGO database.

ALTER TABLE otp_verifications
  MODIFY COLUMN purpose ENUM('login','signup','driver_registration','password_reset','admin_login') NOT NULL;

ALTER TABLE driver_payment_methods
  ADD COLUMN IF NOT EXISTS is_autopay_default TINYINT(1) NOT NULL DEFAULT 0 AFTER provider_token,
  ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_autopay_default;

CREATE INDEX IF NOT EXISTS idx_driver_payment_method_active
  ON driver_payment_methods(driver_id,active,is_autopay_default);

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS cancellation_fee DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount,
  ADD COLUMN IF NOT EXISTS cancellation_fee_applied TINYINT(1) NOT NULL DEFAULT 0 AFTER cancellation_fee;

ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS cancellation_debt DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER total_rides;
