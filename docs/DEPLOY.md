# Deploying Timelly (Vercel + Supabase)

First-time deployment runbook. Nothing is deployed yet, so follow in order. Moving existing data: see `docs/DB_MIGRATION.md`.
Env var reference: `.env.example`. Gaps this closes: `docs/PRODUCT_READINESS_GAPS.md` #4, #6, #7.

## 0. Plans (decide before you start)
- **Supabase Pro** for paying schools: daily backups, no auto-pause (free projects pause after inactivity). Enable Point-in-Time Recovery as an add-on.
- **Vercel Pro**: `vercel.json` has a cron every 15 minutes, which the free Hobby plan does not allow.
- The socket server (`socket-server/`) is **not needed**: no frontend code connects to it. Skip hosting it unless you add a realtime feature.

## 1. Create two environments
Make **staging** and **production** as separate Supabase projects and separate Vercel projects (or one Vercel project with Preview = staging). Never point staging at the production database.

## 2. Database (per environment)
1. Create the Supabase project; pick the region closest to your schools (India: Mumbai) and the same region for Vercel functions.
2. Collect the connection strings (Project Settings > Database):
   - `DATABASE_URL`: pooler, port 6543, `?pgbouncer=true&connect_timeout=30&pool_timeout=30`
   - `DIRECT_URL`: port 5432, `?sslmode=require&connect_timeout=30&pool_timeout=30`
3. Apply migrations from your machine or CI, using the direct URL:
   ```bash
   DATABASE_URL="<direct url>" DIRECT_URL="<direct url>" npx prisma migrate deploy
   ```
4. Set a password for the restricted RLS role (the migration deliberately does not):
   ```sql
   ALTER ROLE app_tenant WITH PASSWORD '<newly generated secret>';
   ```
   Then `DATABASE_URL_TENANT` = `postgresql://app_tenant.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require&connect_timeout=30&pool_timeout=30`
   (see `docs/SECURITY_REVIEW.md` section 3 and its connection-string notes).
5. Run `npx tsx scripts/verify-rls-isolation.ts` against the new database.

## 3. Vercel
1. Import the GitHub repo. Framework: Next.js. Build command is already `prisma generate && next build`.
2. Add env vars (Production and Preview separately). Required ones:
   `DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TENANT`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`),
   `NEXTAUTH_URL` (the final `https://` URL), `CRON_SECRET` (random string).
   Then Supabase storage, SMTP, Upstash Redis and HyperPG values as listed in `.env.example`.
3. Set the function region to match the database region.
4. Deploy, then add your custom domain and update `NEXTAUTH_URL` to it and redeploy.

## 4. Verify the deployment
- `https://<domain>/api/health` returns `{"status":"ok"}`. A 503 names the failing check; details are in Vercel function logs.
- Log in as each role; take one fee payment through the HyperPG **test** environment before using live keys.
- Confirm the cron appears under Vercel > Settings > Cron Jobs and returns 200 (not 401) on its first run.
- Point an uptime monitor (UptimeRobot / BetterStack) at `/api/health` with phone alerts.

## 5. Ongoing
- **Migrations:** apply to staging, test, then production, *before* promoting code that needs them. Keep changes backward compatible so the old code still works during the switch.
- **Rollback:** Vercel > Deployments > promote the previous deployment (instant). Database changes need a forward fix; take a manual backup first.
- **Backups:** rely on Supabase backups/PITR, not `scripts/backup-db.js`. Do a restore drill into a scratch project once and record the steps here.
- **Secrets:** rotate `NEXTAUTH_SECRET` / `CRON_SECRET` by changing them in Vercel and redeploying (rotating `NEXTAUTH_SECRET` logs everyone out).

## Still to fill in after first deploy
First superadmin creation procedure, restore-drill steps, on-call contact, and the real production domain.

## 6. Staging and manual promote (GitHub Actions)
`.github/workflows/deploy.yml` deploys `main` to **staging** on every push, and deploys **production** only when someone runs it by hand.
One-time setup:
1. GitHub > Settings > Environments: create `staging` and `production`. On `production`, add yourself as a **required reviewer** (this is the manual promote gate).
2. Repository secret `VERCEL_TOKEN` and `VERCEL_ORG_ID`. In **each environment** add `VERCEL_PROJECT_ID` (the staging or production Vercel project) and `DIRECT_URL` (that environment's Supabase direct connection string).
3. Staging must use its own Supabase project (section 1).
Promote flow: merge to `main` > staging deploys, migrates and health-checks > test it > Actions > Deploy > Run workflow > target `production`, ref = the commit tested on staging > approve. Rollback: Vercel > Deployments > promote the previous one.

## 7. Operations
- Dependabot (`.github/dependabot.yml`) opens weekly update PRs. `xlsx` is pinned to the SheetJS CDN build 0.20.3 (patched; the npm copy 0.18.5 is not) and must be bumped by hand.
- Every `/api/*` request logs one JSON line (`event: "api_request"`) with `schoolId`, `userId`, `role`, method and path. Filter on `schoolId` in your log drain.
- Status and support: `docs/SUPPORT.md`. Retention: `docs/DATA_RETENTION.md`.

## 8. Backups and restore drill
- **Nightly dump:** `.github/workflows/db-backup.yml` writes a gpg-encrypted `pg_dump` (30-day retention) as the `db-backup` artifact. Needs secrets `BACKUP_DATABASE_URL` (session pooler, port 5432) and `BACKUP_PASSPHRASE`. The repo is public: never remove the encryption.
- **Also enable PITR** in Supabase (Project Settings > Add-ons) for minute-level recovery.
- **Restore** into a scratch Supabase project (never over production without a fresh dump first):
  ```bash
  gpg --output t.dump --decrypt timelly-YYYYMMDD-HHMM.dump.gpg
  pg_restore --no-owner --no-privileges --clean --if-exists -d "<scratch session-pooler url>" t.dump
  DATABASE_URL="<scratch url>" npx tsx scripts/verify-rls-isolation.ts
  ```
  Then run `npx prisma migrate status` and open the app against it. Record the date of the last successful drill here: _not yet done_.
- Roles (`app_tenant`) are not in the dump; recreate its password with the `ALTER ROLE` step in section 2 after a restore.
