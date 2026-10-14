/**
 * Copy ALL data from the OLD database into the NEW database (no pg_dump needed).
 *
 *   OLD_DATABASE_URL=... NEW_DATABASE_URL=... npx tsx scripts/migrate-data.ts           # dry run
 *   OLD_DATABASE_URL=... NEW_DATABASE_URL=... npx tsx scripts/migrate-data.ts --apply   # does it
 *
 * Use the direct/session URLs (port 5432). The NEW database must already have the schema
 * (`prisma migrate deploy`). With --apply it EMPTIES every public table in the NEW database
 * (except _prisma_migrations) and refills it from the OLD one. The OLD database is only read.
 *
 * Rows travel as JSON (to_jsonb -> jsonb_populate_recordset), so column types round-trip
 * exactly. Columns the old table lacks get their default/NULL; extra old columns are dropped.
 * Foreign keys are not checked during the copy (session_replication_role = replica); run
 * compare-db-counts.ts afterwards.
 */
import { PrismaClient } from "@prisma/client";

const oldUrl = process.env.OLD_DATABASE_URL;
const newUrl = process.env.NEW_DATABASE_URL;
const apply = process.argv.includes("--apply");
const BATCH = 500;

if (!oldUrl || !newUrl) {
  console.error("Set OLD_DATABASE_URL and NEW_DATABASE_URL.");
  process.exit(2);
}
if (oldUrl === newUrl) {
  console.error("OLD and NEW are the same database. Refusing.");
  process.exit(2);
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const oldDb = new PrismaClient({ datasourceUrl: oldUrl });
const newDb = new PrismaClient({ datasourceUrl: newUrl });

async function tables(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

async function count(db: PrismaClient, t: string): Promise<number> {
  const r = await db.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM ${q(t)}`);
  return Number(r[0]?.n ?? 0);
}

async function primaryKey(db: PrismaClient, t: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT a.attname AS column_name
       FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY array_position(i.indkey, a.attnum)`,
    `public.${q(t)}`
  );
  return rows.map((r) => r.column_name);
}

async function main() {
  const [oldTables, newTables] = await Promise.all([tables(oldDb), tables(newDb)]);
  const shared = oldTables.filter((t) => newTables.includes(t));
  const skipped = oldTables.filter((t) => !newTables.includes(t));
  console.log(`${shared.length} shared tables. Only in old (not copied): ${skipped.join(", ") || "none"}`);

  let total = 0;
  for (const t of shared) total += await count(oldDb, t);
  console.log(`Old database holds ${total} rows in the shared tables.`);
  if (!apply) {
    console.log("\nDry run. Nothing was written. Re-run with --apply to empty the NEW database and copy.");
    return;
  }

  console.log("\nApplying. Emptying NEW tables first...");
  await newDb.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
      await tx.$executeRawUnsafe(`TRUNCATE ${shared.map(q).join(", ")} RESTART IDENTITY CASCADE`);
    },
    { timeout: 120_000 }
  );

  for (const t of shared) {
    const n = await count(oldDb, t);
    if (n === 0) {
      console.log(`  ${t}: 0`);
      continue;
    }
    const pk = await primaryKey(oldDb, t);
    const order = pk.length ? pk.map(q).join(", ") : "ctid";
    let done = 0;
    for (let offset = 0; offset < n; offset += BATCH) {
      const rows = await oldDb.$queryRawUnsafe<Array<{ j: unknown }>>(
        `SELECT to_jsonb(x) AS j FROM (SELECT * FROM ${q(t)} ORDER BY ${order} LIMIT ${BATCH} OFFSET ${offset}) x`
      );
      if (rows.length === 0) break;
      const payload = JSON.stringify(rows.map((r) => r.j));
      await newDb.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
          await tx.$executeRawUnsafe(
            `INSERT INTO ${q(t)} SELECT * FROM jsonb_populate_recordset(null::${q(t)}, $1::jsonb)`,
            payload
          );
        },
        { timeout: 120_000 }
      );
      done += rows.length;
    }
    console.log(`  ${t}: ${done}/${n}`);
  }
  console.log("\nDone. Now run scripts/compare-db-counts.ts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await oldDb.$disconnect();
    await newDb.$disconnect();
  });
