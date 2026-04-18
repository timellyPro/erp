import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";

const MAX_ROWS = 800;

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
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];
    if (rowsIn.length === 0) {
      return NextResponse.json({ message: "rows array is required" }, { status: 400 });
    }
    if (rowsIn.length > MAX_ROWS) {
      return NextResponse.json(
        { message: `At most ${MAX_ROWS} rows per import` },
        { status: 400 }
      );
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

    await prisma.$transaction(async (tx) => {
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

        await tx.extraFee.create({
          data: {
            schoolId,
            name: row.feeName,
            amount: row.amount,
            targetType: "STUDENT",
            targetStudentId: studentId,
            targetClassId: null,
            targetSection: null,
          },
        });

        await tx.studentFee.update({
          where: { studentId },
          data: {
            totalFee: { increment: row.amount },
            finalFee: { increment: row.amount },
            remainingFee: { increment: row.amount },
          },
        });
        created += 1;
      }
    });

    return NextResponse.json(
      {
        created,
        failed: errors.length,
        errors: errors.slice(0, 100),
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
