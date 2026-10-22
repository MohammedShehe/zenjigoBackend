-- Settlement payment flow: a settlement is only "paid" after the payment provider confirms it.
-- Safe to run on an existing ZenjiGO database (MariaDB / MySQL with IF NOT EXISTS support).

ALTER TABLE driver_settlements
  ADD COLUMN IF NOT EXISTS payment_method_id BIGINT UNSIGNED NULL AFTER provider,
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255) NULL AFTER external_reference,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_settlement_external_ref ON driver_settlements(external_reference);

ALTER TABLE driver_payment_methods
  ADD COLUMN IF NOT EXISTS phone VARCHAR(32) NULL AFTER masked_account;
