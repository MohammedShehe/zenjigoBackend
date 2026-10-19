-- NextSMS OTP: store hashed codes locally (Twilio Verify no longer used)
ALTER TABLE otp_verifications ADD COLUMN code_hash CHAR(64) NULL AFTER provider_sid;
