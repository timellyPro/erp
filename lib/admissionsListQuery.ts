import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

/** Cached after first lookup (restart server after applying migration). */
let workflowColumnCached: boolean | null = null;

export async function studentApplicationHasWorkflowColumn(): Promise<boolean> {
  if (workflowColumnCached !== null) return workflowColumnCached;
  try {
    const rows = await prisma.$queryRaw<[{ exists: boolean }]>(
      Prisma.sql`SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'StudentApplication'
          AND c.column_name = 'workflowStatus'
      ) AS "exists"`
    );
    workflowColumnCached = Boolean(rows[0]?.exists);
  } catch {
    workflowColumnCached = false;
  }
  return workflowColumnCached;
}

/** Raw SQL filters on "StudentApplication" aliased as `a`. */
export function admissionListWhereSql(params: {
  schoolId: string;
  unconvertedOnly: boolean;
  phase: "" | "pending" | "upcoming" | "approved";
  gradeSought: string;
  boardingType: string;
  classId: string;
  fromDate: Date | null;
  toDateEnd: Date | null;
  search: string;
  hasWorkflowColumn: boolean;
}): Prisma.Sql {
  const {
    schoolId,
    unconvertedOnly,
    phase,
    gradeSought,
    boardingType,
    classId,
    fromDate,
    toDateEnd,
    search,
    hasWorkflowColumn,
  } = params;

  const parts: Prisma.Sql[] = [Prisma.sql`a."schoolId" = ${schoolId}`];

  if (unconvertedOnly) {
    parts.push(Prisma.sql`a."studentId" IS NULL`);
  }

  if (phase === "pending") {
    if (hasWorkflowColumn) {
      parts.push(Prisma.sql`a."studentId" IS NULL AND a."workflowStatus" = 'PENDING'::"AdmissionWorkflowStatus"`);
    } else {
      parts.push(Prisma.sql`a."studentId" IS NULL`);
    }
  } else if (phase === "upcoming") {
    if (hasWorkflowColumn) {
      parts.push(Prisma.sql`a."studentId" IS NULL AND a."workflowStatus" = 'UPCOMING'::"AdmissionWorkflowStatus"`);
    } else {
      // No DB column yet: same set as Pending (Upcoming tab cannot be distinguished).
      parts.push(Prisma.sql`a."studentId" IS NULL`);
    }
  } else if (phase === "approved") {
    parts.push(Prisma.sql`a."studentId" IS NOT NULL`);
  }

  if (gradeSought) {
    parts.push(Prisma.sql`a."gradeSought" = ${gradeSought}::"Grade"`);
  }
  if (boardingType) {
    parts.push(Prisma.sql`a."boardingType" = ${boardingType}::"BoardingType"`);
  }
  if (classId) {
    parts.push(Prisma.sql`a."classId" = ${classId}`);
  }
  if (fromDate && !Number.isNaN(fromDate.getTime())) {
    parts.push(Prisma.sql`a."createdAt" >= ${fromDate}`);
  }
  if (toDateEnd && !Number.isNaN(toDateEnd.getTime())) {
    parts.push(Prisma.sql`a."createdAt" <= ${toDateEnd}`);
  }

  if (search) {
    const p = `%${search}%`;
    parts.push(Prisma.sql`(
      a."applicationNo" ILIKE ${p}
      OR COALESCE(a."admissionNo", '') ILIKE ${p}
      OR COALESCE(a."fedenaNo", '') ILIKE ${p}
      OR a."firstName" ILIKE ${p}
      OR a."lastName" ILIKE ${p}
      OR a."parentName" ILIKE ${p}
      OR a."parentPhone" ILIKE ${p}
      OR a."aadharNo" ILIKE ${p}
    )`);
  }

  return Prisma.join(parts, " AND ");
}

