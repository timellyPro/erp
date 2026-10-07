import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import type { StudentFeeRecalcPayload } from "@/lib/studentTuitionFromStructure";

type SqlExecutor = {
  $executeRaw: (
    query: ReturnType<typeof Prisma.sql>
  ) => Promise<unknown>;
};

const BATCH_SIZE = 100;

/**
 * Upsert many StudentFee rows in few SQL round-trips (safe for ~1k+ students, one connection per batch).
 */
export async function bulkUpsertStudentFees(
  executor: SqlExecutor,
  rows: ReadonlyArray<StudentFeeRecalcPayload>
): Promise<void> {
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const now = new Date();
    const tuples = batch.map(
      (r) =>
        Prisma.sql`(${randomUUID()}, ${r.studentId}, ${r.totalFee}, ${r.discountPercent}, ${r.finalFee}, ${r.amountPaid}, ${r.remainingFee}, ${now}, ${now})`
    );

    await executor.$executeRaw(Prisma.sql`
      INSERT INTO "StudentFee" (
        id,
        "studentId",
        "totalFee",
        "discountPercent",
        "finalFee",
        "amountPaid",
        "remainingFee",
        "createdAt",
        "updatedAt"
      )
      VALUES ${Prisma.join(tuples)}
      ON CONFLICT ("studentId") DO UPDATE SET
        "totalFee" = EXCLUDED."totalFee",
        "discountPercent" = EXCLUDED."discountPercent",
        "finalFee" = EXCLUDED."finalFee",
        "remainingFee" = EXCLUDED."remainingFee",
        "updatedAt" = EXCLUDED."updatedAt"
    `);
  }
}
