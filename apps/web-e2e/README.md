# Web end-to-end tests

Two Playwright suites live here:

| Suite                            | Config                       | Runs against                                       | Use it for                                            |
| -------------------------------- | ---------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| **Local mock ward** (full suite) | `playwright.local.config.ts` | A disposable local stack it starts itself          | Every page, button, link and workflow, for every role |
| Live smoke                       | `playwright.config.ts`       | `E2E_BASE_URL` (or local dev) with your superadmin | Quick checks against a deployed site                  |

## Running the full local suite

You need Postgres and Redis running locally (`docker compose up -d postgres redis` from the repo root), and the Playwright browser installed once:

```bash
pnpm --filter @ward-comms/web-e2e exec playwright install chromium
pnpm --filter @ward-comms/web-e2e test:e2e:local          # headless, about 6 minutes
pnpm --filter @ward-comms/web-e2e test:e2e:local:headed   # watch it click through
pnpm --filter @ward-comms/web-e2e exec playwright test -c playwright.local.config.ts tests/local/campaigns.spec.ts  # one area
```

Stop your own `pnpm dev` web server first: Nuxt allows only one dev server per app folder.

What happens when you run it:

1. A small **local mail catcher** starts on port 2525 (`mock-ward/mail-catcher.ts`).
2. The **`ward_comms_e2e` database is dropped and rebuilt** (migrations, role catalog, bootstrap superadmin). The reset refuses to run against anything except a local database whose name contains `e2e` or `test`.
3. The **API** starts on port 3101 and **Nuxt** on port 3100. Your normal dev ports (3000/3001) and dev database are never touched.
4. **Global setup builds the mock ward through the real API** (`mock-ward/build.ts`) and writes the ids it created to `.auth/local/mock-ward.json`.
5. The `sessions` project signs in once per role and saves the browser state, so specs start signed in.

Override ports or the database with `E2E_LOCAL_*` variables, for example `E2E_LOCAL_DATABASE_URL` or `E2E_LOCAL_WEB_PORT`.

Email, SMS and Facebook run in **simulated** mode, so nothing reaches a real provider. Account emails (confirmation and password reset) go through the app's **real SMTP sender** to the local mail catcher. Tests read the inbox from `.auth/local/mail/` and follow the links, the same way a member would. The app clears email bodies from its own database after sending, so the database can't be used as the inbox.

### Poking at the mock ward by hand

```bash
cd apps/web-e2e
pnpm mock-ward:reset                      # fresh ward_comms_e2e database
pnpm exec tsx mock-ward/start-api.ts      # API on :3101 with the e2e environment
pnpm exec tsx mock-ward/build-cli.ts      # build the mock ward (in another terminal)
NUXT_PUBLIC_API_BASE_URL=http://localhost:3101 pnpm --filter @ward-comms/web exec nuxt dev --port 3100
```

Then sign in at http://localhost:3100/login. For example, use unit code `WARD-MAPLE-0001` with `ward.admin` / `Fictional-WardAdmin-42`. Every account is listed in `mock-ward/fixture.ts`.

## The mock ward

