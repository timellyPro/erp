import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { resolveFeesSchoolId } from "@/lib/fees/resolveFeesSchoolId";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

const MAX_QUERY_LENGTH = 100;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
/** Amounts are Float rupees; match to the nearest paisa so 5000 finds 5000.0000000001. */
const AMOUNT_TOLERANCE = 0.005;

function parseYmd(raw: string | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/fees/receipt-lookup?q=&amount=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=
 *
 * Finds a payment the way a person holds it: by the receipt/UTR/reference they were given, the
 * amount, the date, or the student. It deliberately ignores the filters that hide payments in
 * the normal Transactions list (status and purpose), so PENDING, FAILED and refunded payments
 * show up, and it also searches the audit log, so a payment that was DELETED can still be found
 * together with who deleted it and when.
 *
 * School admins only: the history shows staff names.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const schoolId = await resolveFeesSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "School not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
    const amountRaw = searchParams.get("amount")?.trim();
    const amount = amountRaw ? Number(amountRaw) : null;
    const from = parseYmd(searchParams.get("from"));
    const toInclusive = parseYmd(searchParams.get("to"));
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    if (amountRaw && (amount === null || !Number.isFinite(amount) || amount <= 0)) {
      return NextResponse.json({ message: "amount must be a positive number" }, { status: 400 });
    }
    if (searchParams.get("from") && !from) {
      return NextResponse.json({ message: "from must be a date like 2026-10-07" }, { status: 400 });
    }
    if (searchParams.get("to") && !toInclusive) {
      return NextResponse.json({ message: "to must be a date like 2026-10-07" }, { status: 400 });
    }
    if (q.length < 2 && amount === null && !from && !toInclusive) {
      return NextResponse.json(
        { message: "Enter at least 2 characters of a receipt, reference, student name or admission number, or an amount or date." },
        { status: 400 }
      );
    }

    return await runInTenantScope(schoolId, async () => {
      const AND: Prisma.PaymentWhereInput[] = [{ student: { schoolId } }];

      if (q.length >= 2) {
        AND.push({
          OR: [
            { id: { equals: q } },
            { id: { startsWith: q } },
            { id: { endsWith: q } },
            { transactionId: { contains: q, mode: "insensitive" } },
            { hyperpgOrderId: { contains: q, mode: "insensitive" } },
            { hyperpgTxnId: { contains: q, mode: "insensitive" } },
            { collectedByName: { contains: q, mode: "insensitive" } },
            { student: { admissionNumber: { contains: q, mode: "insensitive" } } },
            { student: { user: { name: { contains: q, mode: "insensitive" } } } },
          ],
        });
      }
      if (amount !== null) {
        AND.push({ amount: { gte: amount - AMOUNT_TOLERANCE, lte: amount + AMOUNT_TOLERANCE } });
      }
      if (from || toInclusive) {
        const start = from ?? new Date("1970-01-01T00:00:00.000Z");
        const endExclusive = toInclusive
          ? new Date(toInclusive.getTime() + 24 * 60 * 60 * 1000)
          : new Date("2999-01-01T00:00:00.000Z");
        AND.push({ createdAt: { gte: start, lt: endExclusive } });
      }

      const payments = await prisma.payment.findMany({
        where: { AND },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          studentId: true,
          amount: true,
          status: true,
          purpose: true,
          gateway: true,
          transactionId: true,
          hyperpgOrderId: true,
          hyperpgStatus: true,
          collectedByName: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              admissionNumber: true,
              user: { select: { name: true } },
              class: { select: { name: true, section: true } },
            },
          },
          feeAllocations: {
            select: {
              headType: true,
              componentName: true,
              extraFeeId: true,
              allocationType: true,
              allocatedAmount: true,
            },
          },
          refunds: { where: { status: "SUCCESS" }, select: { amount: true } },
        },
      });

      const paymentIds = payments.map((p) => p.id);

      // Heads stored without a name (extra fees) get their current name.
      const extraIds = [
        ...new Set(
          payments.flatMap((p) =>
            p.feeAllocations.filter((a) => !a.componentName && a.extraFeeId).map((a) => a.extraFeeId as string)
          )
        ),
      ];
      const extraNames = new Map<string, string>();
      if (extraIds.length > 0) {
        const extras = await prisma.extraFee.findMany({
          where: { id: { in: extraIds }, schoolId },
          select: { id: true, name: true },
        });
        for (const e of extras) extraNames.set(e.id, e.name);
      }

      // History of the payments found.
      const history =
        paymentIds.length > 0
          ? await prisma.paymentAuditLog.findMany({
              where: { schoolId, paymentId: { in: paymentIds } },
              orderBy: { createdAt: "asc" },
              select: { id: true, paymentId: true, action: true, actorName: true, actorRole: true, summary: true, createdAt: true },
            })
          : [];
      const historyByPayment = new Map<string, typeof history>();
      for (const h of history) {
        const list = historyByPayment.get(h.paymentId) ?? [];
        list.push(h);
        historyByPayment.set(h.paymentId, list);
      }

      // Deleted payments no longer exist in Payment; the DELETE audit row is their only trace.
      const deleteOr: Prisma.PaymentAuditLogWhereInput[] = [];
      if (q.length >= 2) {
        deleteOr.push(
          { paymentId: { equals: q } },
          { paymentId: { startsWith: q } },
          { paymentId: { endsWith: q } },
          { summary: { contains: q, mode: "insensitive" } }
        );
      }
      if (amount !== null) {
        deleteOr.push({ before: { path: ["amount"], equals: amount } });
      }
      const deletedRows =
        deleteOr.length > 0
          ? await prisma.paymentAuditLog.findMany({
              where: { schoolId, action: "DELETE", AND: [{ OR: deleteOr }] },
              orderBy: { createdAt: "desc" },
              take: limit,
              select: {
                id: true,
                paymentId: true,
                studentId: true,
                actorName: true,
                actorRole: true,
                summary: true,
                createdAt: true,
                before: true,
              },
            })
          : [];
      // Skip a DELETE row whose id also came back as a live payment (it would be noise).
      const stillExisting = new Set(paymentIds);
      const deleted = deletedRows
        .filter((d) => !stillExisting.has(d.paymentId))
        .map((d) => {
          const snap = (d.before ?? {}) as Record<string, unknown>;
          return {
            auditId: d.id,
            paymentId: d.paymentId,
            studentId: d.studentId,
            deletedAt: d.createdAt,
            deletedBy: d.actorName,
            deletedByRole: d.actorRole,
            summary: d.summary,
            amount: typeof snap.amount === "number" ? snap.amount : null,
            transactionId: typeof snap.transactionId === "string" ? snap.transactionId : null,
            originalDate: typeof snap.createdAt === "string" ? snap.createdAt : null,
            heads: Array.isArray(snap.allocations)
              ? (snap.allocations as Array<Record<string, unknown>>).map((a) => ({
                  name: typeof a.name === "string" ? a.name : null,
                  amount: typeof a.amount === "number" ? a.amount : null,
                }))
              : [],
          };
        });

      const deletedStudentIds = [...new Set(deleted.map((d) => d.studentId))];
      const deletedStudents = new Map<string, { name: string | null; admissionNumber: string }>();
      if (deletedStudentIds.length > 0) {
        const studs = await prisma.student.findMany({
          where: { id: { in: deletedStudentIds }, schoolId },
          select: { id: true, admissionNumber: true, user: { select: { name: true } } },
        });
        for (const s of studs) deletedStudents.set(s.id, { name: s.user?.name ?? null, admissionNumber: s.admissionNumber });
      }

      return NextResponse.json(
        {
          payments: payments.map((p) => ({
            id: p.id,
            createdAt: p.createdAt,
            amount: p.amount,
            status: p.status,
            purpose: p.purpose,
            gateway: p.gateway,
            transactionId: p.transactionId,
            gatewayOrderId: p.hyperpgOrderId,
            gatewayStatus: p.hyperpgStatus,
            collectedByName: p.collectedByName,
            refundedTotal: p.refunds.reduce((sum, r) => sum + r.amount, 0),
            student: {
              id: p.student.id,
              name: p.student.user?.name ?? null,
              admissionNumber: p.student.admissionNumber,
              class: p.student.class ? `${p.student.class.name}${p.student.class.section ? `-${p.student.class.section}` : ""}` : null,
            },
            heads: p.feeAllocations.map((a) => ({
              name: a.componentName ?? (a.extraFeeId ? extraNames.get(a.extraFeeId) ?? "Extra fee" : "Fee"),
              amount: a.allocatedAmount,
              type: a.allocationType,
            })),
            history: (historyByPayment.get(p.id) ?? []).map((h) => ({
              id: h.id,
              action: h.action,
              actorName: h.actorName,
              actorRole: h.actorRole,
              summary: h.summary,
              createdAt: h.createdAt,
            })),
          })),
          deleted: deleted.map((d) => ({ ...d, student: deletedStudents.get(d.studentId) ?? null })),
          truncated: payments.length >= limit,
        },
        { status: 200 }
      );
    });
  } catch (error: unknown) {
    logger.error("GET /api/fees/receipt-lookup error:", error);
    return NextResponse.json(
      { message: toClientErrorMessage(error, "Internal server error") },
      { status: 500 }
    );
  }
}
