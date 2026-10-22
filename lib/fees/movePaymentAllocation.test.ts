import { movePaymentAllocation, type MoveDb } from "@/lib/fees/movePaymentAllocation";

const actor = { userId: null, name: "script", role: "SYSTEM" };

function makeDb(over: Partial<{ allocationType: string; amount: number }> = {}) {
  const old = {
    id: "a1",
    paymentId: "p1",
    studentId: "st1",
    headType: "EXTRA_FEE",
    componentName: "Hostel Fee (1st Installment)",
    componentIndex: null,
    extraFeeId: "hostel1",
    allocationType: over.allocationType ?? "PAYMENT",
    allocatedAmount: over.amount ?? 35750,
    createdAt: new Date("2026-06-17"),
  };
  const other = {
    ...old,
    id: "a2",
    headType: "BASE_COMPONENT",
    componentName: "Tuition",
    componentIndex: 0,
    extraFeeId: null,
    allocatedAmount: 23100,
  };
  const audit = jest.fn();
  const tx = {
    paymentAuditLog: { create: audit },
    paymentFeeAllocation: { delete: jest.fn(), create: jest.fn() },
  };
  const db = {
    paymentFeeAllocation: {
      findUnique: jest.fn().mockResolvedValue(old),
      findMany: jest.fn().mockResolvedValue([old, other]),
    },
    payment: {
      findUnique: jest.fn().mockResolvedValue({
        id: "p1",
        studentId: "st1",
        amount: 58850,
        status: "SUCCESS",
        gateway: null,
        transactionId: null,
        createdAt: new Date(),
        collectedByName: null,
        student: { schoolId: "s1" },
      }),
    },
    extraFee: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        ["mess1", "mess2", "tr1"].includes(where.id) ? { id: where.id, name: `fee ${where.id}` } : null
      ),
    },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { db: db as unknown as MoveDb, tx, audit };
}

const targets = [
  { headType: "EXTRA_FEE" as const, extraFeeId: "mess1", amount: 17050 },
  { headType: "EXTRA_FEE" as const, extraFeeId: "mess2", amount: 17050 },
  { headType: "EXTRA_FEE" as const, extraFeeId: "tr1", amount: 1650 },
];

describe("movePaymentAllocation", () => {
  it("dry run changes nothing", async () => {
    const { db, tx } = makeDb();
    const r = await movePaymentAllocation(db, { schoolId: "s1", allocationId: "a1", targets, reason: "school confirmed", actor, apply: false });
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(false);
    expect(tx.paymentFeeAllocation.delete).not.toHaveBeenCalled();
  });

  it("applies: audit row, delete the old allocation, create the new ones with the same total", async () => {
    const { db, tx, audit } = makeDb();
    const r = await movePaymentAllocation(db, { schoolId: "s1", allocationId: "a1", targets, reason: "school confirmed", actor, apply: true });
    expect(r.applied).toBe(true);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(tx.paymentFeeAllocation.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    const amounts = tx.paymentFeeAllocation.create.mock.calls.map((c: Array<{ data: { allocatedAmount: number } }>) => c[0].data.allocatedAmount);
    expect(amounts).toEqual([17050, 17050, 1650]);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(35750);
    expect(tx.paymentFeeAllocation.create.mock.calls[0][0].data).toMatchObject({
      paymentId: "p1",
      studentId: "st1",
      allocationType: "PAYMENT",
    });
  });

  it("refuses targets that do not add up to the allocation", async () => {
    const { db, tx } = makeDb();
    const r = await movePaymentAllocation(db, {
      schoolId: "s1",
      allocationId: "a1",
      targets: [{ headType: "EXTRA_FEE", extraFeeId: "mess1", amount: 17050 }],
      reason: "x",
      actor,
      apply: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/must be equal/);
    expect(tx.paymentFeeAllocation.delete).not.toHaveBeenCalled();
  });

  it("refuses a REFUND allocation, an unknown extra fee, and a payment in another school", async () => {
    let m = makeDb({ allocationType: "REFUND" });
    expect((await movePaymentAllocation(m.db, { schoolId: "s1", allocationId: "a1", targets, reason: "x", actor, apply: true })).reason).toMatch(/REFUND/);
    m = makeDb();
    const r = await movePaymentAllocation(m.db, {
      schoolId: "s1",
      allocationId: "a1",
      targets: [{ headType: "EXTRA_FEE", extraFeeId: "nope", amount: 35750 }],
      reason: "x",
      actor,
      apply: true,
    });
    expect(r.reason).toMatch(/does not exist/);
    m = makeDb();
    expect((await movePaymentAllocation(m.db, { schoolId: "other", allocationId: "a1", targets, reason: "x", actor, apply: true })).reason).toMatch(/in this school/);
  });

  it("needs a reason", async () => {
    const { db } = makeDb();
    await expect(
      movePaymentAllocation(db, { schoolId: "s1", allocationId: "a1", targets, reason: " ", actor, apply: true })
    ).rejects.toThrow(/reason/);
  });
});
