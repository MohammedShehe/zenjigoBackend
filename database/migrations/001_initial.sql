CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role ENUM('rider','driver','admin') NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NULL,
  photo_url VARCHAR(500) NULL,
  island VARCHAR(80) NULL,
  region VARCHAR(120) NULL,
  district VARCHAR(120) NULL,
  ward VARCHAR(120) NULL,
  status ENUM('pending','active','suspended','rejected') NOT NULL DEFAULT 'active',
  phone_verified_at DATETIME NULL,
  email_verified_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role,status),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otp_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target VARCHAR(190) NOT NULL,
  channel ENUM('sms','whatsapp','email') NOT NULL DEFAULT 'sms',
  purpose ENUM('login','signup','driver_registration','password_reset','admin_login') NOT NULL,
  provider_sid VARCHAR(100) NULL,
  status ENUM('pending','verified','expired','cancelled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_sent_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_target (target,purpose,status),
  KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_refresh_hash(token_hash), KEY idx_refresh_user(user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rider_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  emergency_name VARCHAR(120) NULL,
  emergency_phone VARCHAR(32) NULL,
  referral_code VARCHAR(32) NULL,
  referred_by BIGINT UNSIGNED NULL,
  rating DECIMAL(3,2) NOT NULL DEFAULT 5.00,
  total_rides INT NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id), UNIQUE KEY uq_rider_referral(referral_code),
  CONSTRAINT fk_rider_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rider_referrer FOREIGN KEY(referred_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  driver_code VARCHAR(32) NOT NULL,
  national_id VARCHAR(100) NULL,
  home_address VARCHAR(255) NULL,
  application_status ENUM('pending','under_review','approved','rejected','active') NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500) NULL,
  online TINYINT(1) NOT NULL DEFAULT 0,
  approved_at DATETIME NULL,
  rating DECIMAL(3,2) NOT NULL DEFAULT 5.00,
  total_rides INT NOT NULL DEFAULT 0,
  total_earnings DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_lat DECIMAL(10,7) NULL,
  current_lng DECIMAL(10,7) NULL,
  location_updated_at DATETIME NULL,
  PRIMARY KEY(user_id), UNIQUE KEY uq_driver_code(driver_code),
  KEY idx_driver_dispatch(online,application_status),
  CONSTRAINT fk_driver_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  type ENUM('boda','bajaji','taxi') NOT NULL,
  plate_number VARCHAR(50) NOT NULL,
  make VARCHAR(80) NULL,
  model VARCHAR(80) NULL,
  color VARCHAR(50) NULL,
  model_year SMALLINT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vehicle_plate(plate_number), KEY idx_vehicle_driver(driver_id),
  CONSTRAINT fk_vehicle_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  document_type ENUM('drivers_license','national_id','insurance','vehicle_photo','driver_photo','other') NOT NULL,
  public_id VARCHAR(255) NULL,
  url VARCHAR(700) NOT NULL,
  resource_type VARCHAR(30) NOT NULL DEFAULT 'image',
  expires_at DATE NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500) NULL,
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_docs_driver(driver_id,status), KEY idx_docs_type(driver_id,document_type),
  CONSTRAINT fk_docs_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_docs_admin FOREIGN KEY(verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(50) NOT NULL,
  address VARCHAR(255) NOT NULL,
  island VARCHAR(80) NULL, region VARCHAR(120) NULL, district VARCHAR(120) NULL, ward VARCHAR(120) NULL,
  lat DECIMAL(10,7) NULL, lng DECIMAL(10,7) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_saved_user(user_id),
  CONSTRAINT fk_saved_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('cash','momo','bank','wallet','card') NOT NULL,
  provider VARCHAR(80) NULL,
  account_number VARCHAR(80) NULL,
  card_last4 CHAR(4) NULL,
  card_brand VARCHAR(30) NULL,
  expiry_month TINYINT NULL, expiry_year SMALLINT NULL,
  card_holder VARCHAR(120) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_payment_methods_user(user_id),
  CONSTRAINT fk_payment_methods_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  user_id BIGINT UNSIGNED NOT NULL,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'TZS',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id),
  CONSTRAINT fk_wallet_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('topup','ride','refund','tip','promo','withdrawal','adjustment') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  balance_before DECIMAL(14,2) NOT NULL,
  balance_after DECIMAL(14,2) NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id BIGINT UNSIGNED NULL,
  payment_method VARCHAR(50) NULL,
  status ENUM('pending','success','failed','reversed') NOT NULL DEFAULT 'success',
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_wallet_tx_user(user_id,created_at), KEY idx_wallet_ref(reference_type,reference_id),
  CONSTRAINT fk_wallet_tx_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'TZS',
  provider VARCHAR(50) NOT NULL,
  external_reference VARCHAR(190) NULL,
  status ENUM('pending','success','failed','cancelled') NOT NULL DEFAULT 'pending',
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_payment_external(external_reference), KEY idx_payment_user(user_id,status),
  CONSTRAINT fk_payment_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ride_code VARCHAR(24) NOT NULL,
  rider_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NULL,
  vehicle_id BIGINT UNSIGNED NULL,
  ride_type ENUM('boda','bajaji','taxi') NOT NULL,
  pickup_address VARCHAR(255) NOT NULL,
  pickup_lat DECIMAL(10,7) NOT NULL, pickup_lng DECIMAL(10,7) NOT NULL,
  destination_address VARCHAR(255) NOT NULL,
  destination_lat DECIMAL(10,7) NOT NULL, destination_lng DECIMAL(10,7) NOT NULL,
  estimated_distance_km DECIMAL(8,2) NULL,
  estimated_duration_min INT NULL,
  estimated_fare DECIMAL(14,2) NOT NULL,
  final_fare DECIMAL(14,2) NULL,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tip DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_method ENUM('cash','wallet','momo','bank','card') NOT NULL DEFAULT 'cash',
  promo_code VARCHAR(40) NULL,
  status ENUM('searching','accepted','arriving','arrived','started','completed','cancelled') NOT NULL DEFAULT 'searching',
  trip_pin CHAR(4) NOT NULL,
  cancel_reason VARCHAR(500) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME NULL, arrived_at DATETIME NULL, started_at DATETIME NULL, completed_at DATETIME NULL, cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_ride_code(ride_code),
  KEY idx_ride_rider_status(rider_id,status), KEY idx_ride_driver_status(driver_id,status),
  KEY idx_ride_dispatch(status,ride_type,created_at), KEY idx_ride_created(created_at),
  CONSTRAINT fk_ride_rider FOREIGN KEY(rider_id) REFERENCES users(id),
  CONSTRAINT fk_ride_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ride_vehicle FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ride_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ride_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_ride_events(ride_id,created_at),
  CONSTRAINT fk_ride_event_ride FOREIGN KEY(ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  CONSTRAINT fk_ride_event_actor FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  ride_id BIGINT UNSIGNED NULL,
  lat DECIMAL(10,7) NOT NULL, lng DECIMAL(10,7) NOT NULL,
  heading DECIMAL(6,2) NULL, speed DECIMAL(8,2) NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_location_driver_time(driver_id,recorded_at), KEY idx_location_ride_time(ride_id,recorded_at),
  CONSTRAINT fk_location_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_location_ride FOREIGN KEY(ride_id) REFERENCES rides(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ratings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ride_id BIGINT UNSIGNED NOT NULL,
  from_user_id BIGINT UNSIGNED NOT NULL,
  to_user_id BIGINT UNSIGNED NOT NULL,
  stars TINYINT NOT NULL,
  feedback VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_rating_ride_from(ride_id,from_user_id),
  CONSTRAINT fk_rating_ride FOREIGN KEY(ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  CONSTRAINT fk_rating_from FOREIGN KEY(from_user_id) REFERENCES users(id),
  CONSTRAINT fk_rating_to FOREIGN KEY(to_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  discount_type ENUM('fixed','percent') NOT NULL,
  discount_value DECIMAL(14,2) NOT NULL,
  max_discount DECIMAL(14,2) NULL,
  usage_limit INT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  per_user_limit INT NOT NULL DEFAULT 1,
  valid_from DATETIME NOT NULL,
  valid_until DATETIME NOT NULL,
  applies_to ENUM('ride','parcel','tour','all') NOT NULL DEFAULT 'ride',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_promo_code(code), KEY idx_promo_active(valid_from,valid_until,is_active),
  CONSTRAINT fk_promo_admin FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  promo_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  ride_id BIGINT UNSIGNED NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_promo_user(promo_id,user_id),
  CONSTRAINT fk_redemption_promo FOREIGN KEY(promo_id) REFERENCES promos(id) ON DELETE CASCADE,
  CONSTRAINT fk_redemption_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_redemption_ride FOREIGN KEY(ride_id) REFERENCES rides(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type ENUM('support','ride','direct') NOT NULL,
  ride_id BIGINT UNSIGNED NULL,
  title VARCHAR(150) NULL,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_conv_ride(ride_id),
  CONSTRAINT fk_conv_ride FOREIGN KEY(ride_id) REFERENCES rides(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(conversation_id,user_id),
  CONSTRAINT fk_cm_conv FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  text TEXT NOT NULL,
  reply_to_id BIGINT UNSIGNED NULL,
  is_edited TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_msg_conv_time(conversation_id,created_at),
  CONSTRAINT fk_msg_conv FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_reply FOREIGN KEY(reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token VARCHAR(500) NOT NULL,
  platform ENUM('android','ios','web','unknown') NOT NULL DEFAULT 'unknown',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_device_token(token), KEY idx_device_user(user_id),
  CONSTRAINT fk_device_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body VARCHAR(500) NOT NULL,
  data JSON NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_notifications_user(user_id,created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parcels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parcel_code VARCHAR(24) NOT NULL,
  rider_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NULL,
  pickup_address VARCHAR(255) NOT NULL, pickup_lat DECIMAL(10,7) NULL, pickup_lng DECIMAL(10,7) NULL,
  delivery_address VARCHAR(255) NOT NULL, delivery_lat DECIMAL(10,7) NULL, delivery_lng DECIMAL(10,7) NULL,
  description VARCHAR(500) NOT NULL, weight_kg DECIMAL(8,2) NULL,
  pickup_at DATETIME NULL,
  estimated_fare DECIMAL(14,2) NULL, final_fare DECIMAL(14,2) NULL,
  status ENUM('pending','assigned','picked_up','in_transit','delivered','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_parcel_code(parcel_code), KEY idx_parcel_rider(rider_id,status), KEY idx_parcel_driver(driver_id,status),
  CONSTRAINT fk_parcel_rider FOREIGN KEY(rider_id) REFERENCES users(id),
  CONSTRAINT fk_parcel_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tour_packages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL, description TEXT NULL,
  duration_hours DECIMAL(5,2) NOT NULL DEFAULT 8,
  base_price DECIMAL(14,2) NOT NULL,
  max_tourists INT NOT NULL DEFAULT 4,
  pickup_notes VARCHAR(500) NULL,
  image_url VARCHAR(700) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_tour_active(is_active),
  CONSTRAINT fk_tour_admin FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tour_bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_code VARCHAR(24) NOT NULL,
  package_id BIGINT UNSIGNED NOT NULL, rider_id BIGINT UNSIGNED NOT NULL, driver_id BIGINT UNSIGNED NULL,
  pickup_location VARCHAR(255) NOT NULL, pickup_at DATETIME NOT NULL, tourists INT NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  status ENUM('pending','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_tour_booking_code(booking_code), KEY idx_tour_booking_rider(rider_id,status),
  CONSTRAINT fk_tb_package FOREIGN KEY(package_id) REFERENCES tour_packages(id),
  CONSTRAINT fk_tb_rider FOREIGN KEY(rider_id) REFERENCES users(id),
  CONSTRAINT fk_tb_driver FOREIGN KEY(driver_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payout_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  driver_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method ENUM('momo','bank') NOT NULL,
  account_details JSON NOT NULL,
  status ENUM('pending','approved','paid','rejected') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(500) NULL,
  processed_by BIGINT UNSIGNED NULL,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_payout_driver(driver_id,status),
  CONSTRAINT fk_payout_driver FOREIGN KEY(driver_id) REFERENCES users(id),
  CONSTRAINT fk_payout_admin FOREIGN KEY(processed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL, entity_id BIGINT UNSIGNED NULL,
  details JSON NULL, ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_admin_audit(admin_id,created_at),
  CONSTRAINT fk_audit_admin FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(setting_key),
  CONSTRAINT fk_setting_admin FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
