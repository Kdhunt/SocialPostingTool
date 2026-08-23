-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'NotSpecified');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('Husband', 'Wife', 'Son', 'Daughter', 'Parent', 'Child', 'Spouse', 'Guardian', 'Dependent', 'Other', 'NotSpecified');

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('Head', 'Member');

-- CreateEnum
CREATE TYPE "ContactMethodType" AS ENUM ('Email', 'Phone');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('Unknown', 'Granted', 'Denied', 'Withdrawn');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('Email', 'Sms', 'FacebookPage');

-- CreateTable
CREATE TABLE "ward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL DEFAULT 'America/Denver',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_user" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_algo" TEXT NOT NULL DEFAULT 'argon2id',
    "password_updated_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login_at" TIMESTAMP(3),
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "application_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "device_id" TEXT,
    "ward_code_version_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ward_code_version" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),

    CONSTRAINT "ward_code_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'NotSpecified',
    "date_of_birth" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_membership" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "household_role" "HouseholdRole" NOT NULL DEFAULT 'Member',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_relationship" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "related_person_id" TEXT NOT NULL,
    "relationship_type" "RelationshipType" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "person_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_method" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "type" "ContactMethodType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "contact_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_consent" (
    "id" TEXT NOT NULL,
    "contact_method_id" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'Unknown',
    "source" TEXT,
    "recorded_by_user_id" TEXT,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_group" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "audience_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_group_member" (
    "id" TEXT NOT NULL,
    "audience_group_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "added_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_group_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_destination" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "provider_account_reference" TEXT,
    "configuration" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "communication_destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_destination" (
    "id" TEXT NOT NULL,
    "audience_group_id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audience_destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");

-- CreateIndex
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_role_id_permission_id_key" ON "role_permission"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "application_user_ward_id_idx" ON "application_user"("ward_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_user_ward_id_username_key" ON "application_user"("ward_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "application_user_ward_id_email_key" ON "application_user"("ward_id", "email");

-- CreateIndex
CREATE INDEX "user_role_role_id_idx" ON "user_role"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_user_id_role_id_key" ON "user_role"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_session_session_token_hash_key" ON "user_session"("session_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_session_refresh_token_hash_key" ON "user_session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_session_user_id_idx" ON "user_session"("user_id");

-- CreateIndex
CREATE INDEX "user_session_device_id_idx" ON "user_session"("device_id");

-- CreateIndex
CREATE INDEX "user_session_expires_at_idx" ON "user_session"("expires_at");

-- CreateIndex
CREATE INDEX "ward_code_version_ward_id_retired_at_idx" ON "ward_code_version"("ward_id", "retired_at");

-- CreateIndex
CREATE UNIQUE INDEX "ward_code_version_ward_id_version_key" ON "ward_code_version"("ward_id", "version");

-- CreateIndex
CREATE INDEX "person_ward_id_last_name_first_name_idx" ON "person"("ward_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "person_ward_id_archived_at_idx" ON "person"("ward_id", "archived_at");

-- CreateIndex
CREATE INDEX "household_ward_id_idx" ON "household"("ward_id");

-- CreateIndex
CREATE INDEX "household_membership_household_id_idx" ON "household_membership"("household_id");

-- CreateIndex
CREATE INDEX "household_membership_person_id_ended_at_idx" ON "household_membership"("person_id", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "household_membership_person_id_household_id_key" ON "household_membership"("person_id", "household_id");

-- CreateIndex
CREATE INDEX "person_relationship_related_person_id_idx" ON "person_relationship"("related_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_relationship_person_id_related_person_id_relationshi_key" ON "person_relationship"("person_id", "related_person_id", "relationship_type");

-- CreateIndex
CREATE INDEX "contact_method_person_id_idx" ON "contact_method"("person_id");

-- CreateIndex
CREATE INDEX "contact_method_normalized_value_idx" ON "contact_method"("normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "contact_method_person_id_type_value_key" ON "contact_method"("person_id", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "contact_consent_contact_method_id_key" ON "contact_consent"("contact_method_id");

-- CreateIndex
CREATE INDEX "audience_group_ward_id_archived_at_idx" ON "audience_group"("ward_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "audience_group_ward_id_name_key" ON "audience_group"("ward_id", "name");

-- CreateIndex
CREATE INDEX "audience_group_member_person_id_idx" ON "audience_group_member"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "audience_group_member_audience_group_id_person_id_key" ON "audience_group_member"("audience_group_id", "person_id");

-- CreateIndex
CREATE INDEX "communication_destination_ward_id_channel_idx" ON "communication_destination"("ward_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "communication_destination_ward_id_name_key" ON "communication_destination"("ward_id", "name");

-- CreateIndex
CREATE INDEX "audience_destination_destination_id_idx" ON "audience_destination"("destination_id");

-- CreateIndex
CREATE UNIQUE INDEX "audience_destination_audience_group_id_destination_id_key" ON "audience_destination"("audience_group_id", "destination_id");

-- CreateIndex
CREATE INDEX "audit_event_ward_id_created_at_idx" ON "audit_event"("ward_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_entity_type_entity_id_idx" ON "audit_event"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_event_actor_user_id_idx" ON "audit_event"("actor_user_id");

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_user" ADD CONSTRAINT "application_user_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "application_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "application_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_ward_code_version_id_fkey" FOREIGN KEY ("ward_code_version_id") REFERENCES "ward_code_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ward_code_version" ADD CONSTRAINT "ward_code_version_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_membership" ADD CONSTRAINT "household_membership_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_membership" ADD CONSTRAINT "household_membership_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationship" ADD CONSTRAINT "person_relationship_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_relationship" ADD CONSTRAINT "person_relationship_related_person_id_fkey" FOREIGN KEY ("related_person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_method" ADD CONSTRAINT "contact_method_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consent" ADD CONSTRAINT "contact_consent_contact_method_id_fkey" FOREIGN KEY ("contact_method_id") REFERENCES "contact_method"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_consent" ADD CONSTRAINT "contact_consent_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_group" ADD CONSTRAINT "audience_group_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_group_member" ADD CONSTRAINT "audience_group_member_audience_group_id_fkey" FOREIGN KEY ("audience_group_id") REFERENCES "audience_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_group_member" ADD CONSTRAINT "audience_group_member_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_group_member" ADD CONSTRAINT "audience_group_member_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_destination" ADD CONSTRAINT "communication_destination_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_destination" ADD CONSTRAINT "audience_destination_audience_group_id_fkey" FOREIGN KEY ("audience_group_id") REFERENCES "audience_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_destination" ADD CONSTRAINT "audience_destination_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "communication_destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
