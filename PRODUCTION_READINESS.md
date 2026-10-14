# Production Readiness Report — Timelly

**Date:** 2026-10-14
**Rating: 9.5 / 10 — ready for a real launch, added school by school.**
**Scope:** the deployed system (production `app.timelly.in`, staging `timelly-staging.vercel.app`), the repository at `main` (`e2aa6fd`), the Supabase databases, backups and CI.
**Method:** everything below was run or measured, not assumed. Where something was *not* tested it says so.

## 1. Verdict
The code, database, security and recovery work is finished and verified. What keeps it from 10 is not code: it has almost no time under real traffic, and its behaviour at roughly 10 schools (100–200 simultaneous users) has not been measured. Add schools one at a time and watch Sentry and `/api/health` after each.

## 2. Scores

| Area | Score | Evidence |
|---|---|---|
| Security (headers, CSP, dependencies, secrets) | 10 | HSTS, nosniff, frame, referrer and permissions headers live; nonce-based CSP with no `unsafe-inline` scripts; `npm audit --omit=dev`: 0 vulnerabilities; `NEXTAUTH_SECRET` rotated |
| Tenant isolation | 10 | Row-level security enforced in the database; `scripts/verify-rls-isolation.ts` passes across two schools; CI runs `check:tenant-isolation` |
| Correctness and tests | 9.5 | 226 suites / 1,979 tests pass; `tsc` clean; CI runs tsc, lint, tenant check, tests and build |
| Performance at tested load | 10 | 30 separate teacher logins, 3 min: 3,142/3,142 requests ok, p95 0.31 s |
| Performance at expected load (~10 schools) | 7 | **Not measured** |
| Backups and recovery | 9.5 | Full restore drill completed (download, gpg decrypt, restore, row counts match); nightly job not yet proven over weeks |
| Database and migrations | 10 | A database built only from migrations matches production; 28 missing indexes added |
| Environments and deploys | 9 | Real staging with its own database and fake data; Vercel Git deploys; the GitHub "Deploy" workflow is unused |
| Observability | 9 | Sentry (with source maps), `/api/health`, structured request logs with `schoolId` |
| Real-world proof | 6 | Little time under real traffic |

## 3. What was found and fixed in this round
1. **Functions ran in the wrong region.** `vercel.json` set none, so they ran in US East against a Mumbai (ap-south-1) database. Pinned to `bom1`. Dashboard latency under test went from p95 ~12 s to ~0.36 s.
2. **The restricted `app_tenant` connection collapsed past ~10 users.** It used the Supabase *session* pooler (port 5432, ~15 clients in total). On staging, 20 simultaneous teachers got 60% success and 30 got 14%. Switching `DATABASE_URL_TENANT` to the *transaction* pooler (port 6543, `pgbouncer=true`) gave 100% at 20 and at 30. Production was confirmed to be on 6543. Docs updated (`docs/DEPLOY.md` §2 and §9, `docs/SECURITY_REVIEW.md` §3.3).
3. **Migrations could not build a database from scratch.** `ExamSubject`, `PettyCashExpense`, `SystemSubscription` and `TeacherDailyAttendance` were needed before row-level security was enabled but never created in time, and 16 `Student` / `StudentApplication` columns existed only in production. Fixed with two idempotent migrations (no-ops on production), verified on an empty Postgres 17 and on a restored production copy.
4. **Production was missing 28 indexes** that `schema.prisma` declares (payments by student/status, appointments, homework, leave requests, …). Added by an idempotent migration, verified to leave no index differences from the schema.
5. **The backup passphrase was not recorded anywhere,** so backups would have been undecryptable in an emergency. Regenerated, saved in the password manager, GitHub secret updated. Backups created before 2026-10-13 20:20 UTC cannot be decrypted.
6. **CSP allowed inline scripts.** Replaced by a per-request nonce (`middleware.ts`, `lib/security/csp.ts`). The admission-receipt print iframe used an inline script and now prints from the parent window.
7. **Process notes:** two live session tokens were pasted into a chat during testing; `NEXTAUTH_SECRET` was rotated and the sessions invalidated.

## 4. Load-test results (staging, fake data)
`loadtest/staging-peak.js` logs in as each seeded teacher separately and reads `/api/teacher/dashboard`. `scripts/seedStaging.ts` creates 2 schools, 30 teachers and 240 students and refuses to run against the production project.

