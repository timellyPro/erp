/**
 * Compare per-table row counts between the OLD and NEW database after a restore.
 *
 *   OLD_DATABASE_URL="<old direct url>" NEW_DATABASE_URL="<new direct url>" \
 *     npx tsx scripts/compare-db-counts.ts
 *
 * Read-only. Uses the owner role (counts bypass RLS). Exits 1 if any table differs.
 * Tables the new database has but the old one lacks (added by newer migrations)
 * are listed as "new only" and are not a failure.
 */
import { PrismaClient } from "@prisma/client";

const oldUrl = process.env.OLD_DATABASE_URL;
const newUrl = process.env.NEW_DATABASE_URL;
if (!oldUrl || !newUrl) {
  console.error("Set OLD_DATABASE_URL and NEW_DATABASE_URL.");
  process.exit(2);
}

async function counts(url: string): Promise<Map<string, number>> {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`;
    const out = new Map<string, number>();
    for (const { table_name } of tables) {
      if (table_name === "_prisma_migrations") continue;
      const rows = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM "${table_name.replace(/"/g, '""')}"`
      );
      out.set(table_name, Number(rows[0]?.n ?? 0));
    }
    return out;
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const [a, b] = await Promise.all([counts(oldUrl!), counts(newUrl!)]);
  let bad = 0;
  const names = [...new Set([...a.keys(), ...b.keys()])].sort();
  for (const t of names) {
    const o = a.get(t);
    const n = b.get(t);
    if (o === undefined) console.log(`new only  ${t}: ${n}`);
    else if (n === undefined) {
      bad++;
      console.log(`MISSING   ${t}: old ${o}, not in new`);
    } else if (o !== n) {
      bad++;
      console.log(`DIFF      ${t}: old ${o}, new ${n}`);
    } else console.log(`ok        ${t}: ${o}`);
  }
  console.log(bad ? `\n${bad} table(s) differ.` : "\nAll shared tables match.");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
