CREATE TABLE IF NOT EXISTS driver_settlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  gross_earnings DECIMAL(14,2) NOT NULL DEFAULT 0,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  commission_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('pending','processing','paid','failed') NOT NULL DEFAULT 'pending',
  provider VARCHAR(60) NULL,
  external_reference VARCHAR(190) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  PRIMARY KEY(id),
  KEY idx_driver_settlement(driver_id,status,created_at),
  CONSTRAINT fk_settlement_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_financials (
  driver_id BIGINT UNSIGNED NOT NULL,
  gross_since_settlement DECIMAL(14,2) NOT NULL DEFAULT 0,
  commission_owed DECIMAL(14,2) NOT NULL DEFAULT 0,
  lifetime_gross DECIMAL(14,2) NOT NULL DEFAULT 0,
  lifetime_commission DECIMAL(14,2) NOT NULL DEFAULT 0,
  blocked TINYINT(1) NOT NULL DEFAULT 0,
  autopay_enabled TINYINT(1) NOT NULL DEFAULT 0,
  autopay_provider VARCHAR(60) NULL,
  autopay_reference VARCHAR(190) NULL,
  autopay_metadata JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(driver_id),
  CONSTRAINT fk_financial_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_payment_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(60) NOT NULL,
  method_type ENUM('momo','bank','card') NOT NULL,
  account_label VARCHAR(120) NULL,
  masked_account VARCHAR(80) NULL,
  provider_token VARCHAR(255) NULL,
  is_autopay_default TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  KEY idx_driver_payment_method(driver_id),
  KEY idx_driver_payment_method_active(driver_id,active,is_autopay_default),
  CONSTRAINT fk_driver_payment_method FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rider_cancellation_debts (
  rider_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  last_ride_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(rider_id),
  CONSTRAINT fk_cancel_debt_rider FOREIGN KEY(rider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cancel_debt_ride FOREIGN KEY(last_ride_id) REFERENCES rides(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS cancellation_fee DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount,
  ADD COLUMN IF NOT EXISTS cancellation_fee_applied TINYINT(1) NOT NULL DEFAULT 0 AFTER cancellation_fee;

ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS cancellation_debt DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER total_rides;
