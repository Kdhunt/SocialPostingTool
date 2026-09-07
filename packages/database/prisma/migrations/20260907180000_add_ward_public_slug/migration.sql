-- Public campaign board path per ward (`/{publicSlug}`), not the login ward code.

ALTER TABLE "ward" ADD COLUMN "public_slug" TEXT;

UPDATE "ward"
SET "public_slug" = NULLIF(left(lower(regexp_replace("name", '[^a-zA-Z0-9]', '', 'g')), 64), '');

UPDATE "ward"
SET "public_slug" = 'ward' || left(replace("id", '-', ''), 16)
WHERE "public_slug" IS NULL
   OR "public_slug" IN (
     'admin',
     'api',
     'assets',
     'audiences',
     'campaigns',
     'directory',
     'favicon',
     'forgotpassword',
     'health',
     'index',
     'login',
     'resetpassword',
     'robots',
     'settings',
     'sitemap',
     'verifyemail'
   );

WITH ranked AS (
  SELECT
    "id",
    "public_slug",
    row_number() OVER (PARTITION BY "public_slug" ORDER BY "created_at", "id") AS rn
  FROM "ward"
)
UPDATE "ward" AS w
SET "public_slug" = left(w."public_slug", 56) || left(replace(w."id", '-', ''), 8)
FROM ranked AS r
WHERE w."id" = r."id"
  AND r.rn > 1;

ALTER TABLE "ward" ALTER COLUMN "public_slug" SET NOT NULL;

CREATE UNIQUE INDEX "ward_public_slug_key" ON "ward"("public_slug");
