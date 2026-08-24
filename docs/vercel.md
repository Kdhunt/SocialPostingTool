# Deploying on Vercel

This monorepo deploys as **one Vercel project** on **one domain**. Nuxt serves
the UI; NestJS API routes are rewritten to a serverless function on the same
host (see root `vercel.json`).

**Database migrations and the role/permission seed run automatically during
each Vercel build** when Postgres is linked (`scripts/vercel-build.ts`).

```
https://your-app.vercel.app
  ├── /login, /campaigns, …          → Nuxt (frontend)
  ├── /api/v1/health, /api/v1/auth, … → NestJS (serverless)
  └── /api/cron/*                    → background jobs (Vercel Cron)
```

## What the build does automatically

On every Vercel deploy (`pnpm run build:vercel`):

1. Builds the web app and API packages (Turbo)
2. **Production only:** validates Postgres, Redis, and auth secrets — fails
   with a checklist if anything is missing
3. **`prisma migrate deploy`** when Postgres is linked (uses direct URL when
   Vercel provides `POSTGRES_URL_NON_POOLING`)
4. **`db:seed`** — idempotent upsert of roles and permissions
5. **`db:bootstrap`** — when `BOOTSTRAP_*` env vars are set, creates the first
   admin user and ward code (skips if username already exists)

You do **not** need to run migrations manually from your machine unless you
prefer to.

## What you still set up once (Vercel dashboard)

These cannot be created from the build — link them in the Vercel UI:

| Step | Where |
|------|--------|
| Postgres | **Storage → Create → Postgres** → connect to project |
| Redis | **Integrations → Upstash → Redis** → connect to project |
| Auth secrets | **Settings → Environment Variables** (see below) |

## 1. Create the Vercel project

1. Vercel → **Add New Project** → import this repository.
2. **Root Directory:** prefer **`.`** (repository root). If the project is
   still rooted at `apps/api`, `apps/api/vercel.json` cds to the monorepo root
   and runs `pnpm run build:vercel`, then publishes Build Output into
   `apps/api/.vercel/output` so Vercel can find it.
