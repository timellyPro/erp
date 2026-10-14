# Migrating the old database into the new Supabase project

Companion to `docs/DEPLOY.md`. Run these from your machine. Put passwords in env vars, never in files or chat.

```bash
export OLD_DIRECT_URL='postgresql://postgres.<oldref>:<pw>@<host>:5432/postgres?sslmode=require'
export NEW_DIRECT_URL='postgresql://postgres.<newref>:<pw>@<host>:5432/postgres?sslmode=require'
```

Use the **direct/session** URL (port 5432), not the 6543 pooler. `pg_dump` and `pg_restore` must be the same major version as Supabase or newer (`select version();`).

## 0. Before you start
- Stop writes to the old database (stop the old deploy and any cron/GitHub workflow pointing at it).
- The new database must be empty of real data. If `npx prisma migrate status` shows it up to date and the tables hold rows, a restore will clash; start from a fresh project instead.

## 1. Dump the old database (data + `_prisma_migrations`)
```bash
pg_dump "$OLD_DIRECT_URL" --schema=public --no-owner --no-privileges -Fc -f old.dump
```

## 2. Restore into the new database
```bash
pg_restore --no-owner --no-privileges --clean --if-exists -d "$NEW_DIRECT_URL" old.dump
```
"schema public already exists" and role/ownership warnings are harmless. Any other error: stop and read it.

## 3. Duplicate-payment check (must return no rows)
The fork's unique index on `Payment.transactionId` fails if the old data has duplicates.
```sql
SELECT "transactionId", count(*) FROM "Payment"
WHERE gateway = 'HYPERPG' AND "transactionId" IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;
```

## 4. Bring the schema up to date
```bash
DATABASE_URL="$NEW_DIRECT_URL" DIRECT_URL="$NEW_DIRECT_URL" npx prisma migrate deploy
DATABASE_URL="$NEW_DIRECT_URL" DIRECT_URL="$NEW_DIRECT_URL" npx prisma migrate status
```
Status must say the schema is up to date.

## 5. Restricted tenant role
```sql
ALTER ROLE app_tenant WITH PASSWORD '<long random, no special characters>';
```
`DATABASE_URL_TENANT=postgresql://app_tenant.<newref>:<password>@<pooler-host>:5432/postgres?sslmode=require&connect_timeout=30&pool_timeout=30`

Then verify isolation (set `DATABASE_URL_TENANT` and the owner URLs in the shell first):
```bash
npx tsx scripts/verify-rls-isolation.ts
```

## 6. Compare row counts
```bash
OLD_DATABASE_URL="$OLD_DIRECT_URL" NEW_DATABASE_URL="$NEW_DIRECT_URL" npx tsx scripts/compare-db-counts.ts
```
Expect "All shared tables match" (tables only in the new database are fine).

## 7. Storage files (photos, documents)
The dump does not copy Supabase Storage. Rows store full URLs containing the project ref.
- **Simplest:** keep the old project alive for Storage only and leave `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` pointing at it. No SQL needed.
- **Copy to the new project:** recreate the bucket, copy the objects, then rewrite the URLs (see `scripts/rewrite-storage-urls.sql`: it finds every text column itself, runs in a transaction that ends in `ROLLBACK`, and prints counts; switch to `COMMIT` once they look right).

## 8. Switch the app
Update Vercel env vars (`DATABASE_URL`, `DIRECT_URL`, `DATABASE_URL_TENANT`, Supabase keys, `NEXTAUTH_URL`, new `NEXTAUTH_SECRET` and `CRON_SECRET`), add GitHub secrets `APP_URL` and `CRON_SECRET`, update the HyperPG webhook URL, redeploy, and check `/api/health`. Rotate any password that has been pasted into a chat or ticket.

## Rollback
Nothing here modifies the old database. To roll back, point the env vars at the old URLs and redeploy.
