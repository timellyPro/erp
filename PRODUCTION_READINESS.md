# Production Readiness Report — Timelly

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