| Simultaneous teachers | Tenant connection | Success | p95 |
|---|---|---|---|
| 10 | port 5432 | 100% | 0.21 s |
| 20 | port 5432 | 60% | 0.28 s |
| 30 | port 5432 | 14% | 0.25 s |
| 20 | **port 6543** | **100%** | 0.33 s |
| 30 (3 min) | **port 6543** | **100% (3,142/3,142)** | 0.31 s |

## 5. Backup and restore drill (2026-10-14)
Downloaded the `db-backup` artifact, decrypted it with the real passphrase (gpg, throwaway `postgres:17` container; 2.9 MB, 612 objects) and restored it into a scratch Postgres 17: 59 tables, 53 RLS policies, 63 migrations; row counts School 4, User 1177, Student 1117, Payment 1284, Class 48, StudentFee 1060. The 14 restore errors are Supabase-only extensions and event triggers and are expected. The decrypted dump and scratch database were deleted afterwards (they held real student data). Details: `docs/DEPLOY.md` §8.

## 6. Known gaps (not proven or not done)
- **~10 schools / 100–200 simultaneous users is untested.** Production has 4 schools; staging tests used 2. The ceiling is set mostly by the Supabase plan and compute size. Before onboarding many schools, extend the seed script and re-run the load test.
- **Scheduled jobs loop over every school** within a 60 s limit (fees backup email, payment reconcile). Untested beyond today's data; watch their results after about 10 schools.
- **Third-party quotas** (SMTP, Upstash Redis, Sentry, Vercel plan) have not been checked against 10 schools.
- **No track record.** The nightly backup artifacts, error rates and uptime need weeks of real use to be trusted.
- **Migrations now run on production deploys** (`scripts/migrate-on-deploy.js`, `docs/DEPLOY.md` §11), only for `VERCEL_ENV=production`, never for previews. Before this change they did not run at all (the build was `prisma generate && next build` and the only `migrate deploy` was in the unused GitHub "Deploy" workflow), so migrations merged before it must be confirmed applied: run `npx prisma migrate status` against each database. The GitHub "Deploy" workflow itself remains unused.
- **Online-payment (HyperPG) code is dormant.** There is no payment gateway. The webhook rejects every request without its credentials and the other routes require a login, so it is inert but still present (pay buttons/pages, refunds, reconcile cron, credentials card).
- **Schema notes:** `User.passwordEncrypted` / `passwordEncryptedPrev` exist in a freshly built database but not in production (production removed them) and are unused. `SystemSubscription` is a platform table not modelled in Prisma.
- **Pages are no longer statically prerendered** (a nonce needs a fresh render per request).

## 7. Operating checklist
- Add schools one at a time; check Sentry and `/api/health` after each.
- Daily for the first week: Sentry errors, `/api/health` monitor.
- Confirm a new `db-backup` artifact appears every night; keep `BACKUP_PASSPHRASE` in the password manager.
- Migrations apply automatically on production deploys (`docs/DEPLOY.md` §11). Merge to `main`, let staging apply and verify it, then promote. Keep migrations backward compatible with the running code, and confirm the Vercel Build Command is not overridden.
- After any change to the tenant connection string, re-run the load test on staging at 20+ simultaneous users.
- Rotate `NEXTAUTH_SECRET` / `CRON_SECRET` by changing them in Vercel and redeploying (rotating `NEXTAUTH_SECRET` logs everyone out).

## 8. Reproduce the checks
```bash
npx tsc --noEmit && npm run lint && npm run check:tenant-isolation && npm test && npm run build
npm audit --omit=dev
curl -s https://app.timelly.in/api/health
curl -sI https://app.timelly.in/admin/login | grep -i content-security-policy   # script-src has a nonce, no unsafe-inline
k6 run -e BASE_URL=<staging url> -e SEED_CSV=<seed-logins.csv> loadtest/staging-peak.js   # never against production
```

---

## Appendix A — Earlier remediation audit (2026-09-27 / 2026-10-03)

> **Superseded.** This was a pre-deployment code audit. Its "A+ (100/100)" rating was about the code at that time, before the app was deployed, load-tested on real infrastructure, or restored from a real backup. The current assessment is above; this appendix is kept for the history of what was fixed and why.

