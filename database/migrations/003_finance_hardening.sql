
CREATE TABLE IF NOT EXISTS driver_earning_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  ride_id BIGINT UNSIGNED NULL,
  gross_amount DECIMAL(14,2) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  commission_amount DECIMAL(14,2) NOT NULL,
  driver_amount DECIMAL(14,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_driver_earning_ride(driver_id,ride_id),
  KEY idx_driver_earning(driver_id,created_at),
  CONSTRAINT fk_driver_earning_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_earning_ride FOREIGN KEY(ride_id) REFERENCES rides(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

