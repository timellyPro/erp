import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

/** Prisma schema omits this column so Prisma SQL never references it; cache whether the DB actually has it. */
let hyperpgBaseUrlColumnExistsCache: boolean | null = null;

async function hasSchoolSettingsHyperpgBaseUrlColumn(): Promise<boolean> {
  if (hyperpgBaseUrlColumnExistsCache !== null) return hyperpgBaseUrlColumnExistsCache;
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND lower(c.relname) = lower('SchoolSettings')
          AND a.attname = 'hyperpgBaseUrl'
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS "exists"
    `);
    hyperpgBaseUrlColumnExistsCache = Boolean(rows[0]?.exists);
  } catch {
    hyperpgBaseUrlColumnExistsCache = false;
  }
  return hyperpgBaseUrlColumnExistsCache;
}

/** Call after applying a migration that adds `hyperpgBaseUrl` so reads pick it up without restarting. */
export function resetSchoolSettingsHyperpgBaseUrlColumnCache(): void {
  hyperpgBaseUrlColumnExistsCache = null;
}

function isMissingHyperpgBaseUrlColumn(e: unknown): boolean {
  const err = e as { code?: string; message?: string; meta?: { message?: string } };
  const msg = `${err?.message ?? ""} ${err?.meta?.message ?? ""}`;
  if (!msg.includes("hyperpgBaseUrl") && !msg.includes("42703")) return false;
  return err?.code === "P2010" || err?.code === "P2022" || msg.includes("42703");
}

/**
 * Read optional `hyperpgBaseUrl` via raw SQL (column is not on the Prisma model).
 * Returns null if the column is absent or the row has no value.
 */
export async function getSchoolHyperpgBaseUrlRaw(schoolId: string): Promise<string | null> {
  if (!(await hasSchoolSettingsHyperpgBaseUrlColumn())) return null;
  try {
    const rows = await prisma.$queryRaw<Array<{ hyperpgBaseUrl: string | null }>>(
      Prisma.sql`SELECT "hyperpgBaseUrl" FROM "SchoolSettings" WHERE "schoolId" = ${schoolId} LIMIT 1`
    );
    return rows[0]?.hyperpgBaseUrl ?? null;
  } catch (e) {
    if (isMissingHyperpgBaseUrlColumn(e)) {
      hyperpgBaseUrlColumnExistsCache = false;
      return null;
    }
    throw e;
  }
}

/** No-op if the column does not exist. */
export async function setSchoolHyperpgBaseUrlRaw(schoolId: string, value: string | null): Promise<void> {
  if (!(await hasSchoolSettingsHyperpgBaseUrlColumn())) return;
  const v = value === null || value === "" ? null : value.trim().replace(/\/$/, "");
  try {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "SchoolSettings" SET "hyperpgBaseUrl" = ${v}, "updatedAt" = NOW() WHERE "schoolId" = ${schoolId}`
    );
    hyperpgBaseUrlColumnExistsCache = true;
  } catch (e) {
    if (isMissingHyperpgBaseUrlColumn(e)) {
      hyperpgBaseUrlColumnExistsCache = false;
      return;
    }
    throw e;
  }
}

/**
 * Merchant + API key + optional base URL via raw SQL (bypasses Prisma+Redis stale reads for credentials).
 */
export async function getSchoolHyperpgPaymentRowRaw(schoolId: string): Promise<{
  hyperpgMerchantId: string | null;
  hyperpgApiKey: string | null;
  hyperpgBaseUrl: string | null;
} | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      hyperpgMerchantId: string | null;
      hyperpgApiKey: string | null;
    }>
  >(Prisma.sql`
    SELECT "hyperpgMerchantId", "hyperpgApiKey"
    FROM "SchoolSettings"
    WHERE "schoolId" = ${schoolId}
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  const hyperpgBaseUrl = await getSchoolHyperpgBaseUrlRaw(schoolId);
  return {
    hyperpgMerchantId: r.hyperpgMerchantId ?? null,
    hyperpgApiKey: r.hyperpgApiKey ?? null,
    hyperpgBaseUrl,
  };
}