Everything is fictional: `.test` email domains and reserved 555-01xx phone numbers (AGENTS.md #5). The definitions are in `mock-ward/fixture.ts`.

- **Hierarchy:** Fictional Summit District → Basin Region → Cedar Ridge Stake → **Maple Hollow Ward** (main) and Aspen Grove Ward (a neighbour, used for tenant-isolation checks). Each unit has its own admin, sign-in code and public page.
- **Accounts in Maple Hollow:** Ward admin, Communications coordinator, Contributor, Viewer, and a disabled account. Platform superadmin `e2e.superadmin`.
- **Directory:** 5 households and 11 people, covering adults and minors (15 and 8), granted, denied and missing consent, email and SMS, a simulated permanent provider failure (`simulate-permanent-failure…`), an unknown birth date (which must be treated as a minor), an inactive member, and spouse/parent relationships.
- **Destinations:** email list, SMS alerts, an archived list, and a connected Facebook Page.
- **Audiences:** All Adults (age rule), Relief Society (age + gender rule), Youth (manual, minors), Newsletter (manual, overlaps All Adults), Text Alerts (SMS), an archived one and an empty one.
- **Campaigns in every status:** Draft, Waiting for approval, Approved, Rejected, Scheduled, Sent (with a real delivery batch: sent, skipped-for-consent and a dead-lettered failure), Cancelled, plus an archived draft.
- **Bulletins:** a published English bulletin with four organization sections, its published Spanish edition, and a draft.
- **Admin data:** a custom organization, an active and a revoked provider credential.

Tests that change things create their own records (unique names), so they can run in any order and in parallel.

## What's covered

| Spec                  | Covers                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guest.spec.ts`       | Every protected route redirects to sign-in; login, forgot/reset password and verify-email pages; **email-link password reset and confirmation via the inbox**; public unit pages at every level, published bulletins, editions, Save as PDF, draft and cross-ward 404s                                                                                                                               |
| `auth.spec.ts`        | Sign-in for ward member, stake admin and superadmin; wrong password, wrong ward's code, no code, disabled account; sign out; **full two-factor lifecycle** (enroll, wrong code, sign in with code, disable)                                                                                                                                                                                          |
| `navigation.spec.ts`  | Exact sidebar for every role; **every sidebar link** opens its page; sub-navigations; quick actions; pending-approval and recent panels; breadcrumbs; mobile menu; platform home                                                                                                                                                                                                                     |
| `directory.spec.ts`   | List, badges, search, include inactive, add person, every person tab (profile, contact and consent, household picker, family picker), households CRUD, **minor privacy for every non-admin role**, unknown-age fail-closed, write permission, cross-ward isolation                                                                                                                                   |
| `audiences.spec.ts`   | List, search, archived filter, create, rename, members, rules preview and apply, destinations link/unlink, archive/restore, safe delete, every destination channel, contributor read-only                                                                                                                                                                                                            |
| `campaigns.spec.ts`   | List and every status filter, create, setup, content, per-channel text and SMS limit, overlap strategies, images and AI drafts, preview de-duplication, readiness, schedule validation, archive, cancel, **delivery results** (consent skips, isolated failure), **multi-role approval workflow** (submit → reject → reopen → approve → send → public page), schedule then cancel, permission checks |
| `bulletins.spec.ts`   | List, new, header fields and live preview, sections (add, organization, column, reorder, remove), **every rich-text toolbar button**, unsafe links refused, image alt text and QR codes, unsaved-changes guard, publish/copy link/unpublish, print, translations, delete confirm, contributor limits                                                                                                 |
| `admin.spec.ts`       | Users (validation, duplicates, create plus email, roles, email change, resend, reset link, set password then sign in, disable revokes API sessions, cancel), unit code rotation (old code stops working), organizations, provider credentials (no secrets shown), Facebook Page connect/disconnect, audit log filters and no secrets, coordinator access                                             |
| `units.spec.ts`       | Platform hierarchy view, create-form validation, duplicate code, create plus manage (path, placement, admin password, reset email, code change), stake and district scoping, ward cannot create units                                                                                                                                                                                                |
| `permissions.spec.ts` | **API authorization matrix** for every role and anonymous, public endpoints, no contact data in public responses, **tenant isolation**                                                                                                                                                                                                                                                               |
| `settings.spec.ts`    | Account page, validation, change email plus confirm from inbox, wrong or reused password, change password then sign in                                                                                                                                                                                                                                                                               |

## Known issues the suite documents

**Security tests that fail on purpose (red) until fixed:**

1. `PermissionsGuard` reads `@RequirePermission` only from the route method, so the **class-level** checks on `platform/wards`, `admin/units` and `audit` never run. Any signed-in user can list every tenant's admins and **reset another unit admin's password**. Fix: `reflector.getAllAndOverride(KEY, [context.getHandler(), context.getClass()])`. Affected tests: `permissions.spec.ts` (matrix) and `units.spec.ts` (stake and ward scoping).
2. `POST /auth/users/:id/disable` and `/enable` don't check the target user's ward, so one ward's admin can disable another ward's accounts (`permissions.spec.ts`, tenant isolation).

**Other bugs, marked `test.fail` with a reason.** Each test turns red once the bug is fixed, as a reminder to remove the marker:

- "Include inactive" and "Include archived" don't work on Directory, Audiences or Campaigns: the client sends `=false`, and `z.coerce.boolean()` reads `"false"` as `true`.
- Viewer is shown Campaigns, Bulletins, Audiences and Destinations, and each page then shows a raw "Missing required permission" error.
- A removed contact method still shows on the person page.
- Workflow tabs never hide their panels (`display: flex` overrides `hidden`).
- "Reopen as draft" drops audiences, channel text and overlap settings, so Submit fails.
- Possible bug, needs a product decision: destinations are pooled per campaign, so a member of an SMS-only audience is also queued for email.
- Two-factor codes can be reused within their 90-second window (RFC 6238 §5.2).
- Audit "Action contains" is an exact match.
- Facebook Page ids aren't validated as numbers.
- "Delete permanently" on an audience doesn't ask for confirmation.
- History timestamps are raw UTC, not the ward time zone (AGENTS.md convention).
- Cancelling a scheduled campaign leaves its schedule row active. Cosmetic: the worker still skips it.

Notes, not marked as bugs: public bulletins are cached for up to about 6 minutes, so "Unpublish" isn't instant for readers; a submitter can approve their own campaign; whitespace-only names are accepted.

## The live smoke suite

`playwright.config.ts` targets a deployed site. See the comments in `.env.example`. Some of its selectors (for example "New ward") predate the unit hierarchy and may need updating.
