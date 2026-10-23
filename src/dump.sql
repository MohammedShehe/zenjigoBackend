-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: zenjigo
-- ------------------------------------------------------
-- Server version	5.5.5-10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admin_audit_logs`
--

DROP TABLE IF EXISTS `admin_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `admin_id` bigint(20) unsigned NOT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` bigint(20) unsigned DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit` (`admin_id`,`created_at`),
  CONSTRAINT `fk_audit_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_audit_logs`
--

LOCK TABLES `admin_audit_logs` WRITE;
/*!40000 ALTER TABLE `admin_audit_logs` DISABLE KEYS */;
INSERT INTO `admin_audit_logs` VALUES (1,1,'driver_status','user',14,'{\"status\":\"active\",\"reason\":null}',NULL,'2026-10-22 19:56:24'),(2,1,'mark_all_notifications_read','notification',NULL,NULL,NULL,'2026-10-22 19:57:23'),(3,1,'archive_rider','user',15,'{\"archiveId\":1,\"reason\":\"Archived by admin\"}',NULL,'2026-10-22 20:56:32'),(4,1,'permanent_delete_user','user_archive',1,'{\"deleted\":true,\"archiveId\":1,\"originalUserId\":15,\"role\":\"rider\"}',NULL,'2026-10-22 20:56:40'),(5,1,'update_fare_settings','settings',NULL,'{\"baseFare\":2500,\"perKm\":900,\"perMinute\":100,\"bookingFee\":500,\"multipliers\":{\"boda\":1,\"bajaji\":1.15,\"taxi\":1.5},\"currency\":\"TZS\"}',NULL,'2026-10-23 00:57:07'),(6,1,'update_cancel_settings','settings',NULL,'{\"nearPickupKm\":1,\"percent\":20}',NULL,'2026-10-23 01:29:09');
/*!40000 ALTER TABLE `admin_audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `app_settings`
--

DROP TABLE IF EXISTS `app_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`setting_value`)),
  `updated_by` bigint(20) unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`),
  KEY `fk_setting_admin` (`updated_by`),
  CONSTRAINT `fk_setting_admin` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app_settings`
--

LOCK TABLES `app_settings` WRITE;
/*!40000 ALTER TABLE `app_settings` DISABLE KEYS */;
INSERT INTO `app_settings` VALUES ('driver_commission','{\"thresholdTzs\": 60000, \"commissionPercent\": 20, \"driverPercent\": 80}',1,'2026-10-01 04:53:18'),('ride_fares','{\"baseFare\":2500,\"perKm\":900,\"perMinute\":100,\"bookingFee\":500,\"multipliers\":{\"boda\":1,\"bajaji\":1.15,\"taxi\":1.5},\"currency\":\"TZS\"}',1,'2026-10-23 00:57:07'),('rider_cancellation','{\"nearPickupKm\":1,\"percent\":20}',1,'2026-10-22 19:59:09');
/*!40000 ALTER TABLE `app_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversation_members`
--

DROP TABLE IF EXISTS `conversation_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversation_members` (
  `conversation_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `joined_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`conversation_id`,`user_id`),
  KEY `fk_cm_user` (`user_id`),
  CONSTRAINT `fk_cm_conv` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversation_members`
--

LOCK TABLES `conversation_members` WRITE;
/*!40000 ALTER TABLE `conversation_members` DISABLE KEYS */;
INSERT INTO `conversation_members` VALUES (1,1,'2026-10-22 20:13:43','2026-10-22 19:58:34'),(1,14,'2026-10-22 20:13:43','2026-10-22 20:18:03'),(2,1,'2026-10-22 22:29:37','2026-10-22 19:58:34'),(2,16,'2026-10-22 22:29:37','2026-10-22 17:12:36');
/*!40000 ALTER TABLE `conversation_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversations`
--

DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `type` enum('support','ride','direct') NOT NULL,
  `ride_id` bigint(20) unsigned DEFAULT NULL,
  `title` varchar(150) DEFAULT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_conv_ride` (`ride_id`),
  CONSTRAINT `fk_conv_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
INSERT INTO `conversations` VALUES (1,'support',NULL,'ZenjiGO Support',1,'2026-10-22 20:13:43','2026-10-22 14:43:47'),(2,'support',NULL,'ZenjiGO Support',1,'2026-10-22 22:29:37','2026-10-22 16:59:57');
/*!40000 ALTER TABLE `conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_tokens`
--

DROP TABLE IF EXISTS `device_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `token` varchar(500) NOT NULL,
  `platform` enum('android','ios','web','unknown') NOT NULL DEFAULT 'unknown',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_device_token` (`token`),
  KEY `idx_device_user` (`user_id`),
  CONSTRAINT `fk_device_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_tokens`
--

LOCK TABLES `device_tokens` WRITE;
/*!40000 ALTER TABLE `device_tokens` DISABLE KEYS */;
INSERT INTO `device_tokens` VALUES (1,16,'cgf8c5ZrR6qfNETLmdLRVv:APA91bFuXFkCPoBfWOM-CnWVy2AWYHT9B9l-imVPoMlYGIjN7AVwFPdoQM4neqrbmVf4etEIK4DywjjPLC-wb67HUHi__eNbU7vL0VoNJ0ovbCIGk61bJcw','android','2026-10-23 15:26:15','2026-10-23 10:14:17'),(2,14,'fKFTJjMpSEetgzJrQMlU84:APA91bG2UTJCQhqOlLkU__8YdOhi8lF1ufJ6ZHTwqYnyshpfhPD-rTmlsdZEqWg-DDN3qHrOGlWcqi5yGqRn1Zih9dOII1o-1wxDWOHVIt-oTbUqg2SkECs','android','2026-10-23 15:31:01','2026-10-23 10:16:03');
/*!40000 ALTER TABLE `device_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_commission_accounts`
--

DROP TABLE IF EXISTS `driver_commission_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_commission_accounts` (
  `driver_id` bigint(20) unsigned NOT NULL,
  `gross_cycle_earnings` decimal(14,2) NOT NULL DEFAULT 0.00,
  `commission_due` decimal(14,2) NOT NULL DEFAULT 0.00,
  `commission_paid` decimal(14,2) NOT NULL DEFAULT 0.00,
  `cycle_limit` decimal(14,2) NOT NULL DEFAULT 60000.00,
  `commission_percent` decimal(5,2) NOT NULL DEFAULT 20.00,
  `blocked` tinyint(1) NOT NULL DEFAULT 0,
  `autopay_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `autopay_payment_method_id` bigint(20) unsigned DEFAULT NULL,
  `last_settled_at` datetime DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`driver_id`),
  CONSTRAINT `fk_dca_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_commission_accounts`
--

LOCK TABLES `driver_commission_accounts` WRITE;
/*!40000 ALTER TABLE `driver_commission_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `driver_commission_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_commission_settlements`
--

DROP TABLE IF EXISTS `driver_commission_settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_commission_settlements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `gross_earnings` decimal(14,2) NOT NULL,
  `commission_amount` decimal(14,2) NOT NULL,
  `payment_transaction_id` bigint(20) unsigned DEFAULT NULL,
  `provider` varchar(50) DEFAULT NULL,
  `external_reference` varchar(190) DEFAULT NULL,
  `status` enum('pending','success','failed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `paid_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dcs_external` (`external_reference`),
  KEY `idx_dcs_driver_status` (`driver_id`,`status`),
  KEY `fk_dcs_payment` (`payment_transaction_id`),
  CONSTRAINT `fk_dcs_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dcs_payment` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_commission_settlements`
--

LOCK TABLES `driver_commission_settlements` WRITE;
/*!40000 ALTER TABLE `driver_commission_settlements` DISABLE KEYS */;
/*!40000 ALTER TABLE `driver_commission_settlements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_documents`
--

DROP TABLE IF EXISTS `driver_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_documents` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `document_type` enum('drivers_license','national_id','insurance','vehicle_photo','driver_photo','other') NOT NULL,
  `public_id` varchar(255) DEFAULT NULL,
  `url` varchar(700) NOT NULL,
  `resource_type` varchar(30) NOT NULL DEFAULT 'image',
  `expires_at` date DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` varchar(500) DEFAULT NULL,
  `verified_by` bigint(20) unsigned DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_docs_driver` (`driver_id`,`status`),
  KEY `idx_docs_type` (`driver_id`,`document_type`),
  KEY `fk_docs_admin` (`verified_by`),
  CONSTRAINT `fk_docs_admin` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_docs_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_documents`
--

LOCK TABLES `driver_documents` WRITE;
/*!40000 ALTER TABLE `driver_documents` DISABLE KEYS */;
INSERT INTO `driver_documents` VALUES (1,14,'drivers_license','zenjigo/drivers/pending/zuqvgjtvxzyqyos8ghin','https://res.cloudinary.com/hhzn7zmk/image/upload/v1792677467/zenjigo/drivers/pending/zuqvgjtvxzyqyos8ghin.png','image',NULL,'pending',NULL,NULL,NULL,'2026-10-22 19:27:54'),(2,14,'national_id','zenjigo/drivers/pending/fqdpmxx890ajygirm41m','https://res.cloudinary.com/hhzn7zmk/image/upload/v1792677468/zenjigo/drivers/pending/fqdpmxx890ajygirm41m.png','image',NULL,'pending',NULL,NULL,NULL,'2026-10-22 19:27:54'),(3,14,'insurance','zenjigo/drivers/pending/orpwippo4hvzbeugnufd','https://res.cloudinary.com/hhzn7zmk/image/upload/v1792677469/zenjigo/drivers/pending/orpwippo4hvzbeugnufd.png','image',NULL,'pending',NULL,NULL,NULL,'2026-10-22 19:27:54'),(4,14,'driver_photo','zenjigo/drivers/pending/qs5pezg4c4qqonxg4cxi','https://res.cloudinary.com/hhzn7zmk/image/upload/v1792677470/zenjigo/drivers/pending/qs5pezg4c4qqonxg4cxi.png','image',NULL,'pending',NULL,NULL,NULL,'2026-10-22 19:27:54'),(5,14,'vehicle_photo','zenjigo/drivers/pending/mxrzk9175c2hak7bcyfk','https://res.cloudinary.com/hhzn7zmk/image/upload/v1792677472/zenjigo/drivers/pending/mxrzk9175c2hak7bcyfk.png','image',NULL,'pending',NULL,NULL,NULL,'2026-10-22 19:27:54');
/*!40000 ALTER TABLE `driver_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_earning_ledger`
--

DROP TABLE IF EXISTS `driver_earning_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_earning_ledger` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `ride_id` bigint(20) unsigned DEFAULT NULL,
  `gross_amount` decimal(14,2) NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL DEFAULT 20.00,
  `commission_amount` decimal(14,2) NOT NULL,
  `driver_amount` decimal(14,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_driver_earning_ride` (`driver_id`,`ride_id`),
  KEY `idx_driver_earning` (`driver_id`,`created_at`),
  KEY `fk_driver_earning_ride` (`ride_id`),
  CONSTRAINT `fk_driver_earning_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_driver_earning_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_earning_ledger`
--

LOCK TABLES `driver_earning_ledger` WRITE;
/*!40000 ALTER TABLE `driver_earning_ledger` DISABLE KEYS */;
/*!40000 ALTER TABLE `driver_earning_ledger` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_financials`
--

DROP TABLE IF EXISTS `driver_financials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_financials` (
  `driver_id` bigint(20) unsigned NOT NULL,
  `gross_since_settlement` decimal(14,2) NOT NULL DEFAULT 0.00,
  `commission_owed` decimal(14,2) NOT NULL DEFAULT 0.00,
  `lifetime_gross` decimal(14,2) NOT NULL DEFAULT 0.00,
  `lifetime_commission` decimal(14,2) NOT NULL DEFAULT 0.00,
  `blocked` tinyint(1) NOT NULL DEFAULT 0,
  `autopay_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `autopay_provider` varchar(60) DEFAULT NULL,
  `autopay_reference` varchar(190) DEFAULT NULL,
  `autopay_metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`autopay_metadata`)),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`driver_id`),
  CONSTRAINT `fk_financial_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_financials`
--

LOCK TABLES `driver_financials` WRITE;
/*!40000 ALTER TABLE `driver_financials` DISABLE KEYS */;
INSERT INTO `driver_financials` VALUES (14,0.00,0.00,0.00,0.00,0,0,NULL,NULL,NULL,'2026-10-22 19:51:27');
/*!40000 ALTER TABLE `driver_financials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_locations`
--

DROP TABLE IF EXISTS `driver_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_locations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `ride_id` bigint(20) unsigned DEFAULT NULL,
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `heading` decimal(6,2) DEFAULT NULL,
  `speed` decimal(8,2) DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_location_driver_time` (`driver_id`,`recorded_at`),
  KEY `idx_location_ride_time` (`ride_id`,`recorded_at`),
  CONSTRAINT `fk_location_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_location_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_locations`
--

LOCK TABLES `driver_locations` WRITE;
/*!40000 ALTER TABLE `driver_locations` DISABLE KEYS */;
INSERT INTO `driver_locations` VALUES (1,14,NULL,31.2550366,75.6962959,318.96,0.67,'2026-10-22 19:56:50'),(2,14,NULL,31.2549878,75.6962310,200.26,0.76,'2026-10-22 19:56:57'),(3,14,NULL,31.2550292,75.6963228,89.72,1.29,'2026-10-22 19:57:09'),(4,14,NULL,31.2551157,75.6962429,284.75,0.39,'2026-10-22 20:15:10'),(5,14,NULL,31.2544248,75.6966645,157.84,9.17,'2026-10-23 01:50:21'),(6,14,NULL,31.2548754,75.6963291,189.00,0.19,'2026-10-23 15:00:15'),(7,14,NULL,31.2547284,75.6963790,0.00,0.04,'2026-10-23 15:00:57'),(8,14,NULL,31.2547076,75.6963853,0.00,0.07,'2026-10-23 15:01:03'),(9,14,NULL,31.2548160,75.6961112,303.00,0.41,'2026-10-23 15:46:14'),(10,14,NULL,31.2549109,75.6961579,89.26,1.24,'2026-10-23 15:46:17'),(11,14,NULL,31.2550461,75.6962584,89.93,0.64,'2026-10-23 15:46:44'),(12,14,NULL,31.2550487,75.6962540,89.96,0.64,'2026-10-23 15:46:53'),(13,14,NULL,31.2551014,75.6962733,90.00,0.72,'2026-10-23 15:47:32'),(14,14,NULL,31.2551135,75.6962617,338.55,0.38,'2026-10-23 15:47:42'),(15,14,NULL,31.2550082,75.6961125,288.32,0.38,'2026-10-23 15:48:02'),(16,14,NULL,31.2549373,75.6960989,224.80,0.80,'2026-10-23 15:48:05'),(17,14,NULL,31.2545265,75.6965876,59.81,2.42,'2026-10-23 15:48:17'),(18,14,NULL,31.2544965,75.6966497,72.26,1.27,'2026-10-23 15:48:32'),(19,14,NULL,31.2544365,75.6965613,230.51,0.64,'2026-10-23 15:48:42'),(20,14,NULL,31.2549631,75.6961926,61.68,0.21,'2026-10-23 15:49:09');
/*!40000 ALTER TABLE `driver_locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_payment_methods`
--

DROP TABLE IF EXISTS `driver_payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_payment_methods` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `provider` varchar(50) NOT NULL,
  `token` varchar(500) NOT NULL,
  `masked_account` varchar(100) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `is_autopay_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_dpm_driver` (`driver_id`,`active`),
  KEY `idx_driver_payment_method_active` (`driver_id`,`active`,`is_autopay_default`),
  CONSTRAINT `fk_dpm_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_payment_methods`
--

LOCK TABLES `driver_payment_methods` WRITE;
/*!40000 ALTER TABLE `driver_payment_methods` DISABLE KEYS */;
/*!40000 ALTER TABLE `driver_payment_methods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_profiles`
--

DROP TABLE IF EXISTS `driver_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_profiles` (
  `user_id` bigint(20) unsigned NOT NULL,
  `driver_code` varchar(32) NOT NULL,
  `national_id` varchar(100) DEFAULT NULL,
  `home_address` varchar(255) DEFAULT NULL,
  `application_status` enum('pending','under_review','approved','rejected','active') NOT NULL DEFAULT 'pending',
  `rejection_reason` varchar(500) DEFAULT NULL,
  `online` tinyint(1) NOT NULL DEFAULT 0,
  `approved_at` datetime DEFAULT NULL,
  `rating` decimal(3,2) NOT NULL DEFAULT 5.00,
  `total_rides` int(11) NOT NULL DEFAULT 0,
  `total_earnings` decimal(14,2) NOT NULL DEFAULT 0.00,
  `current_lat` decimal(10,7) DEFAULT NULL,
  `current_lng` decimal(10,7) DEFAULT NULL,
  `location_updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_driver_code` (`driver_code`),
  KEY `idx_driver_dispatch` (`online`,`application_status`),
  CONSTRAINT `fk_driver_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_profiles`
--

LOCK TABLES `driver_profiles` WRITE;
/*!40000 ALTER TABLE `driver_profiles` DISABLE KEYS */;
INSERT INTO `driver_profiles` VALUES (14,'ZG-DRV-000014','TAE009090','Fuoni Kisimani','active',NULL,0,'2026-10-22 14:26:24',5.00,0,0.00,31.2549631,75.6961926,'2026-10-23 10:19:09');
/*!40000 ALTER TABLE `driver_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `driver_settlements`
--

DROP TABLE IF EXISTS `driver_settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_settlements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `gross_earnings` decimal(14,2) NOT NULL DEFAULT 0.00,
  `commission_rate` decimal(5,2) NOT NULL DEFAULT 20.00,
  `commission_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `paid_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','processing','paid','failed') NOT NULL DEFAULT 'pending',
  `provider` varchar(60) DEFAULT NULL,
  `payment_method_id` bigint(20) unsigned DEFAULT NULL,
  `external_reference` varchar(190) DEFAULT NULL,
  `failure_reason` varchar(255) DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `paid_at` datetime DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_driver_settlement` (`driver_id`,`status`,`created_at`),
  KEY `idx_settlement_external_ref` (`external_reference`),
  CONSTRAINT `fk_settlement_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `driver_settlements`
--

LOCK TABLES `driver_settlements` WRITE;
/*!40000 ALTER TABLE `driver_settlements` DISABLE KEYS */;
/*!40000 ALTER TABLE `driver_settlements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint(20) unsigned NOT NULL,
  `sender_id` bigint(20) unsigned NOT NULL,
  `text` text NOT NULL,
  `reply_to_id` bigint(20) unsigned DEFAULT NULL,
  `is_edited` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_msg_conv_time` (`conversation_id`,`created_at`),
  KEY `fk_msg_sender` (`sender_id`),
  KEY `fk_msg_reply` (`reply_to_id`),
  CONSTRAINT `fk_msg_conv` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_reply` FOREIGN KEY (`reply_to_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (1,1,14,'yow',NULL,0,0,'2026-10-22 20:13:47','2026-10-22 20:13:47'),(2,2,16,'yow',NULL,0,0,'2026-10-22 22:29:47','2026-10-22 22:29:47'),(3,2,16,'show',NULL,0,0,'2026-10-22 22:29:57','2026-10-22 22:29:57');
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(150) NOT NULL,
  `body` varchar(500) NOT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data`)),
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,14,'{\"type\":\"driver_status\",\"status\":\"active\",\"reason\"','Driver application update','Your application status is now: active','{}','2026-10-22 14:27:23','2026-10-22 19:56:24'),(2,16,'ride_accepted','Driver on the way','Your ZenjiGO driver accepted the ride and is heading to you.','{\"type\":\"ride_accepted\",\"rideId\":\"2\",\"status\":\"accepted\"}',NULL,'2026-10-23 15:47:38');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `otp_verifications`
--

DROP TABLE IF EXISTS `otp_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `otp_verifications` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `target` varchar(190) NOT NULL,
  `channel` enum('sms','whatsapp','email') NOT NULL DEFAULT 'email',
  `purpose` enum('login','signup','driver_registration','password_reset','admin_login') NOT NULL,
  `provider_sid` varchar(100) DEFAULT NULL,
  `code_hash` char(64) DEFAULT NULL,
  `status` enum('pending','verified','expired','cancelled') NOT NULL DEFAULT 'pending',
  `attempts` int(11) NOT NULL DEFAULT 0,
  `last_sent_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_otp_target` (`target`,`purpose`,`status`),
  KEY `idx_otp_expires` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_verifications`
--

LOCK TABLES `otp_verifications` WRITE;
/*!40000 ALTER TABLE `otp_verifications` DISABLE KEYS */;
INSERT INTO `otp_verifications` VALUES (1,'molittle1011@gmail.com','email','driver_registration','<d6155860-07f1-1ccc-97ca-5a0acc55bd7f@zenjigo.online>','2906201e7f5486b4fc87186e6f50aa2466f987e6c7da558ffc7991b2bb0438aa','cancelled',0,'2026-10-22 12:02:59','2026-10-22 12:12:59',NULL,'2026-10-22 17:32:59'),(2,'molittle1011@gmail.com','email','driver_registration','<628c6d95-ab3a-8452-7322-3249b6137b83@zenjigo.online>','8eea0e3637990b8a7fb0c2ad3eccb2214bc0e6f4f86c9c3b58ca631019f9e021','cancelled',0,'2026-10-22 13:27:49','2026-10-22 13:37:49',NULL,'2026-10-22 18:57:49'),(3,'molittle1011@gmail.com','email','driver_registration','<9fbba2f6-800c-b2e2-3636-df7422078a72@zenjigo.online>','7ab00dc9062585ed104e7507670bfc4cd3fd59e2e17f881b35d3cfcbebcde82e','verified',0,'2026-10-22 13:55:32','2026-10-22 14:05:32','2026-10-22 13:57:44','2026-10-22 19:25:32'),(4,'molittle1011@gmail.com','email','driver_registration','<2d7f8d6d-1e61-2bf4-f080-ba26a0d7b5cd@zenjigo.online>','9dc20dba8f7bba2630e7e378cbc319b3de3bf0c6f4b0df2517fd0ecd91a16639','cancelled',0,'2026-10-22 14:00:17','2026-10-22 14:10:17',NULL,'2026-10-22 19:30:17'),(5,'molittle1011@gmail.com','email','driver_registration','<66e04dd1-ba7d-966c-3814-883cf92ac04e@zenjigo.online>','1a312454ee2ab4277cae3e324d64bc6f5184d51f5fb04d809b9d99fe56fffc35','verified',0,'2026-10-22 14:01:25','2026-10-22 14:11:25','2026-10-22 14:02:14','2026-10-22 19:31:25'),(6,'molittle1011@gmail.com','email','login','<f8308371-c745-c845-c5b9-d2a2562deaba@zenjigo.online>','b6dd4d94e75fd7512ec6168f3920816530b7125521bc2b293620b92f10b2133c','cancelled',0,'2026-10-22 14:04:15','2026-10-22 14:14:15',NULL,'2026-10-22 19:34:15'),(7,'molittle1011@gmail.com','email','login','<94bae6ee-a13f-5bef-e996-c1a8503cf833@zenjigo.online>','356bd8e467e3d0f1cf497c93287aa430f5c95264491d79ff74c99f9d59c3a292','cancelled',0,'2026-10-22 14:05:24','2026-10-22 14:15:24',NULL,'2026-10-22 19:35:24'),(8,'molittle1011@gmail.com','email','login','<3fc7bfc5-800f-30b3-e5f3-220d7899b650@zenjigo.online>','19d18112574db8bf0fc408eef1ae02a0a0851a1d9bd288afd2658540668e98fd','cancelled',0,'2026-10-22 14:07:33','2026-10-22 14:17:33',NULL,'2026-10-22 19:37:33'),(9,'molittle1011@gmail.com','email','login','<71c5eb51-610a-f0c4-519d-e7cbf9e4d6d2@zenjigo.online>','5920115cc1adc040d26ddc3b0a111ba5bf42b9cde2bdfce24527007f22d7e7f9','verified',0,'2026-10-22 14:20:56','2026-10-22 14:30:56','2026-10-22 14:21:25','2026-10-22 19:50:56'),(10,'admin@zenjigo.online','email','admin_login','<bf76fcad-7aab-823f-3061-561dc1e7b524@zenjigo.online>','e8216ebc2640c192e5daf91346aacb6004d197fcaaa4b71f9caa45f61376f70d','verified',0,'2026-10-22 14:25:46','2026-10-22 14:35:46','2026-10-22 14:26:14','2026-10-22 19:55:46'),(11,'molittle1011@gmail.com','email','login','<d2761fee-04df-37a9-fcd6-fe285ec902a9@zenjigo.online>','a80eb0409256968b0f2cdbd9b6998fbb7b7f0a6ff5d818c2d6a0e21924f55b99','cancelled',1,'2026-10-22 14:59:25','2026-10-22 15:09:25',NULL,'2026-10-22 20:29:25'),(12,'molittle1011@gmail.com','email','login','<da28497b-cc52-2660-eb3d-08473cc9088f@zenjigo.online>','047a24e8831b6421c6216986b3e7a6619b240fd9dac49a064bbda63fad8dd538','verified',0,'2026-10-22 15:12:41','2026-10-22 15:22:41','2026-10-22 15:13:29','2026-10-22 20:42:41'),(13,'molittle1011@gmail.com','email','login','<c45485f3-4bf8-ca8b-f531-5d417d733382@zenjigo.online>','72c5a66f18e531767129c2244a2319c42422b052efbef3646dd65c9adb2886a1','verified',0,'2026-10-22 15:14:59','2026-10-22 15:24:59','2026-10-22 15:15:37','2026-10-22 20:44:59'),(14,'molittle1011@gmail.com','email','login','<b041b4c1-ca20-5635-465d-cd79fb2b6946@zenjigo.online>','100aa85a4e56c198ae8aaf21749f1278a38384d1215d40ec18a891fd5a1a5575','verified',0,'2026-10-22 16:46:57','2026-10-22 16:56:57','2026-10-22 16:47:18','2026-10-22 22:16:57'),(15,'molittle1011@gmail.com','email','login','<b849cf3f-76c0-8e5e-3110-d23ed937778c@zenjigo.online>','44fb59769bb039f4e648b6eed100d94fda78f6efe33732462ebcd37ea8a425a2','verified',1,'2026-10-22 16:49:15','2026-10-22 16:59:15','2026-10-22 16:50:25','2026-10-22 22:19:15'),(16,'molittle1011@gmail.com','email','login','<c998bd48-84e9-d36f-dac6-5a2119340ffa@zenjigo.online>','7f6356fa36c914fcddda935b5b649bc22a44303828ed33504e8c3c163a4ae86f','cancelled',0,'2026-10-22 16:54:38','2026-10-22 17:04:38',NULL,'2026-10-22 22:24:38'),(17,'molittle1011@gmail.com','email','login','<4ec4cc39-493f-9ed7-bc59-2da63f2ef294@zenjigo.online>','e78454c27345543ed3148b650e1c1744a20bba0cdbeb743fc7763a7da2323da2','verified',0,'2026-10-22 16:55:52','2026-10-22 17:05:52','2026-10-22 16:56:32','2026-10-22 22:25:52'),(18,'molittle1011@gmail.com','email','login','<c31e6ec8-6c44-6603-2292-78ec772dae2b@zenjigo.online>','6b3964edcaf63827d2e59feb36f9ef636d04c9f8d8bceee3f89d1754332add1e','verified',0,'2026-10-23 09:12:02','2026-10-23 09:22:02','2026-10-23 09:12:25','2026-10-23 14:42:02'),(19,'molittle1011@gmail.com','email','login','<493446ec-71c3-38f5-a523-b704b0871574@zenjigo.online>','69d748aae4457e2c48e750724bf88591ca68796e7e099939c7028542babf6a0c','verified',0,'2026-10-23 10:22:26','2026-10-23 10:32:26','2026-10-23 10:22:51','2026-10-23 15:52:26');
/*!40000 ALTER TABLE `otp_verifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parcels`
--

DROP TABLE IF EXISTS `parcels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parcels` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `parcel_code` varchar(24) NOT NULL,
  `rider_id` bigint(20) unsigned NOT NULL,
  `driver_id` bigint(20) unsigned DEFAULT NULL,
  `pickup_address` varchar(255) NOT NULL,
  `pickup_lat` decimal(10,7) DEFAULT NULL,
  `pickup_lng` decimal(10,7) DEFAULT NULL,
  `delivery_address` varchar(255) NOT NULL,
  `delivery_lat` decimal(10,7) DEFAULT NULL,
  `delivery_lng` decimal(10,7) DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `weight_kg` decimal(8,2) DEFAULT NULL,
  `pickup_at` datetime DEFAULT NULL,
  `estimated_fare` decimal(14,2) DEFAULT NULL,
  `final_fare` decimal(14,2) DEFAULT NULL,
  `status` enum('pending','assigned','picked_up','in_transit','delivered','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_parcel_code` (`parcel_code`),
  KEY `idx_parcel_rider` (`rider_id`,`status`),
  KEY `idx_parcel_driver` (`driver_id`,`status`),
  CONSTRAINT `fk_parcel_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_parcel_rider` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parcels`
--

LOCK TABLES `parcels` WRITE;
/*!40000 ALTER TABLE `parcels` DISABLE KEYS */;
/*!40000 ALTER TABLE `parcels` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_methods`
--

DROP TABLE IF EXISTS `payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_methods` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `type` enum('cash','momo','bank','wallet','card') NOT NULL,
  `provider` varchar(80) DEFAULT NULL,
  `account_number` varchar(80) DEFAULT NULL,
  `card_last4` char(4) DEFAULT NULL,
  `card_brand` varchar(30) DEFAULT NULL,
  `expiry_month` tinyint(4) DEFAULT NULL,
  `expiry_year` smallint(6) DEFAULT NULL,
  `card_holder` varchar(120) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_payment_methods_user` (`user_id`),
  CONSTRAINT `fk_payment_methods_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_methods`
--

LOCK TABLES `payment_methods` WRITE;
/*!40000 ALTER TABLE `payment_methods` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_methods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_transactions`
--

DROP TABLE IF EXISTS `payment_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'TZS',
  `provider` varchar(50) NOT NULL,
  `external_reference` varchar(190) DEFAULT NULL,
  `status` enum('pending','success','failed','cancelled') NOT NULL DEFAULT 'pending',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_external` (`external_reference`),
  KEY `idx_payment_user` (`user_id`,`status`),
  CONSTRAINT `fk_payment_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_transactions`
--

LOCK TABLES `payment_transactions` WRITE;
/*!40000 ALTER TABLE `payment_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payout_requests`
--

DROP TABLE IF EXISTS `payout_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payout_requests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `method` enum('momo','bank') NOT NULL,
  `account_details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`account_details`)),
  `status` enum('pending','approved','paid','rejected') NOT NULL DEFAULT 'pending',
  `admin_note` varchar(500) DEFAULT NULL,
  `processed_by` bigint(20) unsigned DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_payout_driver` (`driver_id`,`status`),
  KEY `fk_payout_admin` (`processed_by`),
  CONSTRAINT `fk_payout_admin` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payout_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payout_requests`
--

LOCK TABLES `payout_requests` WRITE;
/*!40000 ALTER TABLE `payout_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `payout_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promo_redemptions`
--

DROP TABLE IF EXISTS `promo_redemptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promo_redemptions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `promo_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `ride_id` bigint(20) unsigned DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_promo_user` (`promo_id`,`user_id`),
  KEY `fk_redemption_user` (`user_id`),
  KEY `fk_redemption_ride` (`ride_id`),
  CONSTRAINT `fk_redemption_promo` FOREIGN KEY (`promo_id`) REFERENCES `promos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_redemption_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_redemption_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promo_redemptions`
--

LOCK TABLES `promo_redemptions` WRITE;
/*!40000 ALTER TABLE `promo_redemptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `promo_redemptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promos`
--

DROP TABLE IF EXISTS `promos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(40) NOT NULL,
  `title` varchar(120) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `discount_type` enum('fixed','percent') NOT NULL,
  `discount_value` decimal(14,2) NOT NULL,
  `max_discount` decimal(14,2) DEFAULT NULL,
  `usage_limit` int(11) DEFAULT NULL,
  `usage_count` int(11) NOT NULL DEFAULT 0,
  `per_user_limit` int(11) NOT NULL DEFAULT 1,
  `valid_from` datetime NOT NULL,
  `valid_until` datetime NOT NULL,
  `applies_to` enum('ride','parcel','tour','all') NOT NULL DEFAULT 'ride',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promo_code` (`code`),
  KEY `idx_promo_active` (`valid_from`,`valid_until`,`is_active`),
  KEY `fk_promo_admin` (`created_by`),
  CONSTRAINT `fk_promo_admin` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promos`
--

LOCK TABLES `promos` WRITE;
/*!40000 ALTER TABLE `promos` DISABLE KEYS */;
/*!40000 ALTER TABLE `promos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ratings`
--

DROP TABLE IF EXISTS `ratings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ratings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `ride_id` bigint(20) unsigned NOT NULL,
  `from_user_id` bigint(20) unsigned NOT NULL,
  `to_user_id` bigint(20) unsigned NOT NULL,
  `stars` tinyint(4) NOT NULL,
  `feedback` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rating_ride_from` (`ride_id`,`from_user_id`),
  KEY `fk_rating_from` (`from_user_id`),
  KEY `fk_rating_to` (`to_user_id`),
  CONSTRAINT `fk_rating_from` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_rating_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rating_to` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ratings`
--

LOCK TABLES `ratings` WRITE;
/*!40000 ALTER TABLE `ratings` DISABLE KEYS */;
/*!40000 ALTER TABLE `ratings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refresh_tokens`
--

DROP TABLE IF EXISTS `refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refresh_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_hash` (`token_hash`),
  KEY `idx_refresh_user` (`user_id`),
  CONSTRAINT `fk_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refresh_tokens`
--

LOCK TABLES `refresh_tokens` WRITE;
/*!40000 ALTER TABLE `refresh_tokens` DISABLE KEYS */;
INSERT INTO `refresh_tokens` VALUES (1,14,'dda2260126a73f41c385f846520fe6a65308c40a6aa5dd980e8f0976f6a6baf2','2026-11-21 14:21:25',NULL,'2026-10-22 19:51:25'),(2,1,'9a8ad90061f38d31e42d4790dc2fa2ba38e9fecd489dde6e8c37ad5b79c8bf84','2026-11-21 14:26:14',NULL,'2026-10-22 19:56:14'),(5,16,'b2ca78ecf3386dfe129500fffc7c9b1aa092b11552c964decd7c4ef71232efe6','2026-11-21 16:47:19',NULL,'2026-10-22 22:17:19'),(6,16,'64fb273308bc3db69207460ec8d96df6951c290f95044852081c7ea7bb2cde83','2026-11-21 16:50:25',NULL,'2026-10-22 22:20:25'),(7,16,'be7028fa7028e355432f2b4e19f0ec9a0f6c1273e990f7d5ec353992d68b98b3','2026-11-21 16:56:32',NULL,'2026-10-22 22:26:32'),(8,16,'470b7a484f20a6b1197727f6d353f4bd74c5897a008202b8f7ef3943666a2798','2026-11-22 09:12:25',NULL,'2026-10-23 14:42:25'),(9,16,'80d104b2ef0a6c67ff1ba5cd5658536784a220830dca0dc6b8f305fd1c9140af','2026-11-22 10:22:51',NULL,'2026-10-23 15:52:51');
/*!40000 ALTER TABLE `refresh_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ride_events`
--

DROP TABLE IF EXISTS `ride_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ride_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `ride_id` bigint(20) unsigned NOT NULL,
  `actor_id` bigint(20) unsigned DEFAULT NULL,
  `event_type` varchar(50) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ride_events` (`ride_id`,`created_at`),
  KEY `fk_ride_event_actor` (`actor_id`),
  CONSTRAINT `fk_ride_event_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ride_event_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ride_events`
--

LOCK TABLES `ride_events` WRITE;
/*!40000 ALTER TABLE `ride_events` DISABLE KEYS */;
INSERT INTO `ride_events` VALUES (1,1,16,'requested','{\"quote\":{\"distanceKm\":5682.77,\"durationMin\":12628,\"estimatedFare\":6380293,\"currency\":\"TZS\",\"distanceSource\":\"haversine\",\"fareBreakdown\":{\"baseFare\":2500,\"perKm\":900,\"perMinute\":100,\"bookingFee\":500,\"multiplier\":1}},\"priorDebtApplied\":0,\"silent\":true}','2026-10-23 15:45:47'),(2,1,16,'cancelled','{\"fee\":0,\"nearPickup\":false,\"distanceKm\":null,\"percent\":20,\"nearPickupKm\":1,\"driverCredited\":false}','2026-10-23 15:47:00'),(3,2,16,'requested','{\"quote\":{\"distanceKm\":5682.77,\"durationMin\":12628,\"estimatedFare\":9570440,\"currency\":\"TZS\",\"distanceSource\":\"haversine\",\"fareBreakdown\":{\"baseFare\":2500,\"perKm\":900,\"perMinute\":100,\"bookingFee\":500,\"multiplier\":1.5}},\"priorDebtApplied\":0,\"silent\":true}','2026-10-23 15:47:23'),(5,2,16,'cancelled','{\"fee\":0,\"nearPickup\":false,\"distanceKm\":null,\"percent\":20,\"nearPickupKm\":1,\"driverCredited\":false}','2026-10-23 15:49:22');
/*!40000 ALTER TABLE `ride_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rider_cancellation_debts`
--

DROP TABLE IF EXISTS `rider_cancellation_debts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rider_cancellation_debts` (
  `rider_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `last_ride_id` bigint(20) unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`rider_id`),
  KEY `fk_cancel_debt_ride` (`last_ride_id`),
  CONSTRAINT `fk_cancel_debt_ride` FOREIGN KEY (`last_ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cancel_debt_rider` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rider_cancellation_debts`
--

LOCK TABLES `rider_cancellation_debts` WRITE;
/*!40000 ALTER TABLE `rider_cancellation_debts` DISABLE KEYS */;
/*!40000 ALTER TABLE `rider_cancellation_debts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rider_charges`
--

DROP TABLE IF EXISTS `rider_charges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rider_charges` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `rider_id` bigint(20) unsigned NOT NULL,
  `ride_id` bigint(20) unsigned DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `reason` enum('near_pickup_cancellation','other') NOT NULL,
  `percent` decimal(5,2) DEFAULT NULL,
  `status` enum('pending','applied','paid','waived') NOT NULL DEFAULT 'pending',
  `applied_ride_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `applied_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_rc_rider_status` (`rider_id`,`status`),
  KEY `fk_rc_ride` (`ride_id`),
  KEY `fk_rc_applied` (`applied_ride_id`),
  CONSTRAINT `fk_rc_applied` FOREIGN KEY (`applied_ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rc_ride` FOREIGN KEY (`ride_id`) REFERENCES `rides` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rc_rider` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rider_charges`
--

LOCK TABLES `rider_charges` WRITE;
/*!40000 ALTER TABLE `rider_charges` DISABLE KEYS */;
/*!40000 ALTER TABLE `rider_charges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rider_profiles`
--

DROP TABLE IF EXISTS `rider_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rider_profiles` (
  `user_id` bigint(20) unsigned NOT NULL,
  `emergency_name` varchar(120) DEFAULT NULL,
  `emergency_phone` varchar(32) DEFAULT NULL,
  `referral_code` varchar(32) DEFAULT NULL,
  `referred_by` bigint(20) unsigned DEFAULT NULL,
  `rating` decimal(3,2) NOT NULL DEFAULT 5.00,
  `total_rides` int(11) NOT NULL DEFAULT 0,
  `cancellation_debt` decimal(14,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_rider_referral` (`referral_code`),
  KEY `fk_rider_referrer` (`referred_by`),
  CONSTRAINT `fk_rider_referrer` FOREIGN KEY (`referred_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rider_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rider_profiles`
--

LOCK TABLES `rider_profiles` WRITE;
/*!40000 ALTER TABLE `rider_profiles` DISABLE KEYS */;
INSERT INTO `rider_profiles` VALUES (16,NULL,NULL,'ZG000016',NULL,5.00,0,0.00);
/*!40000 ALTER TABLE `rider_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rides`
--

DROP TABLE IF EXISTS `rides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rides` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `ride_code` varchar(24) NOT NULL,
  `rider_id` bigint(20) unsigned NOT NULL,
  `driver_id` bigint(20) unsigned DEFAULT NULL,
  `vehicle_id` bigint(20) unsigned DEFAULT NULL,
  `ride_type` enum('boda','bajaji','taxi') NOT NULL,
  `pickup_address` varchar(255) NOT NULL,
  `pickup_lat` decimal(10,7) NOT NULL,
  `pickup_lng` decimal(10,7) NOT NULL,
  `destination_address` varchar(255) NOT NULL,
  `destination_lat` decimal(10,7) NOT NULL,
  `destination_lng` decimal(10,7) NOT NULL,
  `estimated_distance_km` decimal(8,2) DEFAULT NULL,
  `estimated_duration_min` int(11) DEFAULT NULL,
  `estimated_fare` decimal(14,2) NOT NULL,
  `final_fare` decimal(14,2) DEFAULT NULL,
  `discount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `cancellation_fee` decimal(14,2) NOT NULL DEFAULT 0.00,
  `cancellation_fee_applied` tinyint(1) NOT NULL DEFAULT 0,
  `tip` decimal(14,2) NOT NULL DEFAULT 0.00,
  `total_paid` decimal(14,2) NOT NULL DEFAULT 0.00,
  `payment_method` enum('cash','wallet','momo','bank','card') NOT NULL DEFAULT 'cash',
  `promo_code` varchar(40) DEFAULT NULL,
  `status` enum('searching','accepted','arriving','arrived','started','completed','cancelled') NOT NULL DEFAULT 'searching',
  `trip_pin` char(4) NOT NULL,
  `cancel_reason` varchar(500) DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT current_timestamp(),
  `accepted_at` datetime DEFAULT NULL,
  `arrived_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ride_code` (`ride_code`),
  KEY `idx_ride_rider_status` (`rider_id`,`status`),
  KEY `idx_ride_driver_status` (`driver_id`,`status`),
  KEY `idx_ride_dispatch` (`status`,`ride_type`,`created_at`),
  KEY `idx_ride_created` (`created_at`),
  KEY `fk_ride_vehicle` (`vehicle_id`),
  CONSTRAINT `fk_ride_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ride_rider` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_ride_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rides`
--

LOCK TABLES `rides` WRITE;
/*!40000 ALTER TABLE `rides` DISABLE KEYS */;
INSERT INTO `rides` VALUES (1,'ZGVKTDZEW575',16,NULL,NULL,'boda','7M4W+3H9, Chaheru, Punjab, India',31.2551124,75.6962948,'R73G+J79 KIBONDE MZUNGU, Zanzibar, Tanzania',-6.1959504,39.2757404,5682.77,12628,6380293.00,NULL,0.00,0.00,0,0.00,0.00,'cash',NULL,'cancelled','2968','Driver taking too long','2026-10-23 15:45:47',NULL,NULL,NULL,NULL,'2026-10-23 10:17:00','2026-10-23 15:45:47','2026-10-23 15:47:00'),(2,'ZGVKTG1IP690',16,NULL,NULL,'taxi','7M4W+3H9, Chaheru, Punjab, India',31.2551124,75.6962948,'R73G+J79 KIBONDE MZUNGU, Zanzibar, Tanzania',-6.1959504,39.2757404,5682.77,12628,9570440.00,NULL,0.00,0.00,0,0.00,0.00,'cash',NULL,'cancelled','8900','Driver taking too long','2026-10-23 15:47:23',NULL,NULL,NULL,NULL,'2026-10-23 10:19:22','2026-10-23 15:47:23','2026-10-23 15:49:22');
/*!40000 ALTER TABLE `rides` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `saved_locations`
--

DROP TABLE IF EXISTS `saved_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saved_locations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `label` varchar(50) NOT NULL,
  `address` varchar(255) NOT NULL,
  `island` varchar(80) DEFAULT NULL,
  `region` varchar(120) DEFAULT NULL,
  `district` varchar(120) DEFAULT NULL,
  `ward` varchar(120) DEFAULT NULL,
  `lat` decimal(10,7) DEFAULT NULL,
  `lng` decimal(10,7) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_saved_user` (`user_id`),
  CONSTRAINT `fk_saved_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `saved_locations`
--

LOCK TABLES `saved_locations` WRITE;
/*!40000 ALTER TABLE `saved_locations` DISABLE KEYS */;
/*!40000 ALTER TABLE `saved_locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `version` varchar(100) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('001_initial.sql','2026-10-01 04:35:33'),('002_business_rules.sql','2026-10-01 04:53:05'),('003_finance_hardening.sql','2026-10-01 04:53:05'),('004_schema_reconciliation.sql','2026-10-01 04:53:05'),('005_nextsms_otp.sql','2026-10-19 22:37:40'),('006_email_otp_default.sql','2026-10-21 15:29:12'),('007_role_scoped_user_identity.sql','2026-10-21 15:55:01'),('008_user_archive.sql','2026-10-21 17:22:03'),('009_settlement_payment_flow.sql','2026-10-22 15:42:53');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tour_bookings`
--

DROP TABLE IF EXISTS `tour_bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tour_bookings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `booking_code` varchar(24) NOT NULL,
  `package_id` bigint(20) unsigned NOT NULL,
  `rider_id` bigint(20) unsigned NOT NULL,
  `driver_id` bigint(20) unsigned DEFAULT NULL,
  `pickup_location` varchar(255) NOT NULL,
  `pickup_at` datetime NOT NULL,
  `tourists` int(11) NOT NULL,
  `total_amount` decimal(14,2) NOT NULL,
  `status` enum('pending','assigned','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tour_booking_code` (`booking_code`),
  KEY `idx_tour_booking_rider` (`rider_id`,`status`),
  KEY `fk_tb_package` (`package_id`),
  KEY `fk_tb_driver` (`driver_id`),
  CONSTRAINT `fk_tb_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tb_package` FOREIGN KEY (`package_id`) REFERENCES `tour_packages` (`id`),
  CONSTRAINT `fk_tb_rider` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tour_bookings`
--

LOCK TABLES `tour_bookings` WRITE;
/*!40000 ALTER TABLE `tour_bookings` DISABLE KEYS */;
/*!40000 ALTER TABLE `tour_bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tour_packages`
--

DROP TABLE IF EXISTS `tour_packages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tour_packages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `duration_hours` decimal(5,2) NOT NULL DEFAULT 8.00,
  `base_price` decimal(14,2) NOT NULL,
  `max_tourists` int(11) NOT NULL DEFAULT 4,
  `pickup_notes` varchar(500) DEFAULT NULL,
  `image_url` varchar(700) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tour_active` (`is_active`),
  KEY `fk_tour_admin` (`created_by`),
  CONSTRAINT `fk_tour_admin` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tour_packages`
--

LOCK TABLES `tour_packages` WRITE;
/*!40000 ALTER TABLE `tour_packages` DISABLE KEYS */;
INSERT INTO `tour_packages` VALUES (1,'Full-Day Island Tour','A customizable full-day Zanzibar island experience.',8.00,150000.00,4,'Confirm pickup point with the driver.',NULL,1,1,'2026-10-01 04:53:18','2026-10-01 04:53:18'),(2,'Nungwi Sunset Ride','Sunset trip with flexible pickup.',4.00,90000.00,4,'Pickup time should be confirmed before departure.',NULL,1,1,'2026-10-01 04:53:18','2026-10-21 14:43:15');
/*!40000 ALTER TABLE `tour_packages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_archives`
--

DROP TABLE IF EXISTS `user_archives`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_archives` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `original_user_id` bigint(20) unsigned NOT NULL,
  `role` enum('rider','driver','admin') NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`snapshot`)),
  `archived_by` bigint(20) unsigned DEFAULT NULL,
  `archived_at` datetime NOT NULL DEFAULT current_timestamp(),
  `archive_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_archive_original_user` (`original_user_id`),
  KEY `idx_archive_role` (`role`),
  KEY `idx_archive_phone` (`phone`),
  KEY `idx_archive_email` (`email`),
  KEY `idx_archive_archived_at` (`archived_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_archives`
--

LOCK TABLES `user_archives` WRITE;
/*!40000 ALTER TABLE `user_archives` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_archives` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `role` enum('rider','driver','admin') NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `photo_url` varchar(500) DEFAULT NULL,
  `island` varchar(80) DEFAULT NULL,
  `region` varchar(120) DEFAULT NULL,
  `district` varchar(120) DEFAULT NULL,
  `ward` varchar(120) DEFAULT NULL,
  `status` enum('pending','active','suspended','rejected') NOT NULL DEFAULT 'active',
  `phone_verified_at` datetime DEFAULT NULL,
  `email_verified_at` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_role_phone` (`role`,`phone`),
  UNIQUE KEY `uq_users_role_email` (`role`,`email`),
  KEY `idx_users_role_status` (`role`,`status`),
  KEY `idx_users_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','ZenjiGO Administrator','+255677532140','admin@zenjigo.online','$2b$12$qSxha6Yg2WbH2ABHK59OwODHhcndUd11aSVMq3x1ldo7fEISrnuHa',NULL,NULL,NULL,NULL,NULL,'active','2026-10-21 09:12:09','2026-09-30 23:23:18','2026-10-22 14:26:14','2026-10-01 04:53:18','2026-10-22 19:56:14'),(14,'driver','Driver MO','+255677532140','molittle1011@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,'active',NULL,NULL,'2026-10-22 14:21:25','2026-10-22 19:27:54','2026-10-22 19:56:24'),(16,'rider','Rider MO','+255677532140','molittle1011@gmail.com',NULL,NULL,'Unguja','Fuoni',NULL,NULL,'active','2026-10-22 16:47:18',NULL,'2026-10-23 10:22:51','2026-10-22 22:17:18','2026-10-23 15:52:51');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vehicles`
--

DROP TABLE IF EXISTS `vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `driver_id` bigint(20) unsigned NOT NULL,
  `type` enum('boda','bajaji','taxi') NOT NULL,
  `plate_number` varchar(50) NOT NULL,
  `make` varchar(80) DEFAULT NULL,
  `model` varchar(80) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `model_year` smallint(6) DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vehicle_plate` (`plate_number`),
  KEY `idx_vehicle_driver` (`driver_id`),
  CONSTRAINT `fk_vehicle_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vehicles`
--

LOCK TABLES `vehicles` WRITE;
/*!40000 ALTER TABLE `vehicles` DISABLE KEYS */;
INSERT INTO `vehicles` VALUES (1,14,'taxi','ZNZ001','Nissan','Model1','Black',2010,'active','2026-10-22 19:27:54','2026-10-22 19:27:54');
/*!40000 ALTER TABLE `vehicles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wallet_transactions`
--

DROP TABLE IF EXISTS `wallet_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wallet_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `type` enum('topup','ride','refund','tip','promo','withdrawal','adjustment') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `balance_before` decimal(14,2) NOT NULL,
  `balance_after` decimal(14,2) NOT NULL,
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` bigint(20) unsigned DEFAULT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `status` enum('pending','success','failed','reversed') NOT NULL DEFAULT 'success',
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_wallet_tx_user` (`user_id`,`created_at`),
  KEY `idx_wallet_ref` (`reference_type`,`reference_id`),
  CONSTRAINT `fk_wallet_tx_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wallet_transactions`
--

LOCK TABLES `wallet_transactions` WRITE;
/*!40000 ALTER TABLE `wallet_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `wallet_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wallets`
--

DROP TABLE IF EXISTS `wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wallets` (
  `user_id` bigint(20) unsigned NOT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT 0.00,
  `currency` char(3) NOT NULL DEFAULT 'TZS',
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wallets`
--

LOCK TABLES `wallets` WRITE;
/*!40000 ALTER TABLE `wallets` DISABLE KEYS */;
INSERT INTO `wallets` VALUES (16,0.00,'TZS','2026-10-22 22:17:18');
/*!40000 ALTER TABLE `wallets` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-23 19:22:42
