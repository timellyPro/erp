# Product Readiness Gaps — Timelly

**Date:** 2026-10-08
**Goal:** run for tens of schools: scalable, reliable, self-running, 24/7.
**Relation to `PRODUCTION_READINESS.md`:** that report covers *code-level*
safety (tenant isolation, authz, validation, payments, tests) and it holds up.
This one covers what it explicitly left out: **deployment, operations,
monitoring, backups and automation.** Nothing here is deployed yet, so these
are all pre-launch gaps, not live incidents.

Target SLO: 99.9% monthly uptime, RPO <= 24h (aim for minutes with PITR),
RTO <= 1h, alert on failure within 5 minutes.

## P0 — must exist before the first school goes live

| # | Gap | Evidence | Fix |
|---|-----|----------|-----|
| 1 | **No error tracking / alerting.** A 500 or crash is invisible until a school complains. | No Sentry/Datadog/OTel anywhere in `lib/`, `app/`, `package.json`. `instrumentation.ts` only logs a missing env var. | Add Sentry (client + server + socket-server) and route alerts to phone/email. |
| 2 | **No uptime / health check.** | No `app/api/health` route; no external ping. | Add `/api/health` (DB + Redis ping, cheap), point UptimeRobot/BetterStack at it, plus one for the socket server. |
| 3 | **Backups are a local JSON dump.** `scripts/backup-db.js` writes to `./backups` on the dev machine, relies on Windows Task Scheduler, keeps 30 files, and has never been restore-tested. If the laptop dies, so do the backups. | `scripts/backup-db.js`, `backups/` | Use managed Postgres with PITR (Supabase paid plan / RDS). Keep a nightly off-site `pg_dump` to object storage. Do a restore drill and write down the steps. |
| 4 | **No deployment or migration runbook.** README is the create-next-app boilerplate. Nothing says how to apply `prisma migrate deploy`, set env vars, or roll back. No `.env.example`. | `README.md`, no `.env.example`, 60 migrations in `prisma/migrations` | Write `docs/DEPLOY.md` + `.env.example`; run migrations as a CI/CD step, not by hand. |
| 5 | **Socket server has no deployment home.** It is a standalone `new Server(PORT)` process; Vercel cannot host it. Realtime breaks silently if it is not deployed separately. | `socket-server/index.ts:27-38`, `vercel.json` has only crons | Deploy on Railway/Fly/Render (always-on, health-checked, auto-restart). Make the UI degrade gracefully when it is down. |
| 6 | **No staging environment / no deploy gate.** CI verifies but nothing deploys or promotes. | `.github/workflows/ci.yml` stops at `npm run build` | Staging project with its own DB; auto-deploy `main` -> staging, manual promote -> prod; keep Vercel instant rollback. |
| 7 | **`NEXTAUTH_URL` / `DATABASE_URL_TENANT` / `CRON_SECRET` must be set in prod.** Missing `DATABASE_URL_TENANT` makes every RLS route 500; missing `CRON_SECRET` silently disables cron (returns 401). | `instrumentation.ts`, `app/api/cron/fees-backup-email/route.ts:8-12` | Fail the deploy (or `/api/health`) if required env vars are absent. List them in `.env.example`. |

## P1 — needed to be "reliable" rather than "mostly works"

| # | Gap | Evidence | Fix |
|---|-----|----------|-----|
| 8 | **No React error boundaries.** An uncaught render error blanks the whole portal. | No `error.tsx`, `global-error.tsx` or `not-found.tsx` under `app/` | Add `app/global-error.tsx` and per-portal `error.tsx` with a retry button, reporting to Sentry. |
| 9 | **No end-to-end tests.** 1928 unit/route tests are strong, but nothing exercises login -> mark attendance -> pay fee in a real browser. | No `e2e/`, Playwright or Cypress | Add Playwright smoke tests for the 5-6 critical journeys; run on staging after each deploy. |
| 10 | **No load test.** Peak moments (morning attendance, fee deadline, results day) are unmeasured. | none | k6 script for those flows at ~10x expected load; check pooler, Redis and p95 latency. |
| 11 | **Heavy exports run inside serverless routes with no `maxDuration`.** Excel/PDF generation can hit the default timeout or memory limit on a big school. | `fees/export/fee-due-report`, `student/export-details`, `student/credentials`, `admissions/export`; 0 routes set `maxDuration` | Set `maxDuration`, stream or paginate, or move to a background job that emails/links the file. |
| 12 | **Rate limiting fails open to a per-instance in-memory map.** Under a Redis outage on multi-instance Vercel, limits are effectively per-instance. Documented tradeoff, acceptable, but login throttling is the one place worth failing closed. | `lib/rateLimit.ts` | Keep fail-open generally; for login only, fail closed or tighten the in-memory limit. |
| 13 | **Cron coverage is thin.** One cron (fee backup email, every 15 min). No scheduled DB backup, fee-reminder, session cleanup or stuck-payment reconcile. Failures of the existing cron are not alerted. | `vercel.json`, `app/api/cron/` | Add crons with failure alerts (Sentry Crons / healthchecks.io). Reconcile `PENDING` payments older than N minutes against the gateway. |
| 14 | **Dependency risk.** `npm audit`: 36 high (mostly dev-only); `xlsx` 0.18.5 has no fix. Already assessed as low residual risk. | `PRODUCTION_READINESS.md` addendum | Enable Dependabot; plan to drop client-side `xlsx` for `exceljs`. |

## P2 — product layer (not code reliability)

| # | Gap | Notes |
|---|-----|-------|
| 15 | **Self-serve school onboarding.** `school/create` and `school/update` were deleted as "dead", so the only way to create a tenant may be manual or via `superadmin/*`. Confirm that is intended and that provisioning a school is a repeatable, one-click superadmin action. |
| 16 | **Billing and plan enforcement.** `SystemSubscription` / `ParentSubscription` exist, but there is no obvious school-level plan, trial, invoice or suspend-on-nonpayment flow. |
| 17 | **Support + legal.** Status page, support email/WhatsApp, Terms, Privacy Policy, DPA, DPDP Act consent handling for minors' data, data export/deletion on request. |
| 18 | **Audit trail and per-tenant observability.** Log `schoolId` on every request so a school's problem can be found in seconds. |
| 19 | **Data retention policy.** Define how long student data, backups and logs are kept, and what happens when a school leaves. |

## Things that are already good (no action)

Tenant isolation (RLS + `requireSchoolId` + static check in CI), payment
webhook idempotency, zod validation, error sanitization, secrets hygiene,
structured logger, CI pipeline (tsc, lint, isolation check, 1928 tests, build),
`schoolId` indexes on all 28 tenant tables, PgBouncer-aware pool sizing.

## Suggested order of work

1. **Week 1 (observability + safety net):** #1 Sentry, #2 health + uptime, #7 env validation, #8 error boundaries.
2. **Week 1-2 (infrastructure):** #3 managed DB + PITR + restore drill, #4 deploy doc + `.env.example`, #5 socket server host, #6 staging.
3. **Week 2-3 (confidence):** #9 Playwright smoke tests, #10 load test, #11 export hardening, #13 crons + alerts.
4. **Before school #2:** P2 items, starting with #15-#17.

## Items I cannot verify from the repo

Which hosting/DB plan you intend to use, whether the Supabase project has
PITR, the real payment-gateway behaviour in production mode, and whether any
external client (mobile app) calls the 14 deleted routes.
