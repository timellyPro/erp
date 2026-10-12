# Deploying Timelly (Vercel + Supabase)

First-time deployment runbook. Nothing is deployed yet, so follow in order.
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
