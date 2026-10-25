-- Admin review tooling: driver change requests + rider reports of drivers.
-- Portable: works on MySQL 5.7/8 and MariaDB (no ADD COLUMN IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS driver_change_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  driver_id BIGINT NOT NULL,
  request_type VARCHAR(32) NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  new_value TEXT,
  reason TEXT,
  status VARCHAR(32) DEFAULT 'pending',
  rejection_reason TEXT,
  meta JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (driver_id), INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE driver_change_requests ADD COLUMN reviewed_by BIGINT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_change_requests' AND COLUMN_NAME = 'reviewed_by');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE driver_change_requests ADD COLUMN reviewed_at DATETIME NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_change_requests' AND COLUMN_NAME = 'reviewed_at');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS driver_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NOT NULL,
  ride_id BIGINT UNSIGNED NULL,
  reason VARCHAR(500) NOT NULL,
  details TEXT NULL,
  status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_report_driver (driver_id, status),
  KEY idx_report_reporter (reporter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE driver_reports ADD COLUMN admin_note VARCHAR(500) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_reports' AND COLUMN_NAME = 'admin_note');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE driver_reports ADD COLUMN reviewed_by BIGINT UNSIGNED NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_reports' AND COLUMN_NAME = 'reviewed_by');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE driver_reports ADD COLUMN reviewed_at DATETIME NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'driver_reports' AND COLUMN_NAME = 'reviewed_at');
PREPARE st FROM @s;
EXECUTE st;
DEALLOCATE PREPARE st;
