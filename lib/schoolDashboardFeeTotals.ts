import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

const FEE_TOTALS_TTL_MS = 5 * 60 * 1000;

export function peekSchoolDashboardFeeTotals(schoolId: string): {
  totalPaid: number;
  totalFee: number;
} | null {
  return getSchoolDashboardServerCached(`dashboard:fee-totals:${schoolId}`);
}

export async function getSchoolDashboardFeeTotals(schoolId: string): Promise<{
  totalPaid: number;
  totalFee: number;
}> {
  const cached = peekSchoolDashboardFeeTotals(schoolId);
  if (cached) return cached;

  const rows = await prisma.$queryRaw<Array<{ amount_paid: number | null; final_fee: number | null }>>(
    Prisma.sql`
      SELECT
        COALESCE(SUM(sf."amountPaid"), 0)::double precision AS amount_paid,
        COALESCE(SUM(sf."finalFee"), 0)::double precision AS final_fee
      FROM "StudentFee" sf
      INNER JOIN "Student" s ON s.id = sf."studentId"
      WHERE s."schoolId" = ${schoolId}
    `
  );

  const result = {
    totalPaid: Number(rows[0]?.amount_paid ?? 0),
    totalFee: Number(rows[0]?.final_fee ?? 0),
  };
  setSchoolDashboardServerCached(`dashboard:fee-totals:${schoolId}`, result, FEE_TOTALS_TTL_MS);
  return result;
}
