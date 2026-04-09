import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";

function parseIntSafe(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

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

    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const where: any = { schoolId };
    if (unconvertedOnly) where.studentId = null;

    if (gradeSought) where.gradeSought = gradeSought;
    if (boardingType) where.boardingType = boardingType;
    if (classId) where.classId = classId;
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      where.createdAt = { ...(where.createdAt ?? {}), gte: fromDate };
    }
    if (toDate && !Number.isNaN(toDate.getTime())) {
      // include whole day for date-only values
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { ...(where.createdAt ?? {}), lte: end };
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

    const [total, applications] = await Promise.all([
      prisma.studentApplication.count({ where }),
      prisma.studentApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
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
        },
      }),
    ]);

    return NextResponse.json({ applications, total, page, pageSize }, { status: 200 });
  } catch (e: unknown) {
    const err = e as { message?: string; statusCode?: number };
    return NextResponse.json(
      { message: err?.message ?? "Internal server error" },
      { status: err?.statusCode ?? 500 }
    );
  }
}

