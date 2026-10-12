const mockStudentFindFirst = jest.fn();
const mockStudentFeeFindUnique = jest.fn();
const mockStudentFeeUpdate = jest.fn();
const mockAllocGroupBy = jest.fn();
const mockPaymentFindMany = jest.fn();
const mockAllocFindMany = jest.fn();
const mockApprovalFindMany = jest.fn();
const mockStructureFindUnique = jest.fn();
const mockStructureFindFirst = jest.fn();
const mockClassFindUnique = jest.fn();
const mockClassFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
jest.mock("@/lib/db/tenantContext", () => ({
  tenantDb: {
    student: { findFirst: (...a: unknown[]) => mockStudentFindFirst(...a) },
    studentFee: {
      findUnique: (...a: unknown[]) => mockStudentFeeFindUnique(...a),
      update: (...a: unknown[]) => mockStudentFeeUpdate(...a),
    },
    paymentFeeAllocation: {
      groupBy: (...a: unknown[]) => mockAllocGroupBy(...a),
      findMany: (...a: unknown[]) => mockAllocFindMany(...a),
    },
    payment: { findMany: (...a: unknown[]) => mockPaymentFindMany(...a) },
    feeDiscountApproval: { findMany: (...a: unknown[]) => mockApprovalFindMany(...a) },
    classFeeStructure: {
      findUnique: (...a: unknown[]) => mockStructureFindUnique(...a),
      findFirst: (...a: unknown[]) => mockStructureFindFirst(...a),
    },
    class: {
      findUnique: (...a: unknown[]) => mockClassFindUnique(...a),
      findMany: (...a: unknown[]) => mockClassFindMany(...a),
    },
    extraFee: { findMany: (...a: unknown[]) => mockExtraFeeFindMany(...a) },
  },
}));

const mockLoadScope = jest.fn();
jest.mock("@/lib/fees/loadExtraFeesForStudentScope", () => ({
  loadExtraFeesForStudentScope: (...a: unknown[]) => mockLoadScope(...a),
}));
const mockSumPayments = jest.fn();
jest.mock("@/lib/fees/reconcileStudentFeeFromPayments", () => ({
  sumSuccessfulFeePayments: (...a: unknown[]) => mockSumPayments(...a),
}));
const mockCleanup = jest.fn();
jest.mock("@/lib/fees/cleanupDuplicateHostelMessExtraFees", () => ({
  cleanupDuplicateHostelMessExtraFees: (...a: unknown[]) => mockCleanup(...a),
}));
const mockMigrate = jest.fn();
jest.mock("@/lib/fees/extraFeeInstallmentDb", () => ({
  migrateUnsplitLumpExtraFees: (...a: unknown[]) => mockMigrate(...a),
}));
jest.mock("@/lib/fees/repairOrphanExtraFeeAllocations", () => ({
  repairOrphanExtraFeeAllocations: jest.fn(),
}));

import { computeAdminStudentFeeBreakdown } from "./computeAdminStudentFeeBreakdown";

/** Module-level caches are keyed by class/student id, so every test gets fresh ids. */
let seq = 0;
const nextId = (p: string) => `${p}${++seq}`;

const record = (over: Record<string, unknown> = {}) => ({
  amountPaid: 0,
  finalFee: 12000,
  totalFee: 12000,
  remainingFee: 12000,
  discountPercent: 0,
  discountFeeHeadKey: null,
  discountFeeHeadLabel: null,
  ...over,
});

type ExtraRow = {
  id: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string;
  splitIntoTwoInstallments: boolean;
};
const extraRow = (over: Partial<ExtraRow> & { id: string; name: string; amount: number }): ExtraRow => ({
  targetType: "CLASS",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  splitIntoTwoInstallments: false,
  ...over,
});

const alloc = (
  allocationType: "PAYMENT" | "REFUND",
  componentIndex: number | null,
  amount: number,
  extra?: { extraFeeId: string }
) => ({
  allocationType,
  headType: extra ? "EXTRA_FEE" : "BASE_COMPONENT",
  componentIndex: extra ? null : componentIndex,
  extraFeeId: extra?.extraFeeId ?? null,
  _sum: { allocatedAmount: amount },
});

