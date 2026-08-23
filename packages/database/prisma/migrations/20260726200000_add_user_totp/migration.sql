-- Per-user TOTP two-factor authentication (encrypted secret at rest).
ALTER TABLE "application_user"
  ADD COLUMN "totp_secret_encrypted" TEXT,
  ADD COLUMN "totp_enabled_at" TIMESTAMP(3),
  ADD COLUMN "totp_failed_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totp_locked_until" TIMESTAMP(3);
