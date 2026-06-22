import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/db";

function dateRangeFromYmd(ymd: string | null) {
  const valid = typeof ymd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
  const d = valid ? new Date(`${valid}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return { start: d, end: next, ymd: d.toISOString().slice(0, 10) };
}

const dashboardCache = new Map<string, { expiresAt: number; summary: unknown }>();
const DASHBOARD_CACHE_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const role = String(token.role ?? "");
    if (role !== "CHAIRMAN" && role !== "SUPERADMIN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const schoolId = typeof token.schoolId === "string" ? token.schoolId.trim() : "";
    if (!schoolId) {
      return NextResponse.json({ message: "School not found in session" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const collectionDate = dateRangeFromYmd(searchParams.get("date"));
    const cacheKey = `${schoolId}:${collectionDate.ymd}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json({ summary: cached.summary });
    }

    const [summary] = await prisma.$queryRaw<
      Array<{
        schoolName: string | null;
        totalStudents: bigint;
        activeStudents: bigint;
        totalClasses: bigint;
        totalTeachers: bigint;
        grossFees: number | null;
        netFees: number | null;
        totalDiscount: number | null;
        remainingFees: number | null;
        todayCollection: number | null;
        totalCollection: number | null;
        pendingDiscounts: bigint;
        approvedDiscounts: bigint;
        rejectedDiscounts: bigint;
      }>
    >`
      SELECT
        (SELECT name FROM "School" WHERE id = ${schoolId} LIMIT 1) AS "schoolName",
        (SELECT COUNT(*) FROM "Student" WHERE "schoolId" = ${schoolId}) AS "totalStudents",
        (SELECT COUNT(*) FROM "Student" WHERE "schoolId" = ${schoolId} AND COALESCE(status, 'Active') = 'Active') AS "activeStudents",
        (SELECT COUNT(*) FROM "Class" WHERE "schoolId" = ${schoolId}) AS "totalClasses",
        (SELECT COUNT(*) FROM "User" WHERE "schoolId" = ${schoolId} AND role::text = 'TEACHER') AS "totalTeachers",
        (
          SELECT COALESCE(SUM(sf."totalFee"), 0)
          FROM "StudentFee" sf
          JOIN "Student" s ON s.id = sf."studentId"
          WHERE s."schoolId" = ${schoolId}
        ) AS "grossFees",
        (
          SELECT COALESCE(SUM(sf."finalFee"), 0)
          FROM "StudentFee" sf
          JOIN "Student" s ON s.id = sf."studentId"
          WHERE s."schoolId" = ${schoolId}
        ) AS "netFees",
        (
          SELECT COALESCE(SUM(GREATEST(sf."totalFee" - sf."finalFee", 0)), 0)
          FROM "StudentFee" sf
          JOIN "Student" s ON s.id = sf."studentId"
          WHERE s."schoolId" = ${schoolId}
        ) AS "totalDiscount",
        (
          SELECT COALESCE(SUM(sf."remainingFee"), 0)
          FROM "StudentFee" sf
          JOIN "Student" s ON s.id = sf."studentId"
          WHERE s."schoolId" = ${schoolId}
        ) AS "remainingFees",
        (
          SELECT COALESCE(SUM(p.amount), 0)
          FROM "Payment" p
          JOIN "Student" s ON s.id = p."studentId"
          WHERE s."schoolId" = ${schoolId}
            AND p.status = 'SUCCESS'
            AND p.purpose = 'FEES'
            AND p."createdAt" >= ${collectionDate.start}
            AND p."createdAt" < ${collectionDate.end}
        ) AS "todayCollection",
        (
          SELECT COALESCE(SUM(p.amount), 0)
          FROM "Payment" p
          JOIN "Student" s ON s.id = p."studentId"
          WHERE s."schoolId" = ${schoolId}
            AND p.status = 'SUCCESS'
            AND p.purpose = 'FEES'
        ) AS "totalCollection",
        (SELECT COUNT(*) FROM "FeeDiscountApproval" WHERE "schoolId" = ${schoolId} AND status::text = 'PENDING') AS "pendingDiscounts",
        (SELECT COUNT(*) FROM "FeeDiscountApproval" WHERE "schoolId" = ${schoolId} AND status::text = 'APPROVED') AS "approvedDiscounts",
        (SELECT COUNT(*) FROM "FeeDiscountApproval" WHERE "schoolId" = ${schoolId} AND status::text = 'REJECTED') AS "rejectedDiscounts"
    `;

    const responseSummary = {
        schoolName: summary?.schoolName ?? "School",
        totalStudents: Number(summary?.totalStudents ?? 0),
        activeStudents: Number(summary?.activeStudents ?? 0),
        totalClasses: Number(summary?.totalClasses ?? 0),
        totalTeachers: Number(summary?.totalTeachers ?? 0),
        grossFees: Number(summary?.grossFees ?? 0),
        netFees: Number(summary?.netFees ?? 0),
        totalDiscount: Number(summary?.totalDiscount ?? 0),
        remainingFees: Number(summary?.remainingFees ?? 0),
        todayCollection: Number(summary?.todayCollection ?? 0),
        collectionDate: collectionDate.ymd,
        totalCollection: Number(summary?.totalCollection ?? 0),
        pendingDiscounts: Number(summary?.pendingDiscounts ?? 0),
        approvedDiscounts: Number(summary?.approvedDiscounts ?? 0),
        rejectedDiscounts: Number(summary?.rejectedDiscounts ?? 0),
      };
    dashboardCache.set(cacheKey, {
      summary: responseSummary,
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    });

    return NextResponse.json({ summary: responseSummary });
  } catch (error: unknown) {
    console.error("Chairman dashboard:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load dashboard" },
      { status: 500 }
    );
  }
}
