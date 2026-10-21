-- OTP delivery is email-only. Keep legacy enum values for existing historical rows,
-- but default all new verification records to email.
ALTER TABLE otp_verifications MODIFY COLUMN channel ENUM('sms','whatsapp','email') NOT NULL DEFAULT 'email';