type Setup = {
  residency?: string | null;
  fee?: Record<string, unknown> | null;
  components?: Array<{ name: string; amount: number }>;
  extras?: ExtraRow[];
  allocations?: ReturnType<typeof alloc>[];
  approvals?: Array<Record<string, unknown>>;
  noClass?: boolean;
};

function setup(s: Setup = {}) {
  const sid = nextId("st");
  const cid = nextId("cls");
  mockStudentFindFirst.mockResolvedValue({
    id: sid,
    residencyType: s.residency === undefined ? "Day Scholar" : s.residency,
    class: s.noClass ? null : { id: cid, section: "A" },
  });
  mockStudentFeeFindUnique.mockResolvedValue(s.fee === undefined ? record() : s.fee);
  // The implementation lists the student's successful payment ids first, then groups allocations by them.
  mockPaymentFindMany.mockResolvedValue([{ id: "pay1" }]);
  mockStructureFindUnique.mockResolvedValue({
    components: s.components ?? [
      { name: "Tuition", amount: 10000 },
      { name: "Lab", amount: 2000 },
    ],
  });
  mockLoadScope.mockResolvedValue(s.extras ?? []);
  mockAllocGroupBy.mockResolvedValue(s.allocations ?? []);
  mockApprovalFindMany.mockResolvedValue(s.approvals ?? []);
  return { sid, cid };
}

const NO_RECONCILE = { migrateLumps: false, reconcileTotals: false } as const;

beforeEach(() => {
  jest.resetAllMocks();
  mockAllocFindMany.mockResolvedValue([]);
  mockExtraFeeFindMany.mockResolvedValue([]);
  mockSumPayments.mockResolvedValue(0);
  mockStudentFeeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...record(), ...data }));
});

describe("computeAdminStudentFeeBreakdown guards", () => {
  it("throws when the student is not in the school", async () => {
    mockStudentFindFirst.mockResolvedValue(null);
    await expect(computeAdminStudentFeeBreakdown("sch1", "nope", NO_RECONCILE)).rejects.toThrow("Student not found");
    expect(mockStudentFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "nope", schoolId: "sch1" } }));
  });

  it("throws when the student has no fee record", async () => {
    const { sid } = setup({ fee: null });
    await expect(computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE)).rejects.toThrow(
      "Fee record not found for this student"
    );
  });

  it("uses a caller-supplied student instead of looking it up again", async () => {
    const { sid, cid } = setup();
    await computeAdminStudentFeeBreakdown("sch1", sid, {
      ...NO_RECONCILE,
      student: { id: sid, residencyType: "Day Scholar", class: { id: cid, section: "A" } },
    });
    expect(mockStudentFindFirst).not.toHaveBeenCalled();
  });

  it("only runs the hostel/mess duplicate cleanup when asked", async () => {
    const { sid } = setup();
    await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockCleanup).not.toHaveBeenCalled();
    await computeAdminStudentFeeBreakdown("sch1", sid, { ...NO_RECONCILE, cleanupHostelMessDuplicates: true });
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });
});

