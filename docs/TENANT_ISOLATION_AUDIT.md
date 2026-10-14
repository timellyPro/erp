# Tenant Isolation Audit — API Routes

Date: 2026-09-27

## Method

Grepped all 178 `app/api/**/route.ts` files for `requireSchoolId`, then for any
`schoolId` usage at all, then manually reviewed every route with zero
`schoolId` mention (9 files) plus every route with a client-suppliable
`schoolId` (`searchParams`/`body`).

## Findings

| # | Finding | File | Severity | Status |
|---|---------|------|----------|--------|
| 1 | Client-controlled `schoolId` fallback bypassed tenant scoping | [app/api/fees/discount-approvals/route.ts](../app/api/fees/discount-approvals/route.ts) | Blocker | **Fixed** — verified in current code: uses `requireSchoolId(session)` unconditionally, no `searchParams.get("schoolId")` fallback |
| 2 | `superadmin/schools/[id]/active` was a functional no-op (didn't persist the toggle) | [app/api/superadmin/schools/[id]/active/route.ts](<../app/api/superadmin/schools/[id]/active/route.ts>) | High | **Fixed** — verified: now calls `prisma.school.update(...)` and returns the persisted row |
| 3 | `superadmin/backup/email`, `backup-schedule`, `chairmen/create` accept `body.schoolId` directly | `app/api/superadmin/backup/email/route.ts:27`, `backup-schedule/route.ts:89-100`, `chairmen/create/route.ts:20` | Low (by design) | Acceptable — SUPERADMIN is intentionally cross-tenant/global. Confirm each has a SUPERADMIN-only role gate; worth a one-line comment noting this is deliberate so it isn't "fixed" into a regression |
| 4 | Self-scoped routes have no explicit `schoolId` filter | `leaves/my`, `marks/download`, `payment/receipt`, `parent/subscription/history`, `chairman/me`, `student-leaves/approval-authority` | Low | These filter by the caller's own `session.user.id`/`studentId`/`teacherId`, which is safe as a data-leak vector even without a `schoolId` clause. No action needed unless a route is later extended to accept an arbitrary `id` param |
| 5 | Deprecated route kept only to avoid 404s | [app/api/communication/zegoToken/route.ts](../app/api/communication/zegoToken/route.ts) | Low | Fine — returns 410. Consider deleting outright once confirmed unused |
| 6 | `FeeDiscountApproval` model has a `schoolId` column with no dedicated index | `prisma/schema.prisma:1184-1222` | Medium (re-checked, **not an issue**) | The model already has `@@index([schoolId, status, createdAt])`, a composite index leading with `schoolId` — Postgres can use it for `schoolId`-only lookups. No schema change needed |
| 7 | `scripts/checkTenantIsolation.ts` only flagged total-miss cases (no `requireSchoolId` at all) | [scripts/checkTenantIsolation.ts](../scripts/checkTenantIsolation.ts) | High | **Fixed** — verified: a second check now flags `searchParams.get(...schoolId...)` / `body.schoolId` reads outside a superadmin allowlist. `npx tsx scripts/checkTenantIsolation.ts` and `npx jest scripts/checkTenantIsolation` both pass |

## Overall

The initial "no `requireSchoolId`" grep flagged 171/178 routes, but almost all
of those use route-local resolvers (`resolveFeesSchoolId`, bespoke fallback
chains built on `lib/auth/tenant.ts`'s exported `schoolIdViaStudentId` /
`schoolIdViaTeacherClass` primitives) rather than the named helper directly —
this matches the documented pattern in `lib/auth/tenant.ts`'s own comments
("routes with their own bespoke resolveSchoolId"). The one genuine leak found
was #1 above, and it is already fixed in the current codebase.

## Recommendation

Keep `npm run check:tenant-isolation` (already wired into CI via
`scripts/checkTenantIsolation.ts`) as the standing guard for this class of
bug, rather than relying on one-off manual review. No further schema or code
changes are required as of this audit — findings #1, #2, and #7 were already
remediated in the working tree; #3–#5 are accepted by design/low risk; #6 was
re-checked and found to be a non-issue (composite index already covers it).

## Regression coverage

- [app/api/fees/discount-approvals/route.ts](../app/api/fees/discount-approvals/route.ts):
  add/confirm a test asserting a request with a spoofed `schoolId` query
  param is scoped to the caller's own school, not the spoofed one.
- [app/api/superadmin/schools/[id]/active/route.ts](<../app/api/superadmin/schools/[id]/active/route.ts>):
  add/confirm a test asserting `PATCH` persists `isActive` and the response
  reflects the updated row (not just a 200 with stale data).
- `scripts/checkTenantIsolation.ts`: `npx jest scripts/checkTenantIsolation`
  covers the new client-controlled-`schoolId` regression case.
