/**
 * @jest-environment node
 */
import { recalculateStoredFees, type RecalcDb } from "@/lib/fees/recalculateStoredFee";

const mockInvalidate = jest.fn();
jest.mock("@/lib/fees/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: (...a: unknown[]) => mockInvalidate(...a),
}));
jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

const feeRow = (id: string, over: Record<string, unknown> = {}) => ({
  studentId: id,
  totalFee: 48400,
  finalFee: 48400,
  amountPaid: 10000,
  remainingFee: 38400,
  discountPercent: 0,
  discountFeeHeadKey: null,
  discountRemarks: null,
  student: { classId: "c1", residencyType: "Day Scholar", class: { section: "A" } },
  ...over,
});

const extra = (over: Record<string, unknown> = {}) => ({
  name: "Mess Fee (1st Installment)",
  amount: 48400,
  targetType: "SCHOOL",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  residencyConversion: false,
  ...over,
});

function makeDb(rows: unknown[], extras: unknown[] = [extra()]) {
  const update = jest.fn(async (_a: unknown) => ({}));
  const findMany = jest.fn(async (_a: unknown) => rows);
  const db = {
    studentFee: { findMany, update },
    extraFee: { findMany: jest.fn(async () => extras) },
    // class fee 39,600 + the 48,400 school-wide extra above = 88,000
    classFeeStructure: { findMany: jest.fn(async () => [{ classId: "c1", components: [{ name: "Tuition", amount: 39600 }] }]) },
    class: { findMany: jest.fn(async () => [{ id: "c1", name: "CLASS 6", section: "A" }]) },
  };
  return { db: db as unknown as RecalcDb, update, findMany };
}

const base = { schoolId: "sch1", studentIds: ["s1"], apply: false };