export async function admissionRawCount(whereSql: Prisma.Sql): Promise<number> {
  const rows = await prisma.$queryRaw<[{ c: bigint }]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS c FROM "StudentApplication" a WHERE ${whereSql}`
  );
  return Number(rows[0]?.c ?? 0);
}

export async function admissionRawIdsPage(
  whereSql: Prisma.Sql,
  skip: number,
  take: number
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT a."id" FROM "StudentApplication" a WHERE ${whereSql} ORDER BY a."createdAt" DESC LIMIT ${take} OFFSET ${skip}`
  );
  return rows.map((r) => r.id);
}

export async function admissionWorkflowByIds(
  ids: string[],
  hasWorkflowColumn: boolean
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!hasWorkflowColumn || ids.length === 0) return map;

  const rows = await prisma.$queryRaw<{ id: string; workflowStatus: string }[]>(
    Prisma.sql`SELECT "id", "workflowStatus"::text AS "workflowStatus" FROM "StudentApplication" WHERE "id" IN (${Prisma.join(
      ids.map((id) => Prisma.sql`${id}`)
    )})`
  );
  for (const r of rows) {
    map.set(r.id, r.workflowStatus);
  }
  return map;
}

type SqlExecutor = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;

/** Read studentId + workflow for gate checks. */
export async function getApplicationGateRow(
  executor: SqlExecutor,
  id: string,
  schoolId: string
): Promise<{ studentId: string | null; workflowStatus: string } | null> {
  const hasWorkflow = await studentApplicationHasWorkflowColumn();

  if (!hasWorkflow) {
    const rows = await executor.$queryRaw<Array<{ studentId: string | null }>>(
      Prisma.sql`SELECT "studentId" FROM "StudentApplication" WHERE "id" = ${id} AND "schoolId" = ${schoolId} LIMIT 1`
    );
    const r = rows[0];
    if (!r) return null;
    return {
      studentId: r.studentId,
      workflowStatus: r.studentId ? "APPROVED" : "PENDING",
    };
  }

  const rows = await executor.$queryRaw<Array<{ studentId: string | null; wf: string }>>(
    Prisma.sql`SELECT "studentId", "workflowStatus"::text AS wf FROM "StudentApplication" WHERE "id" = ${id} AND "schoolId" = ${schoolId} LIMIT 1`
  );
  const r = rows[0];
  if (!r) return null;
  return { studentId: r.studentId, workflowStatus: r.wf };
}

export async function setApplicationWorkflowPendingOrUpcoming(
  executor: SqlExecutor,
  id: string,
  schoolId: string,
  status: "PENDING" | "UPCOMING"
) {
  if (!(await studentApplicationHasWorkflowColumn())) {
    return;
  }
  if (status === "PENDING") {
    await executor.$executeRaw(
      Prisma.sql`UPDATE "StudentApplication" SET "workflowStatus" = 'PENDING'::"AdmissionWorkflowStatus" WHERE "id" = ${id} AND "schoolId" = ${schoolId}`
    );
  } else {
    await executor.$executeRaw(
      Prisma.sql`UPDATE "StudentApplication" SET "workflowStatus" = 'UPCOMING'::"AdmissionWorkflowStatus" WHERE "id" = ${id} AND "schoolId" = ${schoolId}`
    );
  }
}

export async function setApplicationEnrolled(
  executor: SqlExecutor,
  applicationId: string,
  studentId: string,
  schoolId: string
) {
  if (await studentApplicationHasWorkflowColumn()) {
    await executor.$executeRaw(
      Prisma.sql`UPDATE "StudentApplication" SET "studentId" = ${studentId}, "workflowStatus" = 'APPROVED'::"AdmissionWorkflowStatus" WHERE "id" = ${applicationId} AND "schoolId" = ${schoolId}`
    );
  } else {
    await executor.$executeRaw(
      Prisma.sql`UPDATE "StudentApplication" SET "studentId" = ${studentId} WHERE "id" = ${applicationId} AND "schoolId" = ${schoolId}`
    );
  }
}
