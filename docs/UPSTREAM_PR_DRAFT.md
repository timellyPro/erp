# PR draft: fork -> timellyPro/erp `main`

Title: **Tenant isolation (RLS), `app/_components` restructure, ops readiness; synced with upstream main**

## Summary
Brings the fork's work into `main`. The branch already contains upstream/main (0 commits behind at the time of writing), so it merges without conflicts.

- **Database-level tenant isolation.** A restricted `app_tenant` role and RLS policies on tenant tables. About 106 of 178 route files now run their queries through `withTenantScopedClient` / `runInTenantScope`. See `docs/SECURITY_REVIEW.md` section 3.
- **Frontend restructure.** `app/frontend` moved to `app/_components` and large components were split into hooks and shared modules.
- **Operations.** `/api/health`, startup env validation (`lib/env.ts`), error boundaries, `.env.example`, deploy and DB migration runbooks (`docs/DEPLOY.md`, `docs/DB_MIGRATION.md`).
- **Other.** Payment idempotency (`clientRequestId`, unique HyperPG `transactionId`), teacher daily attendance, many route tests.

## Needs action when deploying
1. New environment variables: `DATABASE_URL_TENANT` (the `app_tenant` connection string), plus those in `.env.example`. Without `DATABASE_URL_TENANT`, tenant-scoped routes return 500.
2. After `prisma migrate deploy`, set the role password: `ALTER ROLE app_tenant WITH PASSWORD '...'` (the migration deliberately does not).
3. Run `npx tsx scripts/verify-rls-isolation.ts` against the target database.
4. GitHub Actions secrets for the fees backup workflow: `APP_URL`, `CRON_SECRET`.

## Migrations this PR adds (11)
Applied in name order. Several sort before migrations already on upstream (`20260925120000`, `20261001120000`), so an upstream database that has applied those will see these as pending; `migrate deploy` applies them, `migrate dev` may complain.

```
20260923031057_add_studentfee_updatedat_studentid_index
20260923042848_enable_rls_public_tables
20260923043530_enable_rls_prisma_migrations
20260923104016_create_app_tenant_role
20260923104652_rls_policies_direct_schoolid_tables
20260923105153_rls_policies_indirect_schoolid_tables
20260924120000_rls_policies_teacher_attendance_and_school_join_tables
20260927000000_add_payment_client_request_id
20260927010000_payment_hyperpg_transactionid_unique   (fails if duplicate HyperPG transactionIds exist)
20260927020000_add_teacher_daily_attendance
20261012000000_rls_exam_type_subject_and_residency_tables
```

## Behaviour decisions made while syncing with upstream
- The cron route (`/api/cron/fees-backup-email`) accepts only `Authorization: Bearer $CRON_SECRET`. Upstream's `x-vercel-cron` header and `?secret=` query were not adopted: the header is spoofable and the query leaks into logs.
- Upstream's new routes (`marks/bulk`, `exam-types/subject-config`, `student/[id]/residency-conversion`) now run in a tenant scope; their new tables got RLS policies.
- Teachers can manage exam types, subjects and sections (upstream's change, kept).

## Test plan
- [x] `tsc --noEmit` clean, `next build` passes, `jest`: 222 suites / 1,959 tests pass, eslint 0 errors
- [ ] Apply migrations to a staging database and run `verify-rls-isolation.ts`
- [ ] Log in as each role and click through: exam types and subjects, teacher marks entry, download reports, student profile fees sheet, residency conversion
- [ ] One fee payment through HyperPG test mode
- [ ] `/api/health` returns ok; cron returns 200 with the Bearer secret and 401 without