describe("computeAdminStudentFeeBreakdown base fees and payments", () => {
  it("lists each class fee head with its full due when nothing is paid", async () => {
    const { sid } = setup();
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads).toEqual([
      { key: "BASE:0", headType: "BASE_COMPONENT", label: "Tuition", grossAmount: 10000, snapshotAmount: 10000, dueBefore: 10000 },
      { key: "BASE:1", headType: "BASE_COMPONENT", label: "Lab", grossAmount: 2000, snapshotAmount: 2000, dueBefore: 2000 },
    ]);
    expect(r).toMatchObject({ studentId: sid, totalAmount: 12000, amountPaid: 0, remainingFee: 12000, finalFee: 12000 });
  });

  it("subtracts a partial payment from that head only", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", 0, 4000)] });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads.map((h) => h.dueBefore)).toEqual([6000, 2000]);
    expect(r).toMatchObject({ amountPaid: 4000, remainingFee: 8000 });
  });

  it("nets refunds against payments on the same head", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", 0, 4000), alloc("REFUND", 0, 1000)] });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads[0].dueBefore).toBe(7000);
    expect(r.amountPaid).toBe(3000);
  });

  it("caps an overpaid head at zero due and counts only the head's own value as paid", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", 0, 15000)] });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads[0].dueBefore).toBe(0);
    expect(r.amountPaid).toBe(10000);
    expect(r.remainingFee).toBe(2000);
  });

  it("spreads a legacy BASE:-1 payment across the real heads in proportion to due", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", -1, 6000)] });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads.map((h) => h.dueBefore)).toEqual([5000, 1000]);
    expect(r.amountPaid).toBe(6000);
  });

  it("has no base heads when the student has no class", async () => {
    const { sid } = setup({ noClass: true });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads).toEqual([]);
    expect(r).toMatchObject({ totalAmount: 0, remainingFee: 0 });
  });

  it("borrows the fee structure from a same-named sibling class when the class has none", async () => {
    const { sid } = setup();
    mockStructureFindUnique.mockResolvedValue(null);
    mockClassFindUnique.mockResolvedValue({ name: "Class  8", schoolId: "sch1" });
    mockClassFindMany.mockResolvedValue([
      { id: "sib1", name: "class 8" },
      { id: "other", name: "Class 9" },
    ]);
    mockStructureFindFirst.mockResolvedValue({ components: [{ name: "Donor Tuition", amount: 7000 }] });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockStructureFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: { in: ["sib1"] } } }));
    expect(r.dueHeads.map((h) => [h.label, h.snapshotAmount])).toEqual([["Donor Tuition", 7000]]);
  });
});

describe("computeAdminStudentFeeBreakdown discounts", () => {
  it("applies the fee record's overall percent to every head", async () => {
    const { sid } = setup({ fee: record({ discountPercent: 10, finalFee: 10800 }) });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads.map((h) => [h.grossAmount, h.snapshotAmount])).toEqual([
      [10000, 9000],
      [2000, 1800],
    ]);
    expect(r).toMatchObject({ totalAmount: 10800, finalFee: 10800, remainingFee: 10800 });
  });

  it("uses approved discounts instead of the record's fallback", async () => {
    const { sid } = setup({
      fee: record({ discountPercent: 50 }),
      approvals: [{ discountPercent: 0, discountFixedAmount: 1000, discountFeeHeadKey: "BASE:0", discountFeeHeadLabel: "Tuition" }],
    });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads.map((h) => h.snapshotAmount)).toEqual([9000, 2000]);
  });

  it("stacks several approved discounts on the same head", async () => {
    const { sid } = setup({
      approvals: [
        { discountPercent: 0, discountFixedAmount: 1000, discountFeeHeadKey: "BASE:0", discountFeeHeadLabel: null },
        { discountPercent: 0, discountFixedAmount: 500, discountFeeHeadKey: "BASE:0", discountFeeHeadLabel: null },
      ],
    });
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads[0].snapshotAmount).toBe(8500);
  });
});

