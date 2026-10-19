-- Bulletins: organizations per unit, bulletins, and their sections.

-- CreateEnum
CREATE TYPE "BulletinStatus" AS ENUM ('Draft', 'Published');

-- CreateEnum
CREATE TYPE "BulletinTemplate" AS ENUM ('Newsletter', 'SingleColumn');

-- CreateEnum
CREATE TYPE "BulletinColumn" AS ENUM ('Main', 'Side');

-- CreateTable
CREATE TABLE "unit_organization" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "unit_organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin" (
    "id" TEXT NOT NULL,
    "ward_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kicker" TEXT,
    "issue_date" DATE NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "template" "BulletinTemplate" NOT NULL DEFAULT 'Newsletter',
    "status" "BulletinStatus" NOT NULL DEFAULT 'Draft',
    "published_at" TIMESTAMP(3),
    "translation_of_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "bulletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletin_section" (
    "id" TEXT NOT NULL,
    "bulletin_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "column" "BulletinColumn" NOT NULL DEFAULT 'Main',
    "sort_order" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "subheading" TEXT,
    "body_html" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT,
    "image_alt_text" TEXT,
    "link_url" TEXT,
    "link_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletin_section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_organization_ward_id_archived_at_idx" ON "unit_organization"("ward_id", "archived_at");

-- CreateIndex
CREATE INDEX "bulletin_ward_id_status_archived_at_idx" ON "bulletin"("ward_id", "status", "archived_at");

-- CreateIndex
CREATE INDEX "bulletin_translation_of_id_idx" ON "bulletin"("translation_of_id");

-- CreateIndex
CREATE INDEX "bulletin_section_bulletin_id_sort_order_idx" ON "bulletin_section"("bulletin_id", "sort_order");

-- CreateIndex
CREATE INDEX "bulletin_section_organization_id_idx" ON "bulletin_section"("organization_id");

-- AddForeignKey
ALTER TABLE "unit_organization" ADD CONSTRAINT "unit_organization_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin" ADD CONSTRAINT "bulletin_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin" ADD CONSTRAINT "bulletin_translation_of_id_fkey" FOREIGN KEY ("translation_of_id") REFERENCES "bulletin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin" ADD CONSTRAINT "bulletin_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "application_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_section" ADD CONSTRAINT "bulletin_section_bulletin_id_fkey" FOREIGN KEY ("bulletin_id") REFERENCES "bulletin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletin_section" ADD CONSTRAINT "bulletin_section_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "unit_organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Give every existing unit the default organizations. Must match
-- DEFAULT_UNIT_ORGANIZATIONS in packages/domain/src/bulletins/organizations.ts.
INSERT INTO "unit_organization" ("id", "ward_id", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, w."id", o."name", o."sort_order", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ward" w
CROSS JOIN (
  VALUES ('General', 0), ('Relief Society', 1), ('Priesthood', 2), ('Young Women', 3), ('Youth', 4), ('Primary', 5)
) AS o("name", "sort_order");
