import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";

const MAX_ROWS = 800;
const WRITE_BATCH_SIZE = 100;

function normKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function normTimellyToken(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("/")) {
    const parts = t.split("/").map((p) => p.trim()).filter(Boolean);
    return parts[parts.length - 1]!.toLowerCase();
  }
  return t.toLowerCase();
}

type IncomingRow = {
  timellyId?: unknown;
  feeName?: unknown;
  amount?: unknown;
  studentName?: unknown;
};

async function cleanupStudentExtraFeeDuplicates(
  schoolId: string,
  onlyNameKeys?: Set<string>
) {
  const nameFilterSql =
    onlyNameKeys && onlyNameKeys.size > 0
      ? Prisma.sql`AND lower(regexp_replace(trim(e.name), '\s+', ' ', 'g')) IN (${Prisma.join(
          [...onlyNameKeys]
        )})`
      : Prisma.empty;

  const rows = await prisma.$transaction(async (tx) =>
    tx.$queryRaw<Array<{ deletedCount: number }>>(Prisma.sql`
      WITH ranked AS (
        SELECT
          e.id,
          e."targetStudentId" AS student_id,
          e.amount,
          ROW_NUMBER() OVER (
            PARTITION BY e."targetStudentId", lower(regexp_replace(trim(e.name), '\s+', ' ', 'g'))
            ORDER BY e."createdAt" ASC, e.id ASC
          ) AS rn
        FROM "ExtraFee" e
        WHERE e."schoolId" = ${schoolId}
          AND e."targetType" = 'STUDENT'
          AND e."targetStudentId" IS NOT NULL
          ${nameFilterSql}
      ),
      deleted AS (
        DELETE FROM "ExtraFee" e
        USING ranked r
        WHERE e.id = r.id
          AND r.rn > 1
        RETURNING e."targetStudentId" AS student_id, e.amount
      ),
      agg AS (
        SELECT
          student_id,
          SUM(amount)::double precision AS total_amount,
          COUNT(*)::int AS deleted_count
        FROM deleted
        GROUP BY student_id
      ),
      updated AS (
        UPDATE "StudentFee" sf
        SET
          "totalFee" = sf."totalFee" - agg.total_amount,
          "finalFee" = sf."finalFee" - agg.total_amount,
          "remainingFee" = sf."remainingFee" - agg.total_amount
        FROM agg
        WHERE sf."studentId" = agg.student_id
        RETURNING agg.deleted_count
      )
      SELECT COALESCE(SUM(updated.deleted_count), 0)::int AS "deletedCount"
      FROM updated
    `)
  );

  return rows[0]?.deletedCount ?? 0;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const canManageFees =
    session.user.role === "SCHOOLADMIN" ||
    session.user.role === "SUPERADMIN" ||
    session.user.role === "TEACHER";
  if (!canManageFees) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const cleanupDuplicates = Boolean(body.cleanupDuplicates);
    const cleanupFeeNamesRaw: unknown[] = Array.isArray(body.cleanupFeeNames)
      ? body.cleanupFeeNames
      : [];
    const cleanupFeeNames = cleanupFeeNamesRaw
      .map((n) => String(n ?? "").trim())
      .filter((n: string) => n.length > 0);
    const cleanupNameKeys =
      cleanupFeeNames.length > 0 ? new Set(cleanupFeeNames.map((n) => normKey(n))) : undefined;
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];
    if (rowsIn.length === 0 && !cleanupDuplicates && !cleanupNameKeys) {
      return NextResponse.json({ message: "rows array is required" }, { status: 400 });
    }
    if (rowsIn.length > MAX_ROWS) {
      return NextResponse.json(
        { message: `At most ${MAX_ROWS} rows per import` },
        { status: 400 }
      );
    }

    let cleanedDuplicates = 0;
    if (cleanupDuplicates || cleanupNameKeys) {
      cleanedDuplicates = await cleanupStudentExtraFeeDuplicates(schoolId, cleanupNameKeys);
      if (rowsIn.length === 0) {
        return NextResponse.json(
          {
            created: 0,
            failed: 0,
            errors: [],
            cleanedDuplicates,
          },
          { status: 200 }
        );
      }
    }

    const students = await prisma.student.findMany({
      where: { schoolId },
      select: {
        id: true,
        rollNo: true,
        admissionNumber: true,
        user: { select: { name: true } },
        application: { select: { rollNo: true } },
        fee: { select: { id: true } },
      },
    });

    /** timelly token -> student ids (ambiguous if size > 1) */
    const tokenToIds = new Map<string, Set<string>>();
    const addToken = (token: string, studentId: string) => {
      if (!token) return;
      if (!tokenToIds.has(token)) tokenToIds.set(token, new Set());
      tokenToIds.get(token)!.add(studentId);
    };

    for (const s of students) {
      if (s.rollNo?.trim()) addToken(normTimellyToken(s.rollNo), s.id);
      if (s.application?.rollNo?.trim()) addToken(normTimellyToken(s.application.rollNo), s.id);
      if (s.admissionNumber?.trim()) {
        addToken(normTimellyToken(s.admissionNumber), s.id);
        const parts = s.admissionNumber.split("/").map((p) => p.trim()).filter(Boolean);
        if (parts.length > 1) addToken(parts[parts.length - 1]!.toLowerCase(), s.id);
      }
    }

    const studentById = new Map(students.map((s) => [s.id, s]));

    type RowErr = { index: number; timellyId: string; message: string };
    const errors: RowErr[] = [];
    let created = 0;

    const normalizedRows: Array<{
      index: number;
      token: string;
      feeName: string;
      amount: number;
      expectedName?: string;
    }> = [];

    rowsIn.forEach((raw: IncomingRow, i: number) => {
      const index = i + 1;
      const tid = String(raw.timellyId ?? "").trim();
      const feeName = String(raw.feeName ?? "").trim();
      const amountNum =
        typeof raw.amount === "number" ? raw.amount : parseFloat(String(raw.amount ?? "").trim());
      const studentName =
        raw.studentName === undefined || raw.studentName === null || raw.studentName === ""
          ? undefined
          : String(raw.studentName).trim();

      if (!tid) {
        errors.push({ index, timellyId: "", message: "Timelly ID is empty" });
        return;
      }
      if (!feeName) {
        errors.push({ index, timellyId: tid, message: "Fee name is empty" });
        return;
      }
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        errors.push({ index, timellyId: tid, message: "Amount must be a positive number" });
        return;
      }

      normalizedRows.push({
        index,
        token: normTimellyToken(tid),
        feeName,
        amount: amountNum,
        expectedName: studentName,
      });
    });

    const acceptedRows: Array<{
      index: number;
      timellyId: string;
      studentId: string;
      feeName: string;
      feeNameKey: string;
      amount: number;
    }> = [];
    const uploadSeen = new Set<string>();

    for (const row of normalizedRows) {
      const candidates = tokenToIds.get(row.token);
      if (!candidates || candidates.size === 0) {
        errors.push({
          index: row.index,
          timellyId: row.token,
          message: "No student found for this Timelly ID",
        });
        continue;
      }
      if (candidates.size > 1) {
        errors.push({
          index: row.index,
          timellyId: row.token,
          message: "Multiple students match this ID; use a unique roll / admission value",
        });
        continue;
      }
      const studentId = [...candidates][0]!;
      const st = studentById.get(studentId);
      if (!st?.fee) {
        errors.push({
          index: row.index,
          timellyId: row.token,
          message: "Student has no fee record",
        });
        continue;
      }

      if (row.expectedName) {
        const want = normKey(row.expectedName);
        if (want) {
          const actual = normKey(st.user.name || "");
          if (!actual) {
            errors.push({
              index: row.index,
              timellyId: row.token,
              message: "Student name missing on file; cannot verify sheet name",
            });
            continue;
          }
          if (!actual.includes(want) && !want.includes(actual)) {
            errors.push({
              index: row.index,
              timellyId: row.token,
              message: `Name mismatch (sheet: "${row.expectedName}", student: "${st.user.name}")`,
            });
            continue;
          }
        }
      }

      acceptedRows.push({
        index: row.index,
        timellyId: row.token,
        studentId,
        feeName: row.feeName,
        feeNameKey: normKey(row.feeName),
        amount: row.amount,
      });
    }

    const targetStudentIds = [...new Set(acceptedRows.map((r) => r.studentId))];
    const existingFees = targetStudentIds.length
      ? await prisma.extraFee.findMany({
          where: {
            schoolId,
            targetType: "STUDENT",
            targetStudentId: { in: targetStudentIds },
          },
          select: { targetStudentId: true, name: true },
        })
      : [];
    const existingNameByStudent = new Set(
      existingFees
        .filter((f) => f.targetStudentId)
        .map((f) => `${f.targetStudentId}::${normKey(f.name)}`)
    );
    const writeRows = acceptedRows.filter((row) => {
      const key = `${row.studentId}::${row.feeNameKey}`;
      if (existingNameByStudent.has(key)) {
        errors.push({
          index: row.index,
          timellyId: row.timellyId,
          message: `Duplicate extra fee name "${row.feeName}" for this student`,
        });
        return false;
      }
      if (uploadSeen.has(key)) {
        errors.push({
          index: row.index,
          timellyId: row.timellyId,
          message: `Duplicate extra fee name "${row.feeName}" repeated in upload`,
        });
        return false;
      }
      uploadSeen.add(key);
      return true;
    });

    for (let i = 0; i < writeRows.length; i += WRITE_BATCH_SIZE) {
      const batch = writeRows.slice(i, i + WRITE_BATCH_SIZE);
      const incrementByAmount = new Map<number, string[]>();
      for (const row of batch) {
        const ids = incrementByAmount.get(row.amount) ?? [];
        ids.push(row.studentId);
        incrementByAmount.set(row.amount, ids);
      }

      // Group by amount to reduce query count and connection pressure.
      const feeUpdates = [...incrementByAmount.entries()].map(([amount, studentIds]) =>
        prisma.studentFee.updateMany({
          where: { studentId: { in: studentIds } },
          data: {
            totalFee: { increment: amount },
            finalFee: { increment: amount },
            remainingFee: { increment: amount },
          },
        })
      );

      await prisma.extraFee.createMany({
        data: batch.map((row) => ({
          schoolId,
          name: row.feeName,
          amount: row.amount,
          targetType: "STUDENT",
          targetStudentId: row.studentId,
          targetClassId: null,
          targetSection: null,
        })),
      });
      if (feeUpdates.length) {
        await prisma.$transaction(feeUpdates);
      }

      created += batch.length;
    }

    return NextResponse.json(
      {
        created,
        failed: errors.length,
        errors: errors.slice(0, 100),
        cleanedDuplicates,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("POST /api/fees/extra/bulk-by-timelly error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