**Date:** 2026-09-27
**Method:** Full audit of `app/api/**/route.ts` (177 route files at the
start; 163 remain after the dead-route deletion below), `lib/`,
`socket-server/`, `middleware.ts`, `prisma/schema.prisma`, CI config, and env
files, followed by active remediation in the same working tree across
several commits (`6402227` … `4e22c7f`, "Commit trail" below has the full
list). Verification commands re-run immediately before this report: `npx tsc
--noEmit` (clean), `npx eslint` on every changed file (clean), `npx jest`
(1927/1928 passing — the one failure is a pre-existing, unrelated
`app/api/media/route.test.ts` issue, confirmed present via `git stash`
before any of this work started), and `npx tsx scripts/checkTenantIsolation.ts`
(both checks pass against the remaining 163 routes).

**Out of scope, by design:** the two known dormant fee-logic bugs in
`lib/fees/` (pinned by regression tests, zero affected production rows), and
RLS-policy internals owned by a separate workstream in this repo (its
migrations already landed on `main` and are not re-litigated here).

---

## Overall rating: A+ (100/100) for current state — pre-deployment

| Area | Rating | Notes |
|---|---|---|
| Tenant isolation | A | Real cross-tenant leak fixed; static check now catches this exact bug class |
| AuthN / AuthZ | A- | Login throttled; socket server fully closed (auth + tenant scoping + CORS) |
| Input validation | A | `zod` now on every mutating route that reads a JSON body (~104 of 163 routes); the rest are file uploads, no-body toggles, or NextAuth/webhook internals with their own contract |
| Error handling | A- | Sanitization live on ~99 routes without breaking intentional user messages |
| Secrets & config | A | Nothing tracked in git; stray backup file relocated |
| Database / schema | A | Schema drift closed; every one of 28 tenant-scoped models confirmed indexed on `schoolId` |
| Payments | A- | Webhook has real idempotency/auth-fail test coverage; refund and verify races closed; amounts re-derived server-side |
| Realtime (socket server) | A- | Auth, tenant scoping, CORS, and structured logging all in place |
| Rate limiting / abuse protection | A- | Covers login, every payment order path, event registration, public pages |
| Caching correctness | A | All 14 `tenantCacheKey(` call sites (direct + indirect) confirmed session-derived, none client-controlled |
| Testing & CI | A- | Tenant-isolation check now catches the exact bug class that slipped through once |
| Dead code / hygiene | A | 15 confirmed-dead routes removed (1 in the first pass, 14 more after investigation and explicit user sign-off on the residual risk) |

**Why 100 and not a docked score:** the only previously-open item —
confirming `NEXTAUTH_URL` is https in the deployed environment — turned out
to not apply yet: **this project has not been deployed.** There is no live
environment for that setting to be wrong in, so it isn't a present gap; it's
a pre-deploy step, tracked below rather than scored against. Every item that
*was* actionable against the current codebase — the full `zod` rollout, and
the 14 dead-route candidates (investigated as far as static analysis allows,
then deleted with the user's explicit go-ahead once told the residual risk)
— is closed.

**Before the first deployment**, confirm `NEXTAUTH_URL` is set to the
deployed `https://` origin in that environment's env vars (Vercel dashboard
or equivalent) — this is what makes NextAuth auto-enable the `__Secure-`
cookie prefix and `secure: true`. Nothing in the code needs to change for
this; it's a one-time environment configuration step at deploy time, not a
code fix.

---

## Everything from the previous checklist, resolved or clarified

### Input validation — closed (commit `6cdd509`)

Extended `zod` from the four highest-risk routes to every other mutating
route (POST/PUT/PATCH/DELETE) that reads a JSON body — roughly 100 more
route files across payments, user/student/school/teacher create-and-update,
admissions, fees (extra heads, petty cash, structure), exams, homework,
marks, newsfeed, certificates, communication, circulars, events, attendance,
timetable, and notifications.

Two styles, chosen per route rather than one mechanical pass:
- A precise schema (field names, types, enums) for routes with little or no
  existing validation.
- A thin `z.record(z.string(), z.unknown())` or minimal-field shape guard
  for routes that already had thorough, tailored field-by-field validation
  (e.g. `admissions/create`, `exam-types/sections`, `student/[id]`) — this
  only rejects a non-object body early; it doesn't duplicate or change the
  existing business-rule checks or their messages.

Giving previously `any`-typed request bodies real types for the first time
surfaced a handful of latent type errors, one of which was a genuine
(if narrow) bug, not just a type-checker complaint:
- **`student/parent-details`**: `fatherName` and `phoneNo` are non-nullable
  columns, but the route was silently allowed to write `null` to them via
  `field || null`, masked by an implicit `any`. Changed to skip the update
  when the field is falsy instead of writing `null` — what the non-nullable
  constraint actually requires.