3. **Framework Preset:** **Other** (not Nuxt). The build writes the
   [Build Output API](https://vercel.com/docs/build-output-api/v3) itself.
4. **Node.js Version:** 20.x.
5. Leave **Output Directory** empty in the dashboard. Do **not** set it to
   `.vercel/output` — that makes Vercel treat the build as a static export and
   every page returns `NOT_FOUND`.

Do **not** set the build command to `pnpm run build:vercel` inside `apps/api`
without the `cd ../..` wrapper — that script only exists at the workspace root.

## 2. Link Postgres

1. **Storage** → **Create** → **Postgres**
2. Connect to this project.
3. Vercel injects `PRISMA_DATABASE_URL` (pooled, for the app) and `POSTGRES_URL`
   (direct, for migrations in the build). Older stores may use `POSTGRES_PRISMA_URL`
   instead — all are mapped automatically.

The build maps these to `DATABASE_URL` and runs migrations + seed on deploy.

## 3. Link Upstash Redis

1. **Integrations** → **Upstash** → **Redis**
2. Connect to this project.
3. Use the **Redis protocol URL** (`rediss://…`), not the REST URL.

## 4. Set secrets (one time)

| Variable | Required | Notes |
|----------|----------|-------|
| `SESSION_SECRET` | Yes | `openssl rand -base64 48` |
| `REFRESH_TOKEN_SECRET` | Yes | different random string |
| `WARD_CODE_PEPPER` | Yes | ≥16 chars |
| `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` | Yes | ≥32 chars |
| `CRON_SECRET` | Yes | `openssl rand -base64 32` |
| `BOOTSTRAP_ADMIN_USERNAME` | Yes (first deploy) | Your prod admin login |
| `BOOTSTRAP_ADMIN_PASSWORD` | Yes (first deploy) | min 12 characters |
| `BOOTSTRAP_WARD_CODE` | Yes (first deploy) | Ward code for sign-in |
| `BOOTSTRAP_WARD_NAME` | Optional | Default: `Ward Communications Hub` |
| `NODE_ENV` | Yes | `production` |
| `PROVIDER_MODE` | Optional | `simulated` (default) |

**Auto-filled by Vercel when linked / deployed:**

- `PRISMA_DATABASE_URL`, `POSTGRES_URL`, `REDIS_URL`
- `WEB_URL`, `API_URL` (from `VERCEL_URL`)
- `NUXT_PUBLIC_API_BASE_URL` — leave **unset** (same-origin API)

Production builds **fail fast** with a checklist if secrets or storage are
missing.

**Remove `BOOTSTRAP_*` variables after the first successful deploy** — the
build creates the admin user once, then skips on later deploys.

## 5. Deploy and verify

1. Deploy — watch build logs for `Applying database migrations…`,
   `Seeding role and permission catalog…`, and `Running production admin bootstrap…`.
2. `https://<your-domain>/api/v1/health` → JSON health response.
3. `https://<your-domain>/` → web app.
4. Sign in at `/login` with your **BOOTSTRAP_** credentials (not the dev
   `admin` / `ChangeMeNow!23` defaults unless you ran `db:seed:dev` manually).

After bootstrap, create more wards via **Administration → Wards** (requires
`PlatformAdmin`, assigned automatically to the bootstrap admin).

Do **not** run `db:seed:dev` in production.

## 6. Cron jobs

| Path | Schedule |
|------|----------|
| `/api/cron/process-schedules` | every 5 minutes |
| `/api/cron/process-delivery-queue` | every minute |

Requires **Vercel Pro**. Uses `CRON_SECRET`.

## Manual database commands (optional)

```powershell
$env:DATABASE_URL = "<PRISMA_DATABASE_URL from Vercel>"
$env:WARD_CODE_PEPPER = "<same as Vercel>"
$env:BOOTSTRAP_ADMIN_USERNAME = "your-admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "Your-Secure-Password-12"
$env:BOOTSTRAP_WARD_CODE = "your-ward-code"
pnpm --filter @ward-comms/database db:bootstrap
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build succeeds but every URL is `NOT_FOUND` | **Settings → General → Output Directory** must be **empty**. If set to `.vercel/output`, Vercel treats the build as a static folder and ignores serverless routes. Also confirm **Framework Preset** is **Other**, not Nuxt. |
| Build uses `cd ../..` in install | **Root Directory** is `apps/api`. Either keep it (build copies output to `apps/api/.vercel/output`) or switch **Root Directory** to `.` and use root `vercel.json` only. |
| Custom domain 404 but build is green | Open the project's `*.vercel.app` URL from **Vercel → Project → Domains**. If that works, re attach `wardcomms.online` to this project (not an older "Social Posting Tool" project). |
| Build fails with configuration checklist | Link Postgres + Redis; set all secrets |
| `/health` 404 (Nuxt "Page not found") | API not deployed — redeploy with latest build; use `/api/v1/health` |
| Login fails / invalid username | Set `BOOTSTRAP_*` env vars and redeploy, or run `db:bootstrap` manually against prod DB |
| Ward code rejected | `WARD_CODE_PEPPER` on Vercel must match the value used when the ward code was created |
| Login fails after successful build | Check browser Network tab — `/auth/login` should return JSON, not HTML 404 |
| Prisma migrate errors during build | Ensure `POSTGRES_URL_NON_POOLING` or `POSTGRES_URL` is set |
| Campaigns stuck on Sending | Pro plan + `CRON_SECRET` + Redis |

## Local development

```bash
docker compose up -d
pnpm dev
```

Use `pnpm run build:vercel` locally to dry-run the Vercel build (skips deploy
validation when `VERCEL` is not set).
