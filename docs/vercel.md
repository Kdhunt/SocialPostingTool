# Deploying on Vercel

This monorepo deploys as **one Vercel project** on **one domain**. Nuxt serves
the UI; NestJS API routes are rewritten to a serverless function on the same
host (see root `vercel.json`).

```
https://your-app.vercel.app
  ├── /login, /campaigns, …     → Nuxt (frontend)
  ├── /health, /auth, /directory, … → NestJS (serverless)
  └── /api/cron/*               → background jobs (Vercel Cron)
```

## 1. Create the Vercel project

1. Vercel → **Add New Project** → import this repository.
2. **Root Directory:** leave as **`.`** (repository root) — do not set `apps/web` or `apps/api`.
3. **Framework Preset:** Nuxt (auto-detected from root `vercel.json`).
4. **Node.js Version:** 20.x.

Build settings come from root `vercel.json` (`installCommand`, `buildCommand`,
`outputDirectory`).

## 2. Add Vercel Postgres

1. **Storage** → **Create** → **Postgres**
2. Connect to this project.
3. Vercel injects `POSTGRES_PRISMA_URL` — mapped to `DATABASE_URL` automatically.

### Run migrations (once, from your machine)

**PowerShell:**

```powershell
$env:DATABASE_URL = "<POSTGRES_PRISMA_URL from Vercel>"
pnpm --filter @ward-comms/database db:deploy
pnpm --filter @ward-comms/database db:seed
```

Do **not** run `db:seed:dev` in production.

## 3. Add Upstash Redis

1. **Integrations** → **Upstash** → **Redis**
2. Link to this project.
3. Use the **Redis protocol URL** (`rediss://…`), not the REST URL. BullMQ
   requires the protocol URL (`REDIS_URL` or `UPSTASH_REDIS_URL`).

## 4. Environment variables

Set these on the **single** Vercel project (Production + Preview as needed):

| Variable | Required | Notes |
|----------|----------|-------|
| `POSTGRES_PRISMA_URL` | Yes | From Vercel Postgres (auto) |
| `REDIS_URL` | Yes | Upstash Redis protocol URL |
| `SESSION_SECRET` | Yes | `openssl rand -base64 48` |
| `REFRESH_TOKEN_SECRET` | Yes | different random string |
| `WARD_CODE_PEPPER` | Yes | ≥16 chars |
| `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` | Yes | ≥32 chars |
| `CRON_SECRET` | Yes | `openssl rand -base64 32` |
| `NODE_ENV` | Yes | `production` |
| `PROVIDER_MODE` | Optional | `simulated` (default) |
| `CORS_ALLOWED_ORIGINS` | Optional | Defaults to `WEB_URL`; same-origin deploys rarely need this |
| `WEB_URL` | Optional | Defaults from `VERCEL_URL` |
| `API_URL` | Optional | Defaults from `VERCEL_URL` |
| `NUXT_PUBLIC_API_BASE_URL` | Optional | Leave **unset** for same-origin (recommended). Set only for split-domain deploys. |

On Vercel, `WEB_URL` and `API_URL` both default to `https://<your-domain>`.
Session cookies use `SameSite=Lax` on the same host — no cross-domain setup.

## 5. Deploy and verify

1. Deploy the project.
2. Open `https://<your-domain>/health` — JSON health response from NestJS.
3. Open `https://<your-domain>/` — Nuxt web app.
4. Sign in — browser requests go to `/auth/...` on the **same domain**.

## 6. Cron jobs

Root `vercel.json` registers:

| Path | Schedule |
|------|----------|
| `/api/cron/process-schedules` | every 5 minutes |
| `/api/cron/process-delivery-queue` | every minute |

Requires **Vercel Pro**. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.

## 7. Provision your first ward

After `db:seed`, create a ward via **Administration → Wards** (requires
`PlatformAdmin`) or assign that role in the database.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/health` 404 but pages load | Confirm root directory is repo root, not `apps/web` |
| Login fails | Check `/health`; verify secrets and migrations |
| API routes hit Nuxt 404 | Rewrites in root `vercel.json` must deploy with the project |
| Campaigns stuck on Sending | Cron needs Pro plan + `CRON_SECRET` + working Redis |
| Prisma errors | Use pooled `POSTGRES_PRISMA_URL` |

## Local development

Unchanged — separate API and web processes:

```bash
docker compose up -d
pnpm dev
```

Local dev still uses `http://localhost:3001` for the API and
`http://localhost:3000` for the web app.
