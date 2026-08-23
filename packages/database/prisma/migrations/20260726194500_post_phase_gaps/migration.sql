-- Post-phase gaps: audience rules, asset confirmation, overlap strategy

CREATE TYPE "AudienceMembershipMode" AS ENUM ('Manual', 'Rules');
CREATE TYPE "AudienceMemberSource" AS ENUM ('Manual', 'Rules');
CREATE TYPE "CampaignAssetConfirmationStatus" AS ENUM ('Pending', 'Confirmed', 'Rejected');
CREATE TYPE "OverlapResolutionStrategy" AS ENUM ('FirstAudienceWins', 'PreferBase', 'PreferSpecificAudience');

ALTER TABLE "audience_group"
  ADD COLUMN "membership_mode" "AudienceMembershipMode" NOT NULL DEFAULT 'Manual',
  ADD COLUMN "membership_rules" JSONB;

ALTER TABLE "audience_group_member"
  ADD COLUMN "source" "AudienceMemberSource" NOT NULL DEFAULT 'Manual';

ALTER TABLE "campaign_version"
  ADD COLUMN "overlap_resolution_strategy" "OverlapResolutionStrategy" NOT NULL DEFAULT 'FirstAudienceWins',
  ADD COLUMN "prefer_specific_audience_group_id" TEXT;

ALTER TABLE "campaign_asset"
  ADD COLUMN "confirmation_status" "CampaignAssetConfirmationStatus" NOT NULL DEFAULT 'Confirmed',
  ADD COLUMN "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "generation_prompt" TEXT;
