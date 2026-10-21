-- User archive: soft-remove users from live tables while preserving a full restore snapshot.
CREATE TABLE IF NOT EXISTS user_archives (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('rider','driver','admin') NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(190) NULL,
  snapshot JSON NOT NULL,
  archived_by BIGINT UNSIGNED NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archive_reason VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_archive_original_user (original_user_id),
  KEY idx_archive_role (role),
  KEY idx_archive_phone (phone),
  KEY idx_archive_email (email),
  KEY idx_archive_archived_at (archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