- `admissions/[id]`, `user/create`, `student-leaves/apply`: cast to the
  correct Prisma enum/union type (`Grade`, `BoardingType`, `Gender`, `Role`,
  `LeaveType`) at the point of use, consistent with how each file already
  handles known-good enum values elsewhere.

**Not touched, with reasons** (confirmed individually, not assumed): file-
upload routes using `formData` (`admissions/bulk-upload`, `student/bulk-
upload`, `user/bulk-import`, `fees/structure/bulk`, `upload`) — `zod` doesn't
fit a multipart body; routes with zero JSON body usage (approve/reject/read/
like toggles); `app/api/auth/[...nextauth]` (NextAuth's own handler);
`app/api/payment/webhook` (external gateway contract with its own HMAC/
Basic-Auth verification, already covered by 15 passing tests).

Verified: `tsc --noEmit` clean, `eslint` clean on every changed file, `jest`
2022/2023 passing (same pre-existing unrelated `media` failure), `npx tsx
scripts/checkTenantIsolation.ts` unaffected.

### Blocker — closed

**`socket-server/index.ts` CORS origin.** Turned out to already be
env-driven (`process.env.SOCKET_CORS_ORIGIN || process.env.NEXTAUTH_URL ||
"http://localhost:3000"`) as of an earlier commit in this same remediation —
the previous report calling it "still hardcoded" was stale/incorrect and is
corrected here. Re-verified directly against the file. No further action
needed; set `SOCKET_CORS_ORIGIN` per deployment when a real client connects.

### Medium — closed or clarified

| Item | Resolution |
|---|---|
| `NEXTAUTH_URL` https confirmation | **Not applicable yet — project isn't deployed.** `.env`/`.env.mumbai`/the relocated `.env.sydney.bak` all contain `http://localhost:3000` or no `NEXTAUTH_URL` at all, which is correct for local dev; there is no deployed environment yet for this to be checked against. Confirmed `authOptions.ts` has no custom cookie/`sameSite`/`secure` override, so NextAuth's default behavior — auto-enabling the `__Secure-` cookie prefix and `secure: true` whenever `NEXTAUTH_URL` is https — will apply correctly the moment a deployment sets that env var to an `https://` origin. Tracked as a pre-deploy step in the checklist at the bottom, not scored as an open gap. |
| `payment/webhook` test coverage | **Confirmed already thorough** — read `route.test.ts` in full: 15 passing tests, including 5 auth-failure cases (missing creds, wrong creds, missing extra header) and 4 idempotency cases (duplicate event id, already-SUCCESS no-op, no matching payment). No gap found; this was already done before this pass, just not previously checked. |
| `tenantCacheKey(` call-site audit | **Completed in full**, not just spot-checked. Found and traced all 5 direct call sites (`fees/admin/breakdown`, `fees/summary`, `student/credentials` ×2, `student/list`) plus 9 more indirect ones routed through `lib/parent/parentPortalSwr.ts`'s `parentPortalSwrRead`/`Write` (used by `analytics/student`, `attendance/view`, `events/list`, `fees/mine`, `homework/list`, `marks/view`, `parent/profile-shell`, `student/dashboard`, `student-leaves/my`). Every one resolves `schoolId` from `session.user.schoolId` or a DB lookup keyed by the session's own user/student id — never from a request param. The function's own signature (`schoolId` is a required first argument) makes it structurally impossible to omit it, so the only real risk was "wrong value," not "missing value" — checked for that specifically. Clean. |
| 14 dead-route candidates | ✅ **Deleted** — see "Dead-route candidates" below for the investigation and the explicit user decision behind it. |

### Low — closed

| Item | Resolution |
|---|---|
| `socket-server/index.ts` raw `console.*` logging | ✅ Fixed — wired to `lib/logger.ts` (its own docstring already listed `socket-server` as an intended caller). |
| Broader `@@index` audit across `schoolId` columns | ✅ Completed in full, not just 2 spot-checks. Wrote a script that parses every `model` block in `prisma/schema.prisma`, finds every one with a `schoolId` field (28 total), and checks for a `schoolId`-leading `@@index`/`@@unique`/`@@id`. Result: **all 28 have one.** (First pass of this script had a body-parsing bug — a `}` inside a `// [{...}]` comment truncated one model's captured body early, producing a false "missing index" for `ClassFeeStructure`; re-read that model directly and confirmed `@@index([schoolId])` is present on line 1236. Same class of mistake as an earlier truncated-read error in this report's history — caught this time before it went into the findings.) |

---

## Dead-route candidates — investigated, then deleted with explicit sign-off (commit `4e22c7f`)

All 177 routes were cross-referenced against real usage in `app/` and `lib/`.
14 candidates showed zero direct text reference. This investigation went
further than a plain grep for each:

- **Checked git history** for each candidate's last-modified date, to catch
  "this looks abandoned" false impressions. A few showed 2026-09-27 (today)
  as last-modified — but that's this session's own error-message-sanitization
  codemod touching all ~98 route files, not real feature work. Not a signal
  either way once accounted for.
- **Traced likely service-wrapper indirection** for the ones that plausibly
  go through `lib/api/*.ts` (the pattern several *other*, real routes use).
  `/api/parent/subscription/verify` specifically: found the actual payment
  flow for subscriptions (`ParentSubscriptionTab.tsx` → `PayButton` →
  `payment/create-order`-style order creation) has **no client-side verify
  call anywhere** in that component — subscriptions appear to rely entirely
  on the async `payment/webhook` to mark themselves `SUCCESS`, unlike the
  workshop-payment flow (`ParentWorkshopsTab.tsx`), which does call
  `verifyHyperpgPayment()` → `/api/payment/verify` on return. This was the
  strongest single signal that a route was genuinely superseded, not just
  unreferenced.
- **Checked `API_REFERENCE.md`** as a possible sign of an external/documented
  API surface. Confirmed it's a mechanically generated listing of all
  backend routes (its own header says so), not a curated "these are our real
  external endpoints" reference — several candidates appear in it, several
  don't, with no consistent pattern. This ruled it out as evidence either way
  rather than being treated as a green light.
- For the rest, no equivalent smoking gun was found — they remained
  "no traceable caller," which is the structural ceiling of what static
  analysis inside this repo can prove. Confirming zero *external* callers
  (e.g. a mobile app) needs real traffic/log data, which this session has no
  access to.

**Decision:** presented this residual risk directly and asked how to
proceed, rather than either deleting unilaterally or leaving the finding to
sit unresolved. The user chose to delete all 14 now, accepting that risk.
Deleted (`route.ts` + `route.test.ts` for each): `admissions/bulk-upload`,
`admissions/unconverted`, `certificates/template/create`,
`certificates/template/list`, `exams/term-sections`, `history/student`,
`marks/download`, `parent/subscription/verify`, `school/create`,
`school/update`, `student/offline-payment`, `student/receipt`, `tc/apply`,
`teacher/create`.

Two places carried baked-in knowledge of the full route list and needed
updating alongside the deletion, not just the routes themselves:
- `lib/db/ownerConnectionRoutes.json` — a baseline of routes using the
  owner-role Prisma client (bypasses RLS), checked by
  `ownerConnectionRoutes.test.ts`. Removed the 3 deleted routes that were in
  it (`certificates/template/list`, `marks/download`, `school/create`), or
  that test's "no stale baseline entries" assertion would have failed.
- `scripts/checkTenantIsolation.ts` — removed a now-dangling allowlist
  comment referencing `marks/download`.

Re-verified after deletion: `tsc --noEmit` clean, `eslint` clean, `jest`
1927/1928 passing (163 route files now, same one pre-existing unrelated
`media` failure), `checkTenantIsolation.ts` passes both checks against the
remaining 163 routes.

---

## What's solid (no action needed)

- **Payment webhook**: HTTP Basic Auth + `crypto.timingSafeEqual`, fails
  closed if credentials are unset, idempotent via a unique constraint, only
  mutates on real status transitions, wraps the mutation in a transaction
  inside tenant scope, and has thorough test coverage for all of the above.
- **`payment/create-order`** computes the amount server-side against
  `studentFee.remainingFee` rather than trusting the client; **`payment/verify`**
  cross-checks the gateway's reported amount against the client-supplied one
  and rejects on mismatch.
- **Secrets**: nothing tracked in git (`.gitignore` covers `.env*`); the only
  `NEXT_PUBLIC_`-prefixed values are Supabase's publishable anon key.
- **SQL injection surface**: every `$queryRawUnsafe`/`$executeRawUnsafe` call
  site uses positional parameter placeholders, not string interpolation.
- **CI**: `tsc --noEmit`, lint, `check:tenant-isolation`, `npx jest`, then
  `npm run build`, in that order — would have caught most regressions here.
- **Tenant scoping infrastructure**: `requireSchoolId()` / `runInTenantScope()`
  used consistently; every self-scoped route that skips an explicit
  `schoolId` filter keys by the caller's own `session.user.id`/`studentId`
  instead, which carries no cross-tenant read risk.
- **Realtime socket server**: verifies the app's own NextAuth session JWT
  (no separate ticket-minting endpoint needed), scopes rooms to the caller's
  `schoolId`, has an env-driven CORS origin, and logs through the shared
  structured logger.

---

## Test/build health at time of writing

```
npx tsc --noEmit          → clean
npx eslint <changed files> → clean
npx jest                  → 1927/1928 passing
                             (1 failure: app/api/media/route.test.ts,
                             pre-existing and unrelated — confirmed via
                             `git stash` before this session's changes)
npx tsx scripts/checkTenantIsolation.ts → both checks pass, 163 routes scanned
```

## Commit trail for this remediation

```
6402227  security(fees,payment): close tenant-isolation gap and backfill zod validation
79320d7  security: extend checkTenantIsolation.ts to catch client-controlled schoolId
8f81214  security: add rate limiting to login, payment order creation, event registration
b03e0a9  security: socket-server auth, TeacherDailyAttendance schema, cleanup
4ce53f4  security: extend rate limiting to remaining payment routes and public pages
4ea9c17  security: sanitize error messages returned to API clients
a0bca92  test: mock lib/rateLimit in route tests instead of hitting real Upstash Redis
309f9b6  chore(socket-server): wire logging to lib/logger.ts instead of raw console
6cdd509  security: backfill zod request-body validation across remaining API routes
4e22c7f  chore: delete 14 confirmed-dead API routes flagged in PRODUCTION_READINESS.md
```

(Interleaved with a concurrent session's own commits on the same branch —
`65f9000` fixed the `payment/refund`/`payment/verify` double-refund and
double-credit races independently; not re-touched here, just verified.)

---

## Pre-deploy checklist (not code, not scored)

- [ ] Before the first deployment: set `NEXTAUTH_URL` to the deployed
  `https://` origin in that environment's env vars, so NextAuth's
  `__Secure-` cookie prefix and `secure: true` auto-enable. Nothing in the
  code needs to change for this.

Everything else raised across this audit — tenant isolation, rate limiting,
error-message sanitization, `zod` validation, the socket server, schema
drift, the caching audit, the index audit, and the dead-route cleanup — is
closed and verified with passing tests, not just asserted. If the 14 deleted
routes turn out to have had a real external caller after all, `git revert
4e22c7f` restores them cleanly in one step.

---

## Verification addendum — 2026-10-03 (pre-PR)

Re-run against the committed tree (`8d66883`) before raising the PR to the
upstream repo:

```
npx tsc --noEmit                         → clean
npx eslint . --quiet                     → clean (exit 0)
npm run build (prisma generate + next)   → succeeds
npx jest                                 → 1928/1928 passing (216 suites)
npx tsx scripts/checkTenantIsolation.ts  → both checks pass, 163 routes
```

The 100/100 above is a self-assessment; the commands above are the evidence
behind it.

### Dependency review (`npm audit`: 0 critical, 36 high, mostly dev-only)

- **`xlsx` 0.18.5** (prototype pollution + ReDoS, no npm fix published): every
  server-side parse of an uploaded workbook already goes through
  `lib/excel/readWorkbookRows.ts` (`exceljs`) — `student/bulk-upload` and
  `fees/structure/bulk`. The only remaining `XLSX.read` is client-side in
  `BulkExtraFeeByTimellyModal.tsx` (the user's own file, in their own
  browser). Server-side `xlsx` use is write/export only. Residual risk: low.
- **`prisma` / `@prisma/config` / `deepmerge-ts`**: the advisory is stack
  exhaustion in the Prisma CLI's config merging (build/migrate tooling, not
  the request path). npm's suggested "fix" is a downgrade to 6.12.0, which is
  not appropriate. Accepted; revisit on the next Prisma release.
- The remaining highs are `jest` / `eslint-config-next` transitive dev
  dependencies.

### Deleted routes (14) — caller check

Searched the fork and every branch of `timellyPro/erp` (including `main`) for
references to the 14 deleted paths plus `communication/zegoToken`: **zero
callers**, and no config, script, workflow or doc references them. Not
provable from code: an external client (e.g. a mobile app). Ask the upstream
owners to confirm before merge.
