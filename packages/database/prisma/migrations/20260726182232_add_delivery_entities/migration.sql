-- CreateEnum
CREATE TYPE "DeliveryBatchStatus" AS ENUM ('Pending', 'Running', 'Completed', 'PartialFailure', 'Failed');

-- CreateEnum
CREATE TYPE "DeliveryRecipientStatus" AS ENUM ('Pending', 'Queued', 'Sending', 'Sent', 'Retrying', 'DeadLettered', 'Skipped');

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('Succeeded', 'Failed', 'PermanentFailure');

-- CreateTable
CREATE TABLE "delivery_batch" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_version_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "DeliveryBatchStatus" NOT NULL DEFAULT 'Pending',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "dead_lettered_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "delivery_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_recipient" (
    "id" TEXT NOT NULL,
    "delivery_batch_id" TEXT NOT NULL,
    "person_id" TEXT,
    "channel" "CommunicationChannel" NOT NULL,
    "destination_id" TEXT,
    "contact_method_id" TEXT,
    "source_audience_group_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" "DeliveryRecipientStatus" NOT NULL DEFAULT 'Pending',
    "resolved_text" TEXT,
    "resolved_image_asset_id" TEXT,
    "skip_reason" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempt" (
    "id" TEXT NOT NULL,
    "delivery_recipient_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "DeliveryAttemptStatus" NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_batch_campaign_id_idx" ON "delivery_batch"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_batch_ward_id_idempotency_key_key" ON "delivery_batch"("ward_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "delivery_recipient_delivery_batch_id_status_idx" ON "delivery_recipient"("delivery_batch_id", "status");

-- CreateIndex
CREATE INDEX "delivery_recipient_person_id_idx" ON "delivery_recipient"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_recipient_delivery_batch_id_idempotency_key_key" ON "delivery_recipient"("delivery_batch_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempt_delivery_recipient_id_attempt_number_key" ON "delivery_attempt"("delivery_recipient_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "delivery_batch" ADD CONSTRAINT "delivery_batch_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_batch" ADD CONSTRAINT "delivery_batch_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_batch" ADD CONSTRAINT "delivery_batch_campaign_version_id_fkey" FOREIGN KEY ("campaign_version_id") REFERENCES "campaign_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_batch" ADD CONSTRAINT "delivery_batch_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_recipient" ADD CONSTRAINT "delivery_recipient_delivery_batch_id_fkey" FOREIGN KEY ("delivery_batch_id") REFERENCES "delivery_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_recipient" ADD CONSTRAINT "delivery_recipient_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_recipient" ADD CONSTRAINT "delivery_recipient_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "communication_destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_recipient" ADD CONSTRAINT "delivery_recipient_contact_method_id_fkey" FOREIGN KEY ("contact_method_id") REFERENCES "contact_method"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_delivery_recipient_id_fkey" FOREIGN KEY ("delivery_recipient_id") REFERENCES "delivery_recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
