# CLAUDE.md

Guidance for AI agents (and humans) working in this repo.

## What this is

A Next.js App Router multi-tenant school-management SaaS. Each tenant is a
"School"; users are Superadmins (platform operators), Chairmen, School
Admins, Teachers, and Parents/Students, each with their own portal.

## Folder layout

- `app/` — Next.js App Router root.
  - `app/api/**/route.ts` — all backend endpoints. Every handler that reads
    or writes tenant data must resolve `schoolId` via `requireSchoolId()`
    (see Auth & tenancy below) and use it in every query — there is no
    database-level backstop.
  - `app/{chairman,schooladmin,superadmin,teacher,parent}/` — one top-level
    route segment per portal, each a single `page.tsx` that mounts tab
    content from `app/_components/components/<role>/`.
  - `app/{events,payments,payment-success,qr,screen,download,unauthorized}/`
    — standalone feature/utility pages.
  - `app/_components/` — shared frontend code. The leading underscore
    excludes it from App Router routing — **never add a `page.tsx` or
    `route.ts` in here**, it will silently become a live (and probably
    unintended) route.
    - `auth/` — client-side session/role/feature guards (`RequiredRoles`,
      `RequireFeature`, `SuperAdminSessionGuard`). These gate the UI only;
      real authorization happens server-side per API route.
    - `components/<role>/` — UI split by portal (`chairman/`, `parent/`,
      `schooladmin/`, `superadmin/`, `teacher/`, plus `common/`,
      `mobilescreens/`, `pdf/`, `settings/`, `timetable/`).
    - `constants/`, `enums/`, `interfaces/`, `types/` — shared types/config,
      including `constants/routes.ts` (the canonical `ROUTES` map — update
      it, not hardcoded path strings, when adding/moving a route) and
      `constants/sidebar-menus/*` (per-role nav).
    - `context/`, `hooks/`, `services/`, `modals/`, `utils/` — state,
      data-fetching, dialogs, helpers.
- `lib/` — server-side domain logic and infra: `auth/` (NextAuth config,
  tenant resolution, permissions — see below), `db.ts` (Prisma singleton +
  query caching), `cache/` (Redis), plus one folder per domain (`fees/`,
  `exams/`, `students/`, `admission/`, `school/`, `parent/`, `teacher/`,
  `core/`, `errors/`) and top-level utils (`logger.ts`, `features.ts`,
  `notificationService.ts`, `pdfUtils.ts`).
- `prisma/` — `schema.prisma` + timestamped `migrations/`.
- The old repo-root `components/`, `hooks/` and `context/` folders no
  longer exist; all shared frontend code lives under `app/_components`.
- `socket-server/index.ts` — standalone realtime/socket server, run and
  deployed separately from the Next.js app.
- `scripts/` — one-off/operational scripts (backups, reconciliation),
  run outside the app, not part of the request path.
- `middleware.ts` — sets `Cache-Control` on GET `/api/*` only. It does
  **not** enforce auth; route handlers are the actual enforcement point.

## Auth model

- NextAuth with `CredentialsProvider` (email/password, bcrypt) +
  `PrismaAdapter`, configured in `lib/auth/authOptions.ts`.
- **JWT session strategy** (not DB sessions). Token carries `id, role,
  schoolId, mobile, studentId, allowedFeatures[], image, _dbSyncAt`.
- Roles: `SUPERADMIN | SCHOOLADMIN | CHAIRMAN | TEACHER | STUDENT`.
- `role`, `schoolId`, `allowedFeatures` and `photoUrl` are re-synced from
  Postgres in the `jwt` callback, but only when the token is >5 minutes
  old or missing those fields — not on every request. A role change
  therefore takes effect within ~5 minutes. See the fail-open tradeoff
  below for what happens when that sync fails.
- Deactivation (`password = null`) is checked on each sync: the callback
  throws `account_deactivated` and the session is invalidated (within ~5
  minutes), not just at next login.

## Tenant scoping — application-level, not DB-level

Every tenant-scoped API route must:

1. Call `requireSession()` then `requireSchoolId(session)` from
   `lib/auth/tenant.ts` to get the authoritative `schoolId` (from the JWT,
   falling back to a live DB lookup across `user`/`student`/`adminSchools`/
   `teacherSchools` if the JWT doesn't have it yet).
2. Use that `schoolId` in **every** Prisma `where` clause touching the
   table — never trust a `schoolId` from the request body/query params.

**Tenant isolation is now two-layered for most (not all) routes.** The
paragraph that used to be here ("no RLS policies exist") described an
earlier state of the project and is out of date — see
[`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) §3 for the current,
authoritative account. As of that doc: 106 of 178 route files run their
queries through a second Postgres connection (the restricted `app_tenant`
role, `DATABASE_URL_TENANT`) inside a transaction with
`app.current_school_id` set, and real RLS policies on tenant-scoped tables
enforce isolation at the DB level independent of the Prisma `where`
clause. Two entry points exist: `withTenantScopedClient(schoolId, ...)`
(`lib/db/tenantClient.ts`) for simple routes, and
`runInTenantScope(schoolId, fn)` + `tenantDb`
(`lib/db/tenantContext.ts`) for routes whose shared `lib/*` helpers need
scoping without threading a `tx` through every call.

**The remaining 72 routes still use the owner (non-RLS) connection**,
deliberately — see `docs/SECURITY_REVIEW.md` §3.1–3.2 for the full list
and reasoning (routes with no tenant context yet, e.g. `auth/[...nextauth]`
and `school/create`; `superadmin/*`, which is cross-tenant by design;
and a handful of routes that must see across tenants to find or validate
the tenant, e.g. the Aadhaar-uniqueness check in `student/bulk-upload`).
`lib/db/ownerConnectionRoutes.json` is the tracked baseline of these, and
`lib/db/ownerConnectionRoutes.test.ts` fails if a new route silently joins
that list. **For these routes, and for any table with RLS enabled but no
policy attached** (`PaymentWebhookEvent`, `SystemSubscription`, `Account`,
`Session`, `VerificationToken` — these return 0 rows to a tenant-scoped
connection, so never query them from inside a scope), isolation still
depends entirely on `requireSchoolId()` and the `schoolId` filter below.

**When adding a new tenant-scoped table**: add a `schoolId` column with a
`@relation` to `School`, index it, and route every query for that table
through `requireSchoolId()` regardless of which connection is used. If the
route can adopt `withTenantScopedClient`/`runInTenantScope`, do so and add
a real RLS policy for the table (see the existing migrations referenced in
`docs/SECURITY_REVIEW.md` §3 for the pattern); if it must stay on the
owner connection, say why in a comment, matching the documented exceptions
above — the `schoolId` filter is still mandatory either way, never a
substitute for one or the other.

## Fail-open tradeoff (auth DB sync)

In `lib/auth/authOptions.ts`'s `jwt` callback, if the periodic DB re-sync
throws (DB outage, pool exhaustion), the error is caught and the **old,
cached token is returned unchanged** rather than failing the request. This
is deliberate — the alternative is every session check 401-ing during any
DB hiccup. The fallback is time-boxed: once no sync has succeeded for
`MAX_STALE_SESSION_MS` (60 minutes, tracked by `_lastSuccessfulSyncAt`)
the callback throws `session_stale_ceiling_exceeded` and forces re-login. See
[`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) for the risk
assessment.

## Testing

- `npx jest` runs the suite (API route tests live next to their
  `route.ts` as `route.test.ts`).
- Run `next build` after any route-folder restructuring — Next's routing
  is filesystem-based, so a misplaced `page.tsx` becomes a live route
  silently (this happened before; see git history around the
  `app/_components` rename).
