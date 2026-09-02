import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { admissionFeeTotalsByChannel } from "@/lib/admissionFeeCollectionChannel";
import prisma from "@/lib/db";
import { assertCanManageAdmissions, getSessionSchoolId } from "../_utils";

function parseYmd(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const d = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfUtcDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const d = new Date(`${value.trim()}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    assertCanManageAdmissions(session.user.role);

    const schoolId = await getSessionSchoolId(session);
    if (!schoolId) return NextResponse.json({ message: "School not found in session" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const defaultTo = new Date();
    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 89);

    const from = parseYmd(fromParam) ?? defaultFrom;
    const to = endOfUtcDay(toParam) ?? endOfUtcDay(defaultTo.toISOString().slice(0, 10))!;

    if (from > to) {
      return NextResponse.json({ message: "Invalid date range: from is after to" }, { status: 400 });
    }

    const apps = await prisma.studentApplication.findMany({
      where: {
        schoolId,
        admissionFeePaid: true,
        admissionFeePaidAt: { not: null, gte: from, lte: to },
        admissionFee: { gt: 0 },
      },
      select: {
        id: true,
        applicationNo: true,
        firstName: true,
        middleName: true,
        lastName: true,
        admissionFee: true,
        admissionFeePaidAt: true,
        admissionFeePaymentMode: true,
        admissionFeePaymentMethod: true,
        class: { select: { name: true, section: true } },
        gradeSought: true,
      },
      orderBy: { admissionFeePaidAt: "desc" },
    });

    type Row = {
      id: string;
      applicationNo: string;
      applicantName: string;
      classOrGrade: string;
      admissionFee: number;
      paidAtIso: string;
      paymentMode: string | null;
      paymentMethod: string | null;
    };

    const applications: Row[] = apps.map((a) => {
      const name = [a.firstName, a.middleName, a.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const cls = a.class
        ? `${a.class.name}${a.class.section ? `-${a.class.section}` : ""}`
        : String(a.gradeSought ?? "—");
      const paidAt = a.admissionFeePaidAt!;
      return {
        id: a.id,
        applicationNo: a.applicationNo,
        applicantName: name || "—",
        classOrGrade: cls,
        admissionFee: Number(a.admissionFee) || 0,
        paidAtIso: paidAt.toISOString(),
        paymentMode: a.admissionFeePaymentMode ?? null,
        paymentMethod: a.admissionFeePaymentMethod ?? null,
      };
    });

    const dayMap = new Map<string, { count: number; amount: number }>();
    const monthMap = new Map<string, { count: number; amount: number }>();

    for (const r of applications) {
      const d = new Date(r.paidAtIso);
      const dayKey = d.toISOString().slice(0, 10);
      const monthKey = d.toISOString().slice(0, 7);

      const bump = (m: Map<string, { count: number; amount: number }>, key: string, amt: number) => {
        const cur = m.get(key) ?? { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += amt;
        m.set(key, cur);
      };

      bump(dayMap, dayKey, r.admissionFee);
      bump(monthMap, monthKey, r.admissionFee);
    }

    const byDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, count: v.count, amount: v.amount }));

    const byMonth = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, count: v.count, amount: v.amount }));

    const totals = applications.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.amount += r.admissionFee;
        return acc;
      },
      { count: 0, amount: 0 }
    );
    totals.amount = Math.round(totals.amount * 100) / 100;

    const totalsByChannel = admissionFeeTotalsByChannel(applications);

    return NextResponse.json(
      {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        applications,
        byDay,
        byMonth,
        totals,
        totalsByChannel,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 403) {
      return NextResponse.json({ message: "You do not have permission to manage admissions" }, { status: 403 });
    }
    console.error("Admission fee report error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
