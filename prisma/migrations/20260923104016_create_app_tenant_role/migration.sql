-- Step 1 of implementing real DB-level tenant isolation (docs/SECURITY_REVIEW.md,
-- finding #2, recommendation #2). See that doc for full context: today RLS is
-- enabled on every tenant table with ZERO policies attached, and the app's
-- Prisma connection uses the table-owning role, which bypasses RLS regardless
-- of any policy — so RLS currently provides no protection at all.
--
-- This migration creates a second, restricted Postgres role that the app can
-- eventually connect as for tenant-scoped requests. Unlike the owning role,
-- a non-owner role WITHOUT the BYPASSRLS attribute is actually subject to RLS
-- policies. Creating the role and granting it table privileges is safe and
-- has NO effect on the app by itself - nothing in the codebase uses this role
-- yet, and no RLS policies exist yet for it to be restricted by.
--
-- This migration deliberately does NOT set a password. Do not commit a
-- database credential to git, even a placeholder - set one out-of-band
-- against the real database before this role is used anywhere:
--
--   ALTER ROLE app_tenant WITH PASSWORD '<a newly generated secret>';
--
-- Store that secret as a new env var (e.g. DATABASE_URL_TENANT) in your
-- deployment's secret manager, never in a committed file. Until that password
-- is set, this role cannot log in and is inert.
--
-- What still has to happen before this role is safe to actually use in the
-- app (do NOT wire it into lib/db.ts yet - see docs/SECURITY_REVIEW.md):
--   1. Real RLS policies on every tenant table (many, e.g. Payment,
--      StudentFee, Attendance, Mark, need a subquery via studentId -> Student
--      -> schoolId, since they have no direct schoolId column - a bigger
--      design decision than the direct-schoolId tables).
--   2. Every route handler's Prisma calls wrapped in a per-request
--      prisma.$transaction(...) that runs `SET LOCAL app.current_school_id`
--      as its first statement, so the session variable and the queries that
--      depend on it share one pooled connection (required for correctness
--      under PgBouncer transaction-mode pooling, which this app uses).
--   3. A superadmin carve-out (separate role/connection, or a policy branch)
--      for the legitimately cross-tenant superadmin routes.
--   4. A table-by-table rollout with the cross-tenant isolation tests
--      (added in commit bba6858) re-run against the real DB-level behavior,
--      not just the mocked Prisma layer.
-- Until then, the app continues to rely entirely on requireSchoolId() /
-- application-level scoping, as documented in CLAUDE.md.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      CONNECTION LIMIT -1;
  END IF;
END
$$;

-- GRANT ON DATABASE requires a literal identifier, not an expression, so this
-- uses dynamic SQL to grant CONNECT on whichever database the migration runs
-- against (works the same locally and against the real Supabase database).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_tenant', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO app_tenant;

-- Table-level DML on everything that exists today. RLS policies (added in a
-- later migration, once designed) are what will actually restrict which ROWS
-- app_tenant can see/touch within these grants - the grants alone just make
-- the tables reachable at all, same as any ordinary non-owner app role.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;

-- Every future migration's CREATE TABLE (run by the owning/migration role)
-- should extend the same grant automatically, so this doesn't need to be
-- hand-maintained per new tenant table going forward.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;
