-- Account inbox verification, password-reset tokens, and transactional email outbox.

CREATE TYPE "UserAccountTokenPurpose" AS ENUM ('EmailVerification', 'PasswordReset');
CREATE TYPE "OutboundMessageKind" AS ENUM ('EmailVerification', 'PasswordReset');
CREATE TYPE "OutboundMessageStatus" AS ENUM ('Pending', 'Sending', 'Sent', 'Failed');

ALTER TABLE "application_user"
  ADD COLUMN "email_verified_at" TIMESTAMP(3);

CREATE TABLE "user_account_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "UserAccountTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_account_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_account_token_token_hash_key" ON "user_account_token"("token_hash");
CREATE INDEX "user_account_token_user_id_purpose_created_at_idx" ON "user_account_token"("user_id", "purpose", "created_at");

ALTER TABLE "user_account_token"
  ADD CONSTRAINT "user_account_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "application_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "outbound_message" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT,
    "user_id" TEXT,
    "kind" "OutboundMessageKind" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'Email',
    "to_address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'Pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbound_message_idempotency_key_key" ON "outbound_message"("idempotency_key");
CREATE INDEX "outbound_message_status_next_attempt_at_idx" ON "outbound_message"("status", "next_attempt_at");
CREATE INDEX "outbound_message_user_id_kind_idx" ON "outbound_message"("user_id", "kind");

ALTER TABLE "outbound_message"
  ADD CONSTRAINT "outbound_message_ward_id_fkey"
  FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_message"
  ADD CONSTRAINT "outbound_message_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
