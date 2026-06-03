import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { resolveFeesSchoolId } from "@/lib/resolveFeesSchoolId";
import { structureMultiplierAfterDiscount } from "@/lib/studentTuitionFromStructure";
import { extraFeeAppliesToStudent } from "@/lib/extraFeeResidencyScope";
import { isStudentRte, isTuitionNamedExtraFee } from "@/lib/studentRte";
import { withRequestTiming } from "@/lib/requestTiming";
import { tenantCacheKey, swrGet, swrSet } from "@/lib/tenantCache";
import {
  getSchoolDashboardServerCached,
  setSchoolDashboardServerCached,
} from "@/lib/schoolDashboardServerCache";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  const isTeacher = session.user.role === "TEACHER";
  if (!isAdmin && !isTeacher) {
    return NextResponse.json(
      { message: "Only school staff can view fee summary" },
      { status: 403 }
    );
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }
    return await withRequestTiming(
      { route: "GET /api/fees/summary", schoolId, userId: session.user.id },
      async () => {
        // Cursor pagination (by studentFee.studentId which is unique).
        const { searchParams } = new URL(req.url);
        const statsOnly = searchParams.get("statsOnly") === "1";

        if (statsOnly) {
          const memKey = `fees:summary:stats:${schoolId}`;
          const memCached = getSchoolDashboardServerCached<{
            fees: unknown[];
            stats: unknown;
            nextCursor: null;
          }>(memKey);
          if (memCached) {
            return NextResponse.json(memCached, { status: 200 });
          }

          const [agg, pendingCount] = await Promise.all([
            prisma.studentFee.aggregate({
              where: { student: { schoolId } },
              _sum: { totalFee: true, finalFee: true, amountPaid: true, remainingFee: true },
              _count: { _all: true },
            }),
            prisma.studentFee.count({
              where: { student: { schoolId }, remainingFee: { gt: 0.01 } },
            }),
          ]);

          const stats = {
            totalStudents: agg._count._all ?? 0,
            totalFee: agg._sum.totalFee ?? 0,
            totalCollected: agg._sum.amountPaid ?? 0,
            totalDue: agg._sum.remainingFee ?? 0,
            totalDiscount: Math.max(0, (agg._sum.totalFee ?? 0) - (agg._sum.finalFee ?? 0)),
            pending: pendingCount,
            paid: 0,
          };

          const payload = { fees: [] as unknown[], stats, nextCursor: null };
          setSchoolDashboardServerCached(memKey, payload, 20_000);
          return NextResponse.json(payload, { status: 200 });
        }

        const takeParam = searchParams.get("take");
        const takeRaw = takeParam ? Number(takeParam) : 50;
        const take = Math.min(100, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : 50));
        const cursor = searchParams.get("cursor")?.trim() || null;

        const memPageKey = `fees:summary:page:${schoolId}:${take}:${cursor ?? "0"}`;
        const memPage = getSchoolDashboardServerCached(memPageKey);
        if (memPage) {
          return NextResponse.json(memPage, { status: 200 });
        }

        const cacheKey = await tenantCacheKey(schoolId, "api", "fees:summary:page", { take, cursor });
        const cached = await swrGet<{ fees: unknown[]; stats: unknown; nextCursor: string | null }>(cacheKey);
        const now = Date.now();
        if (cached && now < cached.freshUntil) {
          return NextResponse.json({ ...(cached.value as any), cache: "fresh" }, { status: 200 });
        }

        const fees = await prisma.studentFee.findMany({
          where: { student: { schoolId } },
          include: {
            student: {
              select: {
                id: true,
                residencyType: true,
                class: { select: { id: true, name: true, section: true } },
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
          orderBy: [{ updatedAt: "desc" }, { studentId: "desc" }],
          take: take + 1,
          ...(cursor ? { cursor: { studentId: cursor }, skip: 1 } : {}),
        });

        const hasNext = fees.length > take;
        const pageFees = hasNext ? fees.slice(0, take) : fees;
        const nextCursor = hasNext ? pageFees[pageFees.length - 1]?.studentId ?? null : null;

        const studentIds = pageFees.map((f) => f.studentId);

        const classIds = Array.from(
          new Set(
            pageFees
              .map((f) => f.student.class?.id)
              .filter((x): x is string => typeof x === "string" && x.length > 0)
          )
        );

    const [structures, extraFees, latestPayments, agg] = await Promise.all([
      prisma.classFeeStructure.findMany({
        where: { classId: { in: classIds } },
        select: { classId: true, components: true },
      }),
      prisma.extraFee.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          amount: true,
          targetType: true,
          targetClassId: true,
          targetSection: true,
          targetStudentId: true,
          residencyScope: true,
        },
      }),
      // Pick the fee-head that was allocated in the latest SUCCESS payment for each student.
      // This keeps the UI to "only one" fee type (the last one they selected).
      prisma.payment.findMany({
        where: {
          studentId: { in: studentIds },
          status: "SUCCESS",
          purpose: "FEES",
        },
        distinct: ["studentId"],
        orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
        select: { id: true, studentId: true },
      }),
      // Stats are computed for the full school, not just the current page.
      // Keep this as a fast aggregate (single query).
      prisma.studentFee.aggregate({
        where: { student: { schoolId } },
        _sum: { totalFee: true, finalFee: true, amountPaid: true, remainingFee: true },
        _count: { _all: true },
      }),
    ]);

    const componentsByClassId = new Map<string, Array<{ name: string; amount: number }>>(
      structures.map((s) => [
        s.classId,
        (Array.isArray(s.components) ? (s.components as any[]) : []).map((c) => ({
          name: String(c?.name ?? "Component"),
          amount: Number(c?.amount ?? 0) || 0,
        })),
      ])
    );

    const latestPaymentIdByStudentId = new Map(latestPayments.map((p) => [p.studentId, p.id]));
    const latestPaymentIds = Array.from(latestPaymentIdByStudentId.values());

    const extraFeeNameById = new Map(extraFees.map((ef) => [ef.id, ef.name]));

    const selectedHeadByStudentId = new Map<
      string,
      { headKey: string; label: string }
    >();

    if (latestPaymentIds.length > 0) {
      const latestPaymentAllocations = await prisma.paymentFeeAllocation.findMany({
        where: {
          paymentId: { in: latestPaymentIds },
          allocationType: "PAYMENT",
        },
        select: {
          paymentId: true,
          headType: true,
          componentIndex: true,
          componentName: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      });

      const studentIdByPaymentId = new Map(latestPayments.map((p) => [p.id, p.studentId]));

      const headAmountByPaymentId = new Map<
        string,
        Map<string, { headKey: string; label: string; amount: number }>
      >();

      for (const a of latestPaymentAllocations) {
        if (a.allocatedAmount <= 0.00001) continue;
        const studentId = studentIdByPaymentId.get(a.paymentId);
        if (!studentId) continue;

        let headKey = "";
        let label = "";
        if (a.headType === "BASE_COMPONENT") {
          const idx = typeof a.componentIndex === "number" ? a.componentIndex : null;
          if (idx === null) continue;
          headKey = `BASE:${idx}`;
          label = a.componentName || `Component ${idx + 1}`;
        } else if (a.headType === "EXTRA_FEE") {
          if (!a.extraFeeId) continue;
          headKey = `EXTRA:${a.extraFeeId}`;
          label = extraFeeNameById.get(a.extraFeeId) ?? "Extra Fee";
        } else {
          continue;
        }

        const perPayment = headAmountByPaymentId.get(a.paymentId) ?? new Map();
        headAmountByPaymentId.set(a.paymentId, perPayment);

        const existing = perPayment.get(headKey);
        if (!existing) {
          perPayment.set(headKey, { headKey, label, amount: a.allocatedAmount });
        } else {
          perPayment.set(headKey, { ...existing, amount: existing.amount + a.allocatedAmount });
        }
      }

      for (const [paymentId, perHead] of headAmountByPaymentId.entries()) {
        const studentId = studentIdByPaymentId.get(paymentId);
        if (!studentId) continue;

        let best: { headKey: string; label: string; amount: number } | null = null;
        for (const v of perHead.values()) {
          if (!best || v.amount > best.amount) best = v;
        }
        if (best) selectedHeadByStudentId.set(studentId, { headKey: best.headKey, label: best.label });
      }
    }

    const [paymentAllocs, refundAllocs] = await Promise.all([
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: { in: studentIds },
          allocationType: "PAYMENT",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: {
          studentId: true,
          headType: true,
          componentIndex: true,
          componentName: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      }),
      prisma.paymentFeeAllocation.findMany({
        where: {
          studentId: { in: studentIds },
          allocationType: "REFUND",
          payment: { status: { in: [...FEE_ALLOCATION_PAYMENT_STATUSES] } },
        },
        select: {
          studentId: true,
          headType: true,
          componentIndex: true,
          componentName: true,
          extraFeeId: true,
          allocatedAmount: true,
        },
      }),
    ]);

    const netPaidByStudentHead = new Map<string, number>(); // `${studentId}|${headKey}`
    const allocationsNetTotalByStudent = new Map<string, number>();

    const addNet = (studentId: string, headKey: string, delta: number) => {
      const composedKey = `${studentId}|${headKey}`;
      netPaidByStudentHead.set(composedKey, (netPaidByStudentHead.get(composedKey) ?? 0) + delta);
      allocationsNetTotalByStudent.set(studentId, (allocationsNetTotalByStudent.get(studentId) ?? 0) + delta);
    };

    for (const a of paymentAllocs) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex !== "number") continue;
        addNet(a.studentId, `BASE:${a.componentIndex}`, a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE") {
        if (!a.extraFeeId) continue;
        addNet(a.studentId, `EXTRA:${a.extraFeeId}`, a.allocatedAmount);
      }
    }
    for (const a of refundAllocs) {
      if (a.headType === "BASE_COMPONENT") {
        if (typeof a.componentIndex !== "number") continue;
        addNet(a.studentId, `BASE:${a.componentIndex}`, -a.allocatedAmount);
      } else if (a.headType === "EXTRA_FEE") {
        if (!a.extraFeeId) continue;
        addNet(a.studentId, `EXTRA:${a.extraFeeId}`, -a.allocatedAmount);
      }
    }

        const feesWithTypes = pageFees.map((fee) => {
      const studentId = fee.studentId;
      const classId = fee.student.class?.id ?? null;
      const classSection = fee.student.class?.section ?? null;

      const selectedHead = selectedHeadByStudentId.get(studentId) ?? null;
      const targetHeadKey = selectedHead?.headKey ?? null;

      const structMult = structureMultiplierAfterDiscount(fee.discountPercent);
      const totalSnapshotDue = Math.max(fee.finalFee, 0);
      const allocationsNetTotal = allocationsNetTotalByStudent.get(studentId) ?? 0;
      const legacyPaidTotal = Math.max(fee.amountPaid - allocationsNetTotal, 0);

      const baseComponents = classId ? componentsByClassId.get(classId) ?? [] : [];

      const residency = fee.student.residencyType ?? "Day Scholar";
      const applicableExtraFees = extraFees.filter((ef) => {
        if (!extraFeeAppliesToStudent({ name: ef.name, residencyScope: ef.residencyScope }, residency))
          return false;
        if (isStudentRte(residency) && isTuitionNamedExtraFee(ef.name)) return false;
        if (ef.targetType === "SCHOOL") return true;
        if (ef.targetType === "CLASS") return !!classId && ef.targetClassId === classId;
        if (ef.targetType === "SECTION")
          return !!classId && ef.targetClassId === classId && ef.targetSection === classSection;
        if (ef.targetType === "STUDENT") return ef.targetStudentId === studentId;
        return false;
      });

      let selectedDueLabel = selectedHead?.label ?? "-";
      let selectedDueAmount = 0;

      for (let i = 0; i < baseComponents.length; i++) {
        const headKey = `BASE:${i}`;
        const snapshotDue = isStudentRte(residency) ? 0 : baseComponents[i].amount * structMult;
        const paidAlloc = netPaidByStudentHead.get(`${studentId}|${headKey}`) ?? 0;
        const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (snapshotDue / totalSnapshotDue) : 0;
        const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
        const dueBefore = Math.max(snapshotDue - paidBefore, 0);
        if (targetHeadKey && headKey === targetHeadKey) {
          selectedDueAmount = dueBefore;
        } else if (!targetHeadKey) {
          // Fallback: show the head with the highest remaining due.
          if (dueBefore > 0.01 && dueBefore > selectedDueAmount) {
            selectedDueAmount = dueBefore;
            selectedDueLabel = baseComponents[i].name || `Component ${i + 1}`;
          }
        }
      }

      for (const ef of applicableExtraFees) {
        const headKey = `EXTRA:${ef.id}`;
        const snapshotDue = Number(ef.amount) || 0;
        const paidAlloc = netPaidByStudentHead.get(`${studentId}|${headKey}`) ?? 0;
        const paidLegacy = totalSnapshotDue > 0 ? legacyPaidTotal * (snapshotDue / totalSnapshotDue) : 0;
        const paidBefore = Math.max(paidAlloc + paidLegacy, 0);
        const dueBefore = Math.max(snapshotDue - paidBefore, 0);
        if (targetHeadKey && headKey === targetHeadKey) {
          selectedDueAmount = dueBefore;
        } else if (!targetHeadKey) {
          // Fallback: show the head with the highest remaining due.
          if (dueBefore > 0.01 && dueBefore > selectedDueAmount) {
            selectedDueAmount = dueBefore;
            selectedDueLabel = ef.name;
          }
        }
      }

      return {
        ...fee,
        feeTypes: selectedDueLabel,
        feeTypeDueAmount: selectedDueAmount,
      };
    });

        const stats = {
          totalStudents: agg._count._all ?? 0,
          totalFee: agg._sum.totalFee ?? 0,
          totalCollected: agg._sum.amountPaid ?? 0,
          totalDue: agg._sum.remainingFee ?? 0,
          totalDiscount: Math.max(0, (agg._sum.totalFee ?? 0) - (agg._sum.finalFee ?? 0)),
        };

        const payload = { fees: feesWithTypes, stats, nextCursor };
        setSchoolDashboardServerCached(memPageKey, payload, 15_000);
        await swrSet(
          cacheKey,
          { value: payload, freshUntil: now + 5_000, staleUntil: now + 60_000 },
          60
        );

        return NextResponse.json(payload, { status: 200 });
      }
    );
  } catch (error: any) {
    console.error("Fee summary error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

