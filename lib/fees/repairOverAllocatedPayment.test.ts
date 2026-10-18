/**
 * @jest-environment node
 */
import { repairOverAllocatedPayment, type RepairDb } from "@/lib/fees/repairOverAllocatedPayment";

const payment = {
  id: "pay1",
  studentId: "stu1",
  amount: 14000,
  status: "SUCCESS",
  gateway: "OFFLINE_UPI",
  transactionId: "204236739583",
  createdAt: new Date("2026-07-08T06:30:00.000Z"),
  collectedByName: "Front desk",
  student: { schoolId: "s1" },
};

const alloc = (id: string, amount: number, name: string, extra: Partial<Record<string, unknown>> = {}) => ({
  id,
  paymentId: "pay1",
  studentId: "stu1",
  headType: "EXTRA_FEE",
  componentName: name,
  componentIndex: null,
  extraFeeId: `x-${id}`,
  allocationType: "PAYMENT",
  allocatedAmount: amount,
  createdAt: new Date("2026-08-31T08:54:19.757Z"),
  ...extra,
});

/** The real case: 14,000 paid, fully allocated to last year's due, plus a 12,550 mess row on top. */
const lastYear = alloc("a-last", 14000, "Last Year 2025-2026 Fee Due");
const phantom = alloc("a-mess", 12550, "Mess Fee - 1st Installment", {
  createdAt: new Date("2026-10-07T05:31:09.716Z"),
});

function makeDb(rows: Array<ReturnType<typeof alloc>>, pay: typeof payment | null = payment) {
  const order: string[] = [];
  const tx: Record<string, unknown> = {
    paymentAuditLog: {
      create: jest.fn(async (_a: unknown) => {
        order.push("audit");
      }),
    },
    paymentFeeAllocation: {
      delete: jest.fn(async (_a: unknown) => {
        order.push("delete");
      }),
    },
  };
  const db = {
    paymentFeeAllocation: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
      findMany: jest.fn(async () => rows),
      delete: jest.fn(),
    },
    payment: { findUnique: jest.fn(async () => pay) },
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  return { db: db as unknown as RepairDb, tx, order, raw: db };
}

const actor = { userId: null, name: "Maintenance script", role: "SYSTEM" };
const base = { schoolId: "s1", allocationId: "a-mess", reason: "School confirmed only 4,500 was paid toward mess", actor };

describe("repairOverAllocatedPayment", () => {
  it("is a dry run by default: reports the plan and changes nothing", async () => {
    const { db, raw } = makeDb([lastYear, phantom]);
    const res = await repairOverAllocatedPayment(db, { ...base, apply: false });
    expect(res).toMatchObject({
      ok: true,
      applied: false,
      paymentAmount: 14000,
      netAllocatedBefore: 26550,
      netAllocatedAfter: 14000,
      surplus: 12550,
    });
    expect(res.allocation).toMatchObject({ id: "a-mess", head: "Mess Fee - 1st Installment", amount: 12550 });
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("deletes only the surplus allocation, with an audit row in the same transaction, audit first", async () => {
    const { db, tx, order } = makeDb([lastYear, phantom]);
    const res = await repairOverAllocatedPayment(db, { ...base, apply: true });
    expect(res.applied).toBe(true);
    expect(order).toEqual(["audit", "delete"]);
    expect((tx.paymentFeeAllocation as { delete: jest.Mock }).delete).toHaveBeenCalledWith({ where: { id: "a-mess" } });

    const audit = (tx.paymentAuditLog as { create: jest.Mock }).create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ schoolId: "s1", paymentId: "pay1", studentId: "stu1", action: "UPDATE", actorName: "Maintenance script" });
    expect(audit.summary).toMatch(/Removed an allocation of 12550 \(Mess Fee - 1st Installment\)/);
    expect(audit.summary).toMatch(/26550 against a payment of 14000/);
    expect(audit.summary).toMatch(/School confirmed only 4,500/);
    expect(audit.before.allocationCount).toBe(2);
    expect(audit.after.allocationCount).toBe(1);
  });

  it("refuses to delete a legitimate allocation (removing it would under-allocate)", async () => {
    const { db, raw } = makeDb([lastYear, phantom]);
    const res = await repairOverAllocatedPayment(db, { ...base, allocationId: "a-last", apply: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/under-allocated/);
    expect(res.applied).toBe(false);
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when the payment is not over-allocated", async () => {
    const { db } = makeDb([lastYear]);
    const res = await repairOverAllocatedPayment(db, { ...base, allocationId: "a-last", apply: true });
    expect(res.reason).toMatch(/not over-allocated/);
    expect(res.applied).toBe(false);
  });

  it("refuses a REFUND allocation", async () => {
    const refund = alloc("a-ref", 500, "Refund", { allocationType: "REFUND" });
    const { db } = makeDb([lastYear, phantom, refund]);
    const res = await repairOverAllocatedPayment(db, { ...base, allocationId: "a-ref", apply: true });
    expect(res.reason).toMatch(/REFUND/);
    expect(res.applied).toBe(false);
  });

  it("refuses an allocation from another school's payment", async () => {
    const { db } = makeDb([lastYear, phantom], { ...payment, student: { schoolId: "other" } });
    const res = await repairOverAllocatedPayment(db, { ...base, apply: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/does not belong/);
    expect(res.applied).toBe(false);
  });

  it("reports an unknown allocation id", async () => {
    const { db } = makeDb([lastYear, phantom]);
    const res = await repairOverAllocatedPayment(db, { ...base, allocationId: "nope", apply: true });
    expect(res.reason).toBe("Allocation not found");
  });

  it("requires a reason, because it is written to the payment's history", async () => {
    const { db } = makeDb([lastYear, phantom]);
    await expect(repairOverAllocatedPayment(db, { ...base, reason: "  ", apply: true })).rejects.toThrow(/reason is required/);
  });

  it("counts refund allocations against the surplus (net, not gross)", async () => {
    // 14,000 paid; 14,000 + 12,550 allocated but 12,550 already refunded back -> not over-allocated
    const refund = alloc("a-ref", 12550, "Refund", { allocationType: "REFUND" });
    const { db } = makeDb([lastYear, phantom, refund]);
    const res = await repairOverAllocatedPayment(db, { ...base, apply: true });
    expect(res.applied).toBe(false);
    expect(res.reason).toMatch(/not over-allocated/);
  });
});