describe("recalculateStoredFees", () => {
  beforeEach(() => mockInvalidate.mockReset());

  it("repairs the Lotus pattern: tuition missing from the stored total (dry run first)", async () => {
    const { db, update } = makeDb([feeRow("s1")]);
    const [plan] = await recalculateStoredFees(db, base);
    expect(plan).toMatchObject({ studentId: "s1", found: true, changed: true });
    expect(plan.before).toEqual({ totalFee: 48400, finalFee: 48400, amountPaid: 10000, remainingFee: 38400 });
    expect(plan.after).toEqual({ totalFee: 88000, finalFee: 88000, amountPaid: 10000, remainingFee: 78000 });
    expect(update).not.toHaveBeenCalled();
  });

  it("writes only total, final and remaining on apply, never the paid amount, and clears caches", async () => {
    const { db, update } = makeDb([feeRow("s1")]);
    await recalculateStoredFees(db, { ...base, apply: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { studentId: "s1" },
      data: { totalFee: 88000, finalFee: 88000, remainingFee: 78000 },
    });
    expect(JSON.stringify((update.mock.calls[0]![0] as { data: unknown }).data)).not.toContain("amountPaid");
    expect(mockInvalidate).toHaveBeenCalledWith({ studentId: "s1", schoolId: "sch1" });
  });

  it("leaves a student that is already correct alone", async () => {
    const { db, update } = makeDb([feeRow("s1", { totalFee: 88000, finalFee: 88000, remainingFee: 78000 })]);
    const [plan] = await recalculateStoredFees(db, { ...base, apply: true });
    expect(plan.changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("handles the opposite drift: a stored total that is too high", async () => {
    const { db } = makeDb([feeRow("s1", { totalFee: 105050, finalFee: 105050, remainingFee: 95050 })]);
    const [plan] = await recalculateStoredFees(db, base);
    expect(plan.after).toMatchObject({ totalFee: 88000, finalFee: 88000, remainingFee: 78000 });
  });

  it("blocks a student with a discount unless a person allows it", async () => {
    const rows = [feeRow("s1", { discountPercent: 5 })];
    const { db, update } = makeDb(rows);
    const [blocked] = await recalculateStoredFees(db, { ...base, apply: true });
    expect(blocked.blockedReason).toMatch(/discount/i);
    expect(update).not.toHaveBeenCalled();

    const [allowed] = await recalculateStoredFees(db, { ...base, apply: true, allowDiscount: true });
    expect(allowed.blockedReason).toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("also blocks a discount recorded only as a discount head or remarks", async () => {
    const { db } = makeDb([
      feeRow("s1", { discountFeeHeadKey: "BASE:0" }),
      feeRow("s2", { discountRemarks: "approved by chairman" }),
    ]);
    const plans = await recalculateStoredFees(db, { ...base, studentIds: ["s1", "s2"] });
    expect(plans.every((p) => Boolean(p.blockedReason))).toBe(true);
  });

  it("reports a student with no fee record in this school without failing the others", async () => {
    const { db } = makeDb([feeRow("s1")]);
    const plans = await recalculateStoredFees(db, { ...base, studentIds: ["s1", "ghost"] });
    expect(plans.map((p) => [p.studentId, p.found])).toEqual([["s1", true], ["ghost", false]]);
    expect(plans[1].blockedReason).toMatch(/No fee record/);
  });

  it("scopes the lookup to the school and the requested ids, and de-duplicates ids", async () => {
    const { db, findMany } = makeDb([feeRow("s1")]);
    await recalculateStoredFees(db, { ...base, studentIds: ["s1", " s1 ", ""] });
    expect((findMany.mock.calls[0]![0] as { where: unknown }).where).toEqual({
      studentId: { in: ["s1"] },
      student: { schoolId: "sch1" },
    });
  });

  it("requires at least one student id", async () => {
    const { db } = makeDb([]);
    await expect(recalculateStoredFees(db, { ...base, studentIds: [" "] })).rejects.toThrow(/at least one/);
  });
});

describe("recalculateStoredFees with a confirmed concession", () => {
  it("uses the rupee amount, not the stale percent", async () => {
    const db = makeDbForConcessionTest();
    const [plan] = await recalculateStoredFees(db as never, { schoolId: "s1", studentIds: ["st1"], apply: false, concessionRupee: 10000 });
    expect(plan.blockedReason).toBeUndefined();
    expect(plan.after).toMatchObject({ totalFee: 88000, finalFee: 78000, amountPaid: 44000, remainingFee: 34000 });
  });

  it("refuses more than one student with a concession", async () => {
    const db = makeDbForConcessionTest();
    await expect(
      recalculateStoredFees(db as never, { schoolId: "s1", studentIds: ["a", "b"], apply: false, concessionRupee: 1 })
    ).rejects.toThrow(/one student/);
  });
});

function makeDbForConcessionTest() {
  return {
    studentFee: {
      findMany: jest.fn().mockResolvedValue([
        {
          studentId: "st1", totalFee: 48400, finalFee: 48400, amountPaid: 44000, remainingFee: 4400,
          discountPercent: 11.3636, discountFeeHeadKey: "BASE:1", discountRemarks: "CHAIRMAN",
          student: { classId: "c1", residencyType: "Day Scholar", class: { section: "B" } },
        },
      ]),
      update: jest.fn(),
    },
    extraFee: { findMany: jest.fn().mockResolvedValue([{ name: "Mess", amount: 48400, targetType: "STUDENT", targetStudentId: "st1", targetClassId: null, targetSection: null, residencyScope: null, residencyConversion: false }]) },
    classFeeStructure: { findMany: jest.fn().mockResolvedValue([{ classId: "c1", components: [{ amount: 39600 }] }]) },
    class: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe("recalculateStoredFees recording the concession", () => {
  it("writes the head, percent and note along with the amounts when asked", async () => {
    const db = makeDbForConcessionTest();
    await recalculateStoredFees(db as never, {
      schoolId: "s1", studentIds: ["st1"], apply: true, concessionRupee: 10000,
      concessionRecord: { headKey: "BASE:1", headLabel: "Tuition Fee 2nd Installment", remarks: "confirmed" },
    });
    const data = db.studentFee.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ totalFee: 88000, finalFee: 78000, discountFeeHeadKey: "BASE:1", discountFeeHeadLabel: "Tuition Fee 2nd Installment", discountRemarks: "confirmed" });
    expect(data.discountPercent).toBeCloseTo((10000 / 88000) * 100);
  });

  it("refuses a concession record without a concession amount", async () => {
    const db = makeDbForConcessionTest();
    await expect(
      recalculateStoredFees(db as never, { schoolId: "s1", studentIds: ["st1"], apply: false, concessionRecord: { headKey: "k", headLabel: "l", remarks: "r" } })
    ).rejects.toThrow(/concessionRupee/);
  });
});
