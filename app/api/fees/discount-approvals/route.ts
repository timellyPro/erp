import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import {
  getDiscountApprovalsListCached,
  setDiscountApprovalsListCached,
} from "@/lib/discountApprovalsListCache";

const ALLOWED_ROLES = new Set(["CHAIRMAN", "SCHOOLADMIN", "SUPERADMIN"]);

type ApprovalListRow = {
  id: string;
  status: string;
  totalFee: number;
  discountPercent: number;
  discountFixedAmount: number | null;
  finalFee: number;
  discountFeeHeadLabel: string | null;
  discountRemarks: string | null;
  reviewRemarks: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  studentId: string;
  admissionNumber: string;
  fatherName: string | null;
  studentName: string | null;
  className: string | null;
  section: string | null;
  requestedByName: string | null;
  requestedByEmail: string | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
};

function mapApprovals(rows: ApprovalListRow[]) {
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    totalFee: row.totalFee,
    discountPercent: row.discountPercent,
    discountFixedAmount: row.discountFixedAmount,
    finalFee: row.finalFee,
    discountFeeHeadLabel: row.discountFeeHeadLabel,
    discountRemarks: row.discountRemarks,
    reviewRemarks: row.reviewRemarks,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    student: {
      id: row.studentId,
      admissionNumber: row.admissionNumber,
      fatherName: row.fatherName,
      user: { name: row.studentName },
      class: row.className ? { name: row.className, section: row.section } : null,
    },
    requestedBy: { name: row.requestedByName, email: row.requestedByEmail },
    reviewedBy:
      row.reviewedByName || row.reviewedByEmail
        ? { name: row.reviewedByName, email: row.reviewedByEmail }
        : null,
  }));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = String(session.user.role ?? "");
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") || "PENDING").toUpperCase();
  const schoolId =
    typeof session.user.schoolId === "string" && session.user.schoolId.trim()
      ? session.user.schoolId
      : searchParams.get("schoolId")?.trim();

  if (!schoolId) {
    return NextResponse.json({ message: "School not found in session" }, { status: 400 });
  }

  const safeStatus = ["ALL", "PENDING", "APPROVED", "REJECTED"].includes(status) ? status : "PENDING";
  const cacheKey = `${schoolId}:${safeStatus}`;
  const cached = getDiscountApprovalsListCached(cacheKey);
  if (cached) {
    return NextResponse.json({ approvals: cached });
  }

  const rows =
    safeStatus === "ALL"
      ? await prisma.$queryRaw<ApprovalListRow[]>`
    SELECT
      fda.id,
      fda.status::text AS status,
      fda."totalFee",
      fda."discountPercent",
      fda."discountFixedAmount",
      fda."finalFee",
      fda."discountFeeHeadLabel",
      fda."discountRemarks",
      fda."reviewRemarks",
      fda."reviewedAt",
      fda."createdAt",
      s.id AS "studentId",
      s."admissionNumber",
      s."fatherName",
      su.name AS "studentName",
      c.name AS "className",
      c.section,
      ru.name AS "requestedByName",
      ru.email AS "requestedByEmail",
      vu.name AS "reviewedByName",
      vu.email AS "reviewedByEmail"
    FROM "FeeDiscountApproval" fda
    JOIN "Student" s ON s.id = fda."studentId"
    LEFT JOIN "User" su ON su.id = s."userId"
    LEFT JOIN "Class" c ON c.id = s."classId"
    LEFT JOIN "User" ru ON ru.id = fda."requestedById"
    LEFT JOIN "User" vu ON vu.id = fda."reviewedById"
    WHERE fda."schoolId" = ${schoolId}
    ORDER BY fda."createdAt" DESC
    LIMIT 100
  `
      : await prisma.$queryRaw<ApprovalListRow[]>`
    SELECT
      fda.id,
      fda.status::text AS status,
      fda."totalFee",
      fda."discountPercent",
      fda."discountFixedAmount",
      fda."finalFee",
      fda."discountFeeHeadLabel",
      fda."discountRemarks",
      fda."reviewRemarks",
      fda."reviewedAt",
      fda."createdAt",
      s.id AS "studentId",
      s."admissionNumber",
      s."fatherName",
      su.name AS "studentName",
      c.name AS "className",
      c.section,
      ru.name AS "requestedByName",
      ru.email AS "requestedByEmail",
      vu.name AS "reviewedByName",
      vu.email AS "reviewedByEmail"
    FROM "FeeDiscountApproval" fda
    JOIN "Student" s ON s.id = fda."studentId"
    LEFT JOIN "User" su ON su.id = s."userId"
    LEFT JOIN "Class" c ON c.id = s."classId"
    LEFT JOIN "User" ru ON ru.id = fda."requestedById"
    LEFT JOIN "User" vu ON vu.id = fda."reviewedById"
    WHERE fda."schoolId" = ${schoolId}
      AND fda.status = CAST(${safeStatus} AS "DiscountApprovalStatus")
    ORDER BY fda."createdAt" DESC
    LIMIT 100
  `;

  const approvals = mapApprovals(rows);
  setDiscountApprovalsListCached(cacheKey, approvals);

  return NextResponse.json({ approvals });
}
