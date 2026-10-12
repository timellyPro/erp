`# Security Review — Phase 6 (2026-09-23)
`
`Scope: (1) the "fail open to stale JWT on DB error" tradeoff in auth, and
`(2) an audit of the RLS/tenant-isolation model against real cross-tenant
`attack scenarios. This follows Phase 4 (architecture normalization),
`which is complete.
`
`## 1. Fail-open JWT sync — is it still the right call?
`
`**Location**: `lib/auth/authOptions.ts`, `jwt` callback.
`
````js
`const shouldSyncFromDb = (() => {
`  if (!token.id) return false;
`  const stale = Date.now() - (token._dbSyncAt ?? 0) > 5 * 60 * 1000;
`  const missingCritical = token.schoolId == null || token.allowedFeatures == null;
`  return stale || missingCritical;
`})();
`
`if (shouldSyncFromDb && token.id) {
`  try {
`    const dbUser = await prisma.user.findUnique({ where: { id: token.id }, select: {...} });
`    if (dbUser) { /* refresh token.schoolId, allowedFeatures, image, schoolIsActive; token._dbSyncAt = Date.now() */ }
`  } catch (error) {
`    console.error("jwt_db_sync_failed", ...);
`    // returns the OLD token unchanged — no rethrow
`  }
`}
````
`
`**Status (2026-09-24): both gaps below are now closed in `lib/auth/authOptions.ts`.** The sync refreshes `role`, throws `account_deactivated` when `password` is null, and fails closed with `session_stale_ceiling_exceeded` after `MAX_STALE_SESSION_MS` (60 min) without a successful sync (covered by `lib/auth/authOptions.test.ts`). The analysis below is the original finding, kept for context.
`
`**What's stale, and for how long**:
`- `schoolId`, `allowedFeatures`, `photoUrl` can lag the DB by up to 5
`  minutes under normal conditions, and by the full duration of a DB
`  outage if the sync keeps failing (`_dbSyncAt` isn't advanced on
`  failure, so it keeps retrying every request but never succeeds until
`  the DB recovers).
`- `role` is **never** re-synced after login at all — a role change or
`  downgrade only takes effect on the user's next login or JWT expiry.
`- Account deactivation (`password: null`) is checked only in `authorize()`
`  at login — an existing session for a deactivated user keeps working
`  until the JWT expires, DB outage or not.
`
`**Verdict: still the right call, with two gaps worth closing.**
`
`The core tradeoff is sound: an auth-layer exception should not turn a
`transient DB blip into a full outage for every logged-in user across
`every tenant. Swallowing the sync failure and continuing with the
`existing token is the standard "availability over freshness" choice for
`this kind of best-effort cache refresh, and 5 minutes of staleness on
``schoolId`/`allowedFeatures` is a reasonable bound in the common case.
`
`Two things are worth fixing, independent of RLS:
`
`1. **No staleness ceiling during an outage.** If the DB stays down for an
`   hour, a user whose `schoolId` or `allowedFeatures` changed at the
`   start of that hour keeps their old permissions for the full hour, not
`   just 5 minutes. Consider tracking the number of consecutive sync
`   failures (or the age since the *last successful* sync) and forcing
`   re-authentication past some hard ceiling (e.g. 30–60 min), rather than
`   trusting a token indefinitely just because the DB is unavailable.
`2. **Deactivation and role are never re-checked outside login.** A
`   SUPERADMIN or SCHOOLADMIN demoted mid-session, or a user deactivated
`   mid-session, keeps full access until their token naturally expires.
`   If session lifetime is long (check `session.maxAge` in
`   `authOptions.ts`), this is a meaningful window. Recommend adding
`   `isActive`/`role` to the periodic sync payload (already fetching the
`   user row; cheap to include) — that closes both gaps with the existing
`   fail-open shape intact, since the sync already has its own error
`   handling.
`
`Neither gap changes the fail-open decision itself — they tighten what
`gets trusted while the sync is working, and how long the app trusts a
`sync that stopped working.
`
`## 2. RLS / tenant-isolation audit — critical finding
`
`**RLS as currently configured provides no tenant isolation.**
`
`Migrations `20260923042848_enable_rls_public_tables` and
``20260923043530_enable_rls_prisma_migrations` run
``ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` on ~50 tables, but attach
`**zero policies**. The migration's own comment is explicit about scope:
`this was done purely to silence Supabase's security advisor for its
`auto-generated PostgREST/GraphQL API, which this app never uses — all
`reads/writes go through Prisma using the table-owning role. In Postgres,
`the owning role bypasses RLS by default regardless of whether RLS is
`enabled or how many policies exist. There is no `SET app.current_school_id`,
`no `current_setting()` call, and no per-connection tenant context
`anywhere in the codebase (confirmed by grep across `.ts`/`.sql`).
`
`**Real isolation is 100% application-level**: every route handler must
`call `requireSchoolId(session)` (`lib/auth/tenant.ts`) and thread that
`value into every Prisma `where` clause. This includes ~12 route files
`that use `$queryRaw`/`$executeRaw`/`$executeRawUnsafe` (e.g.
``app/api/chairman/dashboard/route.ts`, `app/api/exam-subjects/route.ts`,
``app/api/fees/discount-approvals/route.ts`) — spot-checked, and these do
`correctly parameterize `schoolId` into the raw SQL, but there is **no
`database-level backstop** if a future raw query, or a future Prisma call,
`omits it.
`
`### Attack scenarios
`
`| Scenario | Currently blocked by | Residual risk |
`|---|---|---|
`| Authenticated SCHOOLADMIN of School A requests `/api/student/list?schoolId=B` (tampered param) | Only if the route ignores the client-supplied `schoolId` and uses `requireSchoolId(session)` instead | **Route-by-route**: any handler that trusts a body/query `schoolId` over the session-derived one is exploitable. Not systematically enforced — needs an audit pass (see recommendation below) or a lint rule. |
`| A new route/query added later forgets the `schoolId` filter entirely | Nothing — no DB-level check exists | High: this is a straightforward regression risk with zero automated detection today. |
`| A raw SQL query (`$queryRaw`) is added without the `schoolId` predicate | Nothing | Same as above, plus raw SQL is easier to get subtly wrong (e.g. a `JOIN` that reintroduces unscoped rows). |
`| Compromised app server / stolen DB credentials used directly (bypassing the Next.js app) | Nothing — Prisma's role has full cross-tenant read/write by design | This is normal for a single-tenant-DB SaaS without DB-enforced RLS; only relevant if the threat model includes "attacker with DB credentials but not app code," which is a different tier of compromise. |
`
`### Recommendation
`
`This is a materially weaker isolation model than "DB-enforced RLS," and
`the plan phrasing ("audit the new RLS policies") assumed policies exist
`that don't. Two paths forward, not mutually exclusive:
`
`1. **Cheap, do first**: add a test/lint safety net for the isolation the
`   app already relies on — e.g. a script that greps every
`   `app/api/**/route.ts` touching a tenant-scoped model and asserts it
`   calls `requireSchoolId`/uses `schoolId` in its Prisma calls, or
`   integration tests per tenant-scoped route that assert a School-A
`   session cannot read School-B rows (create two seeded tenants in test
`   setup, assert 403/404/empty result). This directly tests the actual
`   enforcement mechanism instead of a DB feature that isn't wired up.
`2. **Bigger lift, optional**: implement genuine DB-level RLS — have
`   Prisma connect as a non-owning role for request-scoped queries, add
`   `SET LOCAL app.current_school_id = ...` per request/transaction, and
`   write a real policy per tenant-scoped table
`   (`USING ("schoolId" = current_setting('app.current_school_id')::int)`).
`   This is a real architectural change (connection/role management,
`   transaction wrapping every request), not a follow-up migration — size
`   it separately if the team decides the defense-in-depth is worth it.
`
`Until one of these lands, tenant isolation depends entirely on every
`current and future route handler remembering to filter by `schoolId`.
`That's the single most important fact to carry into future work on this
`codebase — recorded here and in [`CLAUDE.md`](../CLAUDE.md).
`
`## 3. Real DB-level tenant isolation — rollout status and decisions
`
`**Mechanism.** Routes run their queries on a second Prisma connection that uses the
`restricted `app_tenant` Postgres role (`DATABASE_URL_TENANT`), inside one transaction
`with `app.current_school_id` set (`lib/db/tenantClient.ts`). RLS policies (migrations
``20260923104652_*`, `20260923105153_*`) then restrict every read and write to that school,
`independent of the `schoolId` in application `where` clauses. Verified live: a connection
`with no context sees 0 rows; a school-A-scoped connection asking for school B sees 0 rows.
`
`Two entry points:
`
`- `withTenantScopedClient(schoolId, tx => ...)` — explicit `tx`, used by the simple routes.
`- `runInTenantScope(schoolId, fn)` + `tenantDb` (`lib/db/tenantContext.ts`) — request-scoped
`  (AsyncLocalStorage) so shared helpers in `lib/*` need no `tx` plumbing. Outside a scope
`  `tenantDb` falls back to the owner client (scripts, cron, unmigrated callers).
`  `tenantDb.$transaction` joins the scope's transaction.
`
`**Status.** 106 of 178 route files use a tenant scope (reads and, where safe, writes);
`11 are `superadmin/*`.
`
`**Decision — superadmin cross-tenant carve-out.** SUPERADMIN endpoints stay on the
`owner-role connection. They are cross-tenant by definition, the owner role already bypasses
`RLS, and adding a BYPASSRLS role or an `app.is_superadmin` policy branch would create a
`second, broader credential and a policy path every tenant table would have to honour.
`The carve-out is instead made explicit and auditable: `superadmin/*` routes, plus a small
`set of routes with a genuine unscoped path, use the owner client directly or
``runInOptionalTenantScope(null, ...)`. `lib/db/ownerConnectionRoutes.test.ts` keeps a
`baseline of routes importing the owner `prisma` and fails when a new one appears.
`Consequence: a compromised SUPERADMIN session, or the owner DB credential, is still
`cross-tenant — RLS protects tenant users from each other, not from the platform operator.
`
`**Known limits.**
`
`- One scope = one transaction: queries run serially, the shared prisma extension's read
`  collapsing does not apply, and the transaction is capped at `TENANT_SCOPE_TIMEOUT_MS`
`  (default 30s; bulk routes use 120s). Time heavy fee/analysis routes on production-sized data.
`- A failed statement aborts the whole Postgres transaction, so write handlers that catch
`  DB errors (`P2002`/`P2025`) and carry on were NOT wrapped. They stay on the owner connection.
`- Tables with RLS enabled but no policy return 0 rows to `app_tenant`: `PaymentWebhookEvent`,
`  `SystemSubscription`, `Account`, `Session`, `VerificationToken`. Never touch them from a scope.
`- Not migrated: payment create/verify/webhook, auth, uploads, user/school create and
`  update, admissions bulk upload, and other handlers listed in
`  `lib/db/ownerConnectionRoutes.json`.
`
`**Deployment checklist.** (1) Set `DATABASE_URL_TENANT` (`app_tenant.<project-ref>` user on the
`pooler); `instrumentation.ts` logs an error at boot if it is missing. (2) Apply the RLS and
``app_tenant` migrations to the target database. (3) Re-run the cross-tenant check against that
`database. (4) Watch latency and P2028 (transaction timeout) errors on fee/analysis routes.
`
`**Benchmark results (2026-09-24, from a high-latency dev machine, largest school, 821 students).**
``scripts/benchmark-tenant-scope.ts` compares owner vs scoped on the heavy helpers. Scoped time was
`0.84-0.91x of owner (the scope adds only BEGIN/set_config/COMMIT; round trips dominate), so the scope
`is not slower per se. Absolute times here (12-47s) are dominated by ~1-3s per round trip on that link
`and say nothing about the deployment region: rerun the script there before relying on the 30s cap.
`Content was identical to the owner connection for every case checked. Row order among ties (queries
`without a total ORDER BY, e.g. top teachers, fee allocation lines) can differ because RLS changes the
`plan. Scopes slower than half the timeout log \`tenant_scope_slow\`; a timeout logs
`\`tenant_scope_timeout (P2028)\` with the school and duration.

### 3.1 Write handlers and the owner connection (final state)

Wrapping a whole write handler in one scope makes it a single transaction. That is wrong when
the handler (a) recovers from a DB error and carries on (a failed statement aborts the whole
Postgres transaction, so the final COMMIT would fail and everything be lost), (b) runs before a
tenant exists, (c) must commit independently of a gateway or caller, or (d) starts work that
outlives the request. Techniques used instead of leaving a handler unscoped:

- **Per-call scopes** where recovery is per statement: each `runInTenantScope(...)` is its own
  transaction, so a failed attempt rolls back and the fallback starts fresh (`newsfeed/create`,
  `newsfeed/[id]` PUT/DELETE Prisma-then-raw-SQL fallbacks, `fees/structure/bulk` per-class saves,
  `teacher/attendance` POST after its DDL self-heal check, per-row saves in the three bulk imports).
- **Owner-client helpers for fire-and-forget work**: `lib/notificationService.ts` and
  `lib/newsfeedRetention.ts` use the owner client, so a `createNotification(...).catch(() => {})`
  started inside a scope cannot run on an already-closed transaction and silently vanish.
- **Optional scope** (`runInOptionalTenantScope(session.user.schoolId, ...)`) for self/participant-
  scoped writes (notifications, leaves, marks, appointments, messages, homework submit, profile,
  password change): scoped when the session has a school, otherwise unchanged.
- **Deliberate cross-tenant reads stay on the owner client**: the "Aadhaar must be unique across
  ALL schools" check in `student/bulk-upload` (RLS would hide other schools' students and silently
  disable it), and the initial student lookup in `fees/student/[id]` PATCH (it discovers the
  student's school before scoping to it).

**Payment and money paths (scoped at the commit points only).** The gateway HTTP calls stay outside
any scope (a transaction must not be held open across a network call to a payment provider), and
lookups that must discover the tenant stay on the owner client. What is scoped is the existing DB
commit: `payment/verify` (transaction, payment create, fee update), `payment/create-order`
(order transaction), `payment/refund` (allocation + fee transaction), `payment/webhook`
(status/fee transaction, scoped to the paying student's school; `PaymentWebhookEvent` has no RLS
policy and stays on the owner client, as does the order-id lookup, which has no session),
`parent/subscription/create-order` and `verify` (payment create, subscription upsert),
`fees/offline-payment` (its `$transaction`), `student/offline-payment` (payment insert and fee
update, now atomic in one transaction), `fees/discount-approvals/[id]` (its transaction, scoped to
the approval's school so SUPERADMIN still works cross-tenant), and `student/[id]` PUT (main body
scoped; the reactivation password restore and the background sync tasks deliberately use the owner
client because they either report-and-continue on failure or outlive the request).

**Still on the owner connection, and why**

| Group | Handlers | Reason |
|---|---|---|
| No tenant context yet | `auth/[...nextauth]`, `school/create` | Login and school creation happen before a school exists |
| Not tenant data | `upload` | Object storage only |
| Cross-tenant by design | `superadmin/*` | See the superadmin decision above |
| Discovery lookups inside scoped routes | order-id lookup and `PaymentWebhookEvent` in the webhook; the student/fee lookup that finds the school in `fees/student/[id]` PATCH; the all-schools Aadhaar check in `student/bulk-upload` | They must see across tenants to find or validate the tenant |

Everything else that writes is inside a tenant scope. `lib/db/ownerConnectionRoutes.json` is the
baseline of route files that still import the owner client (reads and writes); the test in
`lib/db/ownerConnectionRoutes.test.ts` keeps it honest.

**Order-tie fix (verified live).** The order differences above are removed: tiebreakers were added to
top teachers / subject performance (`buildSchoolAnalysis.ts`), fee-head lines (`paymentFeeHeadLines.ts`),
and total `ORDER BY`s on the payment, allocation and admission-payment queries
(`loadDayFeeCollectionTransactions.ts`, `loadAdmissionFeeDayReportTx.ts`, `fees/transactions`). On the
largest school, `school/analysis` and the 1298-row fee report are now byte-identical between the owner
connection and a tenant scope, order included.

### 3.2 The four handlers that cannot move to the tenant connection

They stay on the owner connection because RLS cannot express what they do, not because the work
was skipped. What was done instead:

- **`auth/[...nextauth]`**: runs before any session or school exists; nothing to scope by.
- **`upload`**: no database access at all (object storage under `schools/<schoolId>/` taken from the
  session); nothing to migrate.
- **`school/create`**: creates the tenant itself. **Authorization gap closed:** the handler now
  returns 403 unless the session role is SCHOOLADMIN or SUPERADMIN (covered by `route.test.ts`). The
  "already has a school" guard is re-enabled for SCHOOLADMIN (409); SUPERADMIN can create many.
- **`superadmin/*`**: cross-tenant by design (decision in section 3). Compensating control added:
  `lib/db/superadminRoutes.test.ts` fails if any handler under `app/api/superadmin/**` does not
  itself authorize SUPERADMIN (directly or via an authorizing helper in the same file), so the
  RLS-free connection cannot quietly serve a non-superadmin.

### 3.3 Connection strings: set `connect_timeout` and `pool_timeout`

Prisma's default connect timeout is 5 seconds. On a slow or distant link the TLS and login handshake
to the Supabase pooler can take longer, which surfaces as `P1001: Can't reach database server` even
though the port is open (every failure in the logs lands at ~5.1s). Measured on the dev machine: with
the default, 2 of 10 parallel tenant transactions connected; with `connect_timeout=30` all 10 did, on
both port 5432 and port 6543. Add `connect_timeout=30&pool_timeout=30` to **all three** URLs, locally
and in the deployment environment:

    DATABASE_URL        ...:6543/postgres?pgbouncer=true&connect_timeout=30&pool_timeout=30
    DIRECT_URL          ...:5432/postgres?sslmode=require&connect_timeout=30&pool_timeout=30
    DATABASE_URL_TENANT ...:5432/postgres?sslmode=require&connect_timeout=30&pool_timeout=30

Restart the server after changing them. In a deployment region close to the database the handshake is
much faster, so this is a safety margin there rather than a fix.
