import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";
import {
  admissionListWhereSql,
  admissionRawCount,
  admissionRawIdsPage,
  admissionWorkflowByIds,
  studentApplicationHasWorkflowColumn,
} from "@/lib/admissionsListQuery";

function parseIntSafe(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Same shape as before; `workflowStatus` is merged after fetch (DB column, not Prisma client field). */
const admissionListSelect = {
  id: true,
  applicationNo: true,
  admissionNo: true,
  fedenaNo: true,
  classId: true,
  class: { select: { id: true, name: true, section: true } },
  gradeSought: true,
  boardingType: true,
  residencyType: true,
  totalFee: true,
  discountPercent: true,
  applicationFee: true,
  admissionFee: true,
  applicationFeePaid: true,
  applicationFeePaidAt: true,
  applicationFeePaymentMode: true,
  applicationFeePaymentMethod: true,
  admissionFeePaid: true,
  admissionFeePaidAt: true,
  admissionFeePaymentMode: true,
  admissionFeePaymentMethod: true,
  firstName: true,
  middleName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  aadharNo: true,
  parentName: true,
  parentPhone: true,
  parentEmail: true,
  city: true,
  state: true,
  pinCode: true,
  createdAt: true,
  studentId: true,
} as const;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const page = parseIntSafe(searchParams.get("page"), 1);
    const pageSize = Math.min(50, parseIntSafe(searchParams.get("pageSize"), 10));

    const search = (searchParams.get("search") ?? "").trim();
    const gradeSought = (searchParams.get("gradeSought") ?? "").trim();
    const boardingType = (searchParams.get("boardingType") ?? "").trim();
    const classId = (searchParams.get("classId") ?? "").trim();
    const unconvertedOnly = (searchParams.get("unconvertedOnly") ?? "").trim() === "1";
    const phaseRaw = (searchParams.get("phase") ?? "").trim().toLowerCase();
    const phase =
      phaseRaw === "pending" || phaseRaw === "upcoming" || phaseRaw === "approved"
        ? (phaseRaw as "pending" | "upcoming" | "approved")
        : ("" as const);

    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const toDateEnd = toDate && !Number.isNaN(toDate.getTime()) ? (() => {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      return end;
    })() : null;

    const skip = (page - 1) * pageSize;

    const hasWorkflowColumn = await studentApplicationHasWorkflowColumn();

    const useRawIdPipeline = phase === "pending" || phase === "upcoming";

    if (useRawIdPipeline) {
      const whereSql = admissionListWhereSql({
        schoolId,
        unconvertedOnly,
        phase,
        gradeSought,
        boardingType,
        classId,
        fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : null,
        toDateEnd,
        search,
        hasWorkflowColumn,
      });

      const [total, ids] = await Promise.all([
        admissionRawCount(whereSql),
        admissionRawIdsPage(whereSql, skip, pageSize),
      ]);

      if (ids.length === 0) {
        return NextResponse.json({ applications: [], total, page, pageSize }, { status: 200 });
      }

      const [rows, wfMap] = await Promise.all([
        prisma.studentApplication.findMany({
          where: { id: { in: ids } },
          select: admissionListSelect,
        }),
        admissionWorkflowByIds(ids, hasWorkflowColumn),
      ]);

      const byId = new Map(rows.map((r) => [r.id, r]));
      const applications = ids
        .map((id) => {
          const r = byId.get(id);
          if (!r) return null;
          return {
            ...r,
            workflowStatus: wfMap.get(id) ?? "PENDING",
          };
        })
        .filter(Boolean);

      return NextResponse.json({ applications, total, page, pageSize }, { status: 200 });
    }

    const where: Record<string, unknown> = { schoolId };
    if (unconvertedOnly) (where as { studentId: null }).studentId = null;
    if (phase === "approved") (where as { studentId: { not: null } }).studentId = { not: null };

    if (gradeSought) where.gradeSought = gradeSought;
    if (boardingType) where.boardingType = boardingType;
    if (classId) where.classId = classId;
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      where.createdAt = { ...(where.createdAt as object), gte: fromDate };
    }
    if (toDateEnd && !Number.isNaN(toDateEnd.getTime())) {
      where.createdAt = { ...(where.createdAt as object), lte: toDateEnd };
    }

    if (search) {
      where.OR = [
        { applicationNo: { contains: search, mode: "insensitive" } },
        { admissionNo: { contains: search, mode: "insensitive" } },
        { fedenaNo: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { parentName: { contains: search, mode: "insensitive" } },
        { parentPhone: { contains: search, mode: "insensitive" } },
        { aadharNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.studentApplication.count({ where: where as never }),
      prisma.studentApplication.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: admissionListSelect,
      }),
    ]);

    const ids = rows.map((r) => r.id);
    const wfMap = await admissionWorkflowByIds(ids, hasWorkflowColumn);
    const applications = rows.map((r) => ({
      ...r,
      workflowStatus:
        wfMap.get(r.id) ?? (r.studentId ? "APPROVED" : "PENDING"),
    }));

    return NextResponse.json({ applications, total, page, pageSize }, { status: 200 });
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}
