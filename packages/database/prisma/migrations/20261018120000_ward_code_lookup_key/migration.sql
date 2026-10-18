-- Indexed lookup key for ward codes so login does not Argon2-verify every ward.
ALTER TABLE "ward_code_version" ADD COLUMN "lookup_key" TEXT;

CREATE INDEX "ward_code_version_lookup_key_retired_at_idx" ON "ward_code_version"("lookup_key", "retired_at");
