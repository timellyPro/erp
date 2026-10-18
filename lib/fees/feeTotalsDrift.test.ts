/**
 * @jest-environment node
 */
import { detectFeeTotalsDrift } from "@/lib/fees/feeTotalsDrift";

const mockFeeFindMany = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockStructureFindMany = jest.fn();
const mockClassFindMany = jest.fn();
const mockPaymentGroupBy = jest.fn();

jest.mock("@/lib/db/tenantContext", () => ({
  tenantDb: {
    studentFee: { findMany: (...a: unknown[]) => mockFeeFindMany(...a) },
    extraFee: { findMany: (...a: unknown[]) => mockExtraFeeFindMany(...a) },
    classFeeStructure: { findMany: (...a: unknown[]) => mockStructureFindMany(...a) },
    class: { findMany: (...a: unknown[]) => mockClassFindMany(...a) },
    payment: { groupBy: (...a: unknown[]) => mockPaymentGroupBy(...a) },
  },
}));

const feeRow = (id: string, over: Record<string, unknown> = {}) => ({
  studentId: id,
  totalFee: 12000,
  finalFee: 12000,
  amountPaid: 0,
  remainingFee: 12000,
  discountPercent: 0,
  student: { classId: "c1", residencyType: "Day Scholar", class: { section: "A" } },
  ...over,
});

const schoolExtra = {
  name: "Uniform Kit",
  amount: 2000,
  targetType: "SCHOOL",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  residencyConversion: false,
};

describe("detectFeeTotalsDrift", () => {
  beforeEach(() => {
    // class fee 10,000 + a school-wide 2,000 extra = 12,000 expected for everyone
    mockStructureFindMany.mockReset().mockResolvedValue([{ classId: "c1", components: [{ name: "Tuition", amount: 10000 }] }]);
    mockExtraFeeFindMany.mockReset().mockResolvedValue([schoolExtra]);
    mockClassFindMany.mockReset().mockResolvedValue([{ id: "c1", name: "CLASS 1", section: "A" }]);
    mockPaymentGroupBy.mockReset().mockResolvedValue([]);
    mockFeeFindMany.mockReset().mockResolvedValue([]);
  });

  it("reports no drift when every stored fee matches", async () => {
    mockFeeFindMany.mockResolvedValue([
      feeRow("s1"),
      feeRow("s2", { amountPaid: 3000, remainingFee: 9000 }),
    ]);
    mockPaymentGroupBy.mockResolvedValue([{ studentId: "s2", _sum: { amount: 3000 } }]);
    const r = await detectFeeTotalsDrift("sch1");
    expect(r).toMatchObject({ studentsChecked: 2, studentsDrifted: 0, byKind: { grossTotal: 0, amountPaid: 0, remaining: 0 } });
    expect(r.samples).toEqual([]);
  });

  it("flags a stored total that is missing a fee head (the Lotus transport case)", async () => {
    // the student has a 5,500 + 5,500 transport fee the stored total never picked up
    mockExtraFeeFindMany.mockResolvedValue([
      schoolExtra,
      { ...schoolExtra, name: "Transport fee 7-10 kms (1st Installment)", amount: 5500, targetType: "STUDENT", targetStudentId: "s1" },
      { ...schoolExtra, name: "Transport fee 7-10 kms (2nd Installment)", amount: 5500, targetType: "STUDENT", targetStudentId: "s1" },
    ]);
    mockFeeFindMany.mockResolvedValue([feeRow("s1"), feeRow("s2")]);
    const r = await detectFeeTotalsDrift("sch1");
    expect(r.studentsDrifted).toBe(1);
    expect(r.byKind.grossTotal).toBe(1);
    expect(r.samples).toEqual([{ studentId: "s1", kind: "grossTotal", stored: 12000, expected: 23000, difference: 11000 }]);
  });

  it("flags a stored paid amount that disagrees with the payments", async () => {
    mockFeeFindMany.mockResolvedValue([feeRow("s1", { amountPaid: 0, remainingFee: 12000 })]);
    mockPaymentGroupBy.mockResolvedValue([{ studentId: "s1", _sum: { amount: 1000 } }]);
    const r = await detectFeeTotalsDrift("sch1");
    expect(r.byKind.amountPaid).toBe(1);
    expect(r.samples[0]).toMatchObject({ kind: "amountPaid", stored: 0, expected: 1000 });
  });

  it("flags a remaining fee that is not final minus paid", async () => {
    mockFeeFindMany.mockResolvedValue([feeRow("s1", { amountPaid: 0, remainingFee: 9000 })]);
    const r = await detectFeeTotalsDrift("sch1");
    expect(r.byKind.remaining).toBe(1);
    expect(r.samples[0]).toMatchObject({ kind: "remaining", stored: 9000, expected: 12000 });
  });

  it("treats a sub-rupee difference as rounding, not drift", async () => {
    mockFeeFindMany.mockResolvedValue([feeRow("s1", { totalFee: 12000.4, finalFee: 12000.4, remainingFee: 12000.4 })]);
    const r = await detectFeeTotalsDrift("sch1");
    expect(r.studentsDrifted).toBe(0);
  });

  it("counts a student once even when several things drifted", async () => {
    mockFeeFindMany.mockResolvedValue([feeRow("s1", { totalFee: 5000, amountPaid: 0, remainingFee: 1 })]);
    mockPaymentGroupBy.mockResolvedValue([{ studentId: "s1", _sum: { amount: 700 } }]);
    const r = await detectFeeTotalsDrift("sch1");
    expect(r.studentsDrifted).toBe(1);
    expect(r.byKind).toEqual({ grossTotal: 1, amountPaid: 1, remaining: 1 });
  });

  it("is scoped to one school, only active students, and only successful FEES payments", async () => {
    await detectFeeTotalsDrift("sch1");
    expect(mockFeeFindMany.mock.calls[0][0].where).toEqual({ student: { schoolId: "sch1", status: "Active" } });
    expect(mockExtraFeeFindMany.mock.calls[0][0].where).toEqual({ schoolId: "sch1" });
    const where = mockPaymentGroupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({ student: { schoolId: "sch1" }, purpose: "FEES", eventRegistrationId: null });
    expect(where.status.in).toEqual(expect.arrayContaining(["SUCCESS", "COMPLETED"]));
  });

  it("keeps at most 50 samples but counts every drifted student", async () => {
    mockFeeFindMany.mockResolvedValue(Array.from({ length: 70 }, (_, i) => feeRow(`s${i}`, { totalFee: 1 })));
    const r = await detectFeeTotalsDrift("sch1");
    expect(r.studentsDrifted).toBe(70);
    expect(r.samples).toHaveLength(50);
  });
});