describe("computeAdminStudentFeeBreakdown extra fees", () => {
  it("adds class and student extras and flags only student-owned ones as deletable", async () => {
    const { sid } = setup();
    mockLoadScope.mockResolvedValue([
      extraRow({ id: "e1", name: "Bus", amount: 500 }),
      extraRow({ id: "e2", name: "Trip", amount: 300, targetType: "STUDENT", targetStudentId: sid }),
    ]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    const extras = r.dueHeads.filter((h) => h.headType === "EXTRA_FEE");
    expect(extras.map((h) => h.key)).toEqual(["EXTRA:e1", "EXTRA:e2"]);
    expect(extras.map((h) => h.headType === "EXTRA_FEE" && h.canDeleteOnStudentProfile)).toEqual([false, true]);
    expect(r.totalAmount).toBe(12800);
  });

  it("keeps the most specific of two identical extras (same name and amount)", async () => {
    const { sid } = setup();
    mockLoadScope.mockResolvedValue([
      extraRow({ id: "school", name: "Bus", amount: 500, targetType: "SCHOOL" }),
      extraRow({ id: "class", name: "bus ", amount: 500, targetType: "CLASS" }),
    ]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads.filter((h) => h.headType === "EXTRA_FEE").map((h) => h.key)).toEqual(["EXTRA:class"]);
  });

  it("does not charge mess to a hosteller or hostel to a day scholar", async () => {
    const rows = [extraRow({ id: "m", name: "Mess Fee", amount: 3000 }), extraRow({ id: "h", name: "Hostel Fee", amount: 4000 })];
    const host = setup({ residency: "Hosteller" });
    mockLoadScope.mockResolvedValue(rows);
    const a = await computeAdminStudentFeeBreakdown("sch1", host.sid, NO_RECONCILE);
    expect(a.dueHeads.filter((h) => h.headType === "EXTRA_FEE").map((h) => h.key)).toEqual(["EXTRA:h"]);

    const day = setup({ residency: "Day Scholar" });
    mockLoadScope.mockResolvedValue(rows);
    const b = await computeAdminStudentFeeBreakdown("sch1", day.sid, NO_RECONCILE);
    expect(b.dueHeads.filter((h) => h.headType === "EXTRA_FEE").map((h) => h.key)).toEqual(["EXTRA:m"]);
  });

  it("marks mess and hostel heads as splittable into two installments", async () => {
    const { sid } = setup();
    mockLoadScope.mockResolvedValue([extraRow({ id: "m", name: "Mess Fee", amount: 3000 })]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    const mess = r.dueHeads.find((h) => h.key === "EXTRA:m");
    expect(mess?.headType === "EXTRA_FEE" && mess.splitIntoTwoInstallments).toBe(true);
  });

  it("charges an RTE student no base fee and no tuition-named extras, but keeps other extras", async () => {
    const { sid } = setup({ residency: "RTE" });
    mockLoadScope.mockResolvedValue([
      extraRow({ id: "t", name: "Tuition Fee", amount: 800 }),
      extraRow({ id: "b", name: "Bus", amount: 500 }),
    ]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r.dueHeads.filter((h) => h.headType === "BASE_COMPONENT").map((h) => h.snapshotAmount)).toEqual([0, 0]);
    expect(r.dueHeads.some((h) => h.key === "EXTRA:t")).toBe(false);
    expect(r.totalAmount).toBe(500);
  });

  it("reports previous-year dues separately from the current-year totals", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", null, 300, { extraFeeId: "p1" })] });
    mockLoadScope.mockResolvedValue([
      extraRow({ id: "p1", name: "Last Year Fee Due", amount: 800, targetType: "STUDENT", targetStudentId: sid }),
    ]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(r).toMatchObject({
      totalAmount: 12000,
      remainingFee: 12000,
      previousYearTotalAmount: 800,
      previousYearAmountPaid: 300,
      previousYearRemainingFee: 500,
    });
  });

  it("falls back to a legacy query when the database lacks the split column", async () => {
    const { sid } = setup();
    mockLoadScope
      .mockRejectedValueOnce(new Error("Unknown field `splitIntoTwoInstallments` for select statement"))
      .mockResolvedValueOnce([{ ...extraRow({ id: "e1", name: "Bus", amount: 500 }), splitIntoTwoInstallments: undefined }]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockLoadScope).toHaveBeenCalledTimes(2);
    expect(r.dueHeads.some((h) => h.key === "EXTRA:e1")).toBe(true);
  });

  it("rethrows other extra-fee loading errors", async () => {
    const { sid } = setup();
    mockLoadScope.mockRejectedValue(new Error("connection lost"));
    await expect(computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE)).rejects.toThrow("connection lost");
  });

  it("looks up names for payments made against extras no longer in scope", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", null, 200, { extraFeeId: "gone" })] });
    mockExtraFeeFindMany.mockResolvedValue([]);
    mockAllocFindMany.mockResolvedValue([{ extraFeeId: "gone", componentName: "Old Bus" }]);
    await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockExtraFeeFindMany).toHaveBeenCalledWith({ where: { id: { in: ["gone"] } }, select: { id: true, name: true } });
    expect(mockAllocFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studentId: sid, extraFeeId: { in: ["gone"] } }) })
    );
  });

  it("does not look up orphan names when every paid extra is in scope", async () => {
    const { sid } = setup({ allocations: [alloc("PAYMENT", null, 200, { extraFeeId: "e1" })] });
    mockLoadScope.mockResolvedValue([extraRow({ id: "e1", name: "Bus", amount: 500 })]);
    await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockExtraFeeFindMany).not.toHaveBeenCalled();
  });
});

