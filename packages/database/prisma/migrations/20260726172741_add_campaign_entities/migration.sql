-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('Draft', 'PendingApproval', 'Approved', 'Rejected', 'Scheduled', 'Sending', 'Sent', 'Cancelled');

-- CreateEnum
CREATE TYPE "CampaignApprovalDecision" AS ENUM ('Approved', 'Rejected');

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'Draft',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_version" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "base_message" TEXT,
    "base_image_asset_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_channel_version" (
    "id" TEXT NOT NULL,
    "campaign_version_id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_channel_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_asset" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "storage_reference" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_audience" (
    "id" TEXT NOT NULL,
    "campaign_version_id" TEXT NOT NULL,
    "audience_group_id" TEXT NOT NULL,
    "override_text" TEXT,
    "override_image_asset_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_destination" (
    "id" TEXT NOT NULL,
    "campaign_version_id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_approval" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "campaign_version_id" TEXT NOT NULL,
    "approver_user_id" TEXT,
    "decision" "CampaignApprovalDecision" NOT NULL,
    "comment" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_schedule" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "campaign_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_ward_id_status_idx" ON "campaign"("ward_id", "status");

-- CreateIndex
CREATE INDEX "campaign_ward_id_archived_at_idx" ON "campaign"("ward_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_version_campaign_id_version_number_key" ON "campaign_version"("campaign_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_channel_version_campaign_version_id_channel_key" ON "campaign_channel_version"("campaign_version_id", "channel");

-- CreateIndex
CREATE INDEX "campaign_asset_campaign_id_idx" ON "campaign_asset"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_audience_audience_group_id_idx" ON "campaign_audience"("audience_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_audience_campaign_version_id_audience_group_id_key" ON "campaign_audience"("campaign_version_id", "audience_group_id");

-- CreateIndex
CREATE INDEX "campaign_destination_destination_id_idx" ON "campaign_destination"("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_destination_campaign_version_id_destination_id_key" ON "campaign_destination"("campaign_version_id", "destination_id");

-- CreateIndex
CREATE INDEX "campaign_approval_campaign_id_idx" ON "campaign_approval"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_schedule_campaign_id_idx" ON "campaign_schedule"("campaign_id");

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_version" ADD CONSTRAINT "campaign_version_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_version" ADD CONSTRAINT "campaign_version_base_image_asset_id_fkey" FOREIGN KEY ("base_image_asset_id") REFERENCES "campaign_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_version" ADD CONSTRAINT "campaign_version_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_channel_version" ADD CONSTRAINT "campaign_channel_version_campaign_version_id_fkey" FOREIGN KEY ("campaign_version_id") REFERENCES "campaign_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_audience" ADD CONSTRAINT "campaign_audience_campaign_version_id_fkey" FOREIGN KEY ("campaign_version_id") REFERENCES "campaign_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_audience" ADD CONSTRAINT "campaign_audience_audience_group_id_fkey" FOREIGN KEY ("audience_group_id") REFERENCES "audience_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_audience" ADD CONSTRAINT "campaign_audience_override_image_asset_id_fkey" FOREIGN KEY ("override_image_asset_id") REFERENCES "campaign_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_destination" ADD CONSTRAINT "campaign_destination_campaign_version_id_fkey" FOREIGN KEY ("campaign_version_id") REFERENCES "campaign_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_destination" ADD CONSTRAINT "campaign_destination_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "communication_destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_approval" ADD CONSTRAINT "campaign_approval_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_approval" ADD CONSTRAINT "campaign_approval_campaign_version_id_fkey" FOREIGN KEY ("campaign_version_id") REFERENCES "campaign_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_approval" ADD CONSTRAINT "campaign_approval_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_schedule" ADD CONSTRAINT "campaign_schedule_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_schedule" ADD CONSTRAINT "campaign_schedule_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
