-- Allow the same phone/email to be used by different roles while preserving
-- uniqueness inside each role. Back up the database before applying.
ALTER TABLE users
  DROP INDEX uq_users_phone,
  DROP INDEX uq_users_email,
  ADD UNIQUE KEY uq_users_role_phone (role, phone),
  ADD UNIQUE KEY uq_users_role_email (role, email);