describe("computeAdminStudentFeeBreakdown lump migration", () => {
  it("splits unsplit lump extras into installment rows and reloads them", async () => {
    const { sid } = setup();
    const lump = extraRow({ id: "m", name: "Mess Fee", amount: 3000 });
    mockLoadScope.mockResolvedValueOnce([lump]).mockResolvedValueOnce([
      extraRow({ id: "m1", name: "Mess Fee (1st Installment)", amount: 1500 }),
      extraRow({ id: "m2", name: "Mess Fee (2nd Installment)", amount: 1500 }),
    ]);
    const r = await computeAdminStudentFeeBreakdown("sch1", sid, { migrateLumps: true, reconcileTotals: false });
    expect(mockMigrate).toHaveBeenCalledTimes(1);
    expect(mockMigrate.mock.calls[0][1]).toEqual([expect.objectContaining({ id: "m", schoolId: "sch1" })]);
    expect(r.dueHeads.filter((h) => h.headType === "EXTRA_FEE").map((h) => h.key)).toEqual(["EXTRA:m1", "EXTRA:m2"]);
  });

  it("does not migrate when disabled", async () => {
    const { sid } = setup();
    mockLoadScope.mockResolvedValue([extraRow({ id: "m", name: "Mess Fee", amount: 3000 })]);
    await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockMigrate).not.toHaveBeenCalled();
  });
});

describe("computeAdminStudentFeeBreakdown reconciling stored totals", () => {
  const opts = { migrateLumps: false } as const;

  it("makes no writes when stored numbers already match", async () => {
    const { sid } = setup();
    mockSumPayments.mockResolvedValue(0);
    await computeAdminStudentFeeBreakdown("sch1", sid, opts);
    expect(mockStudentFeeUpdate).not.toHaveBeenCalled();
  });

  it("realigns amountPaid to the sum of successful payments when they disagree", async () => {
    const { sid } = setup({ fee: record({ amountPaid: 0 }) });
    mockSumPayments.mockResolvedValue(5000);
    await computeAdminStudentFeeBreakdown("sch1", sid, opts);
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: sid }, data: { amountPaid: 5000, remainingFee: 7000 } })
    );
  });

  it("never stores a negative remaining fee when payments exceed the final fee", async () => {
    const { sid } = setup({ fee: record({ amountPaid: 0 }) });
    mockSumPayments.mockResolvedValue(99999);
    await computeAdminStudentFeeBreakdown("sch1", sid, opts);
    expect(mockStudentFeeUpdate.mock.calls[0][0].data.remainingFee).toBe(0);
  });

  it("rewrites totalFee, finalFee and remainingFee from the fee heads when they drift", async () => {
    const { sid } = setup({ fee: record({ totalFee: 999, finalFee: 999, remainingFee: 999 }) });
    await computeAdminStudentFeeBreakdown("sch1", sid, opts);
    expect(mockStudentFeeUpdate).toHaveBeenCalledWith({
      where: { studentId: sid },
      data: { totalFee: 12000, finalFee: 12000, remainingFee: 12000 },
    });
  });

  it("tolerates sub-2-paisa differences without writing", async () => {
    const { sid } = setup({ fee: record({ totalFee: 12000.01, finalFee: 12000.01, remainingFee: 12000.01 }) });
    await computeAdminStudentFeeBreakdown("sch1", sid, opts);
    expect(mockStudentFeeUpdate).not.toHaveBeenCalled();
  });

  it("skips all reconciliation writes when reconcileTotals is false", async () => {
    const { sid } = setup({ fee: record({ totalFee: 1, finalFee: 1, remainingFee: 1, amountPaid: 50 }) });
    mockSumPayments.mockResolvedValue(9999);
    await computeAdminStudentFeeBreakdown("sch1", sid, NO_RECONCILE);
    expect(mockSumPayments).not.toHaveBeenCalled();
    expect(mockStudentFeeUpdate).not.toHaveBeenCalled();
  });
});
