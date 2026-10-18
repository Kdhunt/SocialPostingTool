-- Units at every level of the hierarchy (ward, stake, region, district) live
-- in "ward"; each unit may point at the unit one level above it.
CREATE TYPE "UnitLevel" AS ENUM ('Ward', 'Stake', 'Region', 'District');

ALTER TABLE "ward"
  ADD COLUMN "level" "UnitLevel" NOT NULL DEFAULT 'Ward',
  ADD COLUMN "parent_id" TEXT;

ALTER TABLE "ward"
  ADD CONSTRAINT "ward_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ward_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

CREATE INDEX "ward_parent_id_idx" ON "ward"("parent_id");

-- Sign-in looks a unit up by its code through this key instead of
-- Argon2-verifying every unit's code.
ALTER TABLE "ward_code_version" ADD COLUMN "lookup_key" TEXT;

CREATE INDEX "ward_code_version_lookup_key_retired_at_idx" ON "ward_code_version"("lookup_key", "retired_at");
