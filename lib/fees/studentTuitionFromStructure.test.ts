jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import {
  buildStudentFeeRecalcPayload,
  computeStudentTuitionPartsSync,
  finalFeeFromStructureAndExtras,
  finalFeeFromTotalAndDiscount,
  shouldOmitLegacySplitHostelMessExtraForBreakdown,
  structureMultiplierAfterDiscount,
  sumExtraFeesForStudent,
  type ExtraFeeRow,
  type TuitionBulkCache,
} from "./studentTuitionFromStructure";

const extra = (over: Partial<ExtraFeeRow> & { amount: number }): ExtraFeeRow => ({
  name: "Extra",
  targetType: "SCHOOL",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  ...over,
});

const student = {
  classId: "c1",
  section: "A",
  studentId: "st1",
  residencyType: "Day Scholar",
};

describe("structureMultiplierAfterDiscount", () => {
  it.each([
    [0, 1],
    [10, 0.9],
    [100, 0],
    [150, 0],
    [-20, 1],
    [Number.NaN, 1],
  ])("%p percent gives multiplier %p", (pct, expected) => {
    expect(structureMultiplierAfterDiscount(pct)).toBeCloseTo(expected);
  });
});

describe("finalFeeFromStructureAndExtras", () => {
  it("discounts the structure but never the extras", () => {
    expect(finalFeeFromStructureAndExtras(10000, 2000, 10)).toBeCloseTo(11000);
  });

  it("returns the full amount with no discount", () => {
    expect(finalFeeFromStructureAndExtras(10000, 2000, 0)).toBe(12000);
  });

  it("leaves only the extras at a 100% discount", () => {
    expect(finalFeeFromStructureAndExtras(10000, 2000, 100)).toBe(2000);
  });

  it("the deprecated helper discounts the whole total", () => {
    expect(finalFeeFromTotalAndDiscount(5000, 20)).toBeCloseTo(4000);
  });
});

describe("sumExtraFeesForStudent targeting", () => {
  it("includes school-wide fees for everyone", () => {
    expect(sumExtraFeesForStudent([extra({ amount: 500 })], student)).toBe(500);
  });

  it("includes CLASS fees only for that class", () => {
    const fees = [extra({ amount: 300, targetType: "CLASS", targetClassId: "c1" }), extra({ amount: 700, targetType: "CLASS", targetClassId: "c2" })];
    expect(sumExtraFeesForStudent(fees, student)).toBe(300);
  });

  it("includes SECTION fees only for the matching class and section", () => {
    const fees = [
      extra({ amount: 100, targetType: "SECTION", targetClassId: "c1", targetSection: "A" }),
      extra({ amount: 200, targetType: "SECTION", targetClassId: "c1", targetSection: "B" }),
      extra({ amount: 400, targetType: "SECTION", targetClassId: "c2", targetSection: "A" }),
    ];
    expect(sumExtraFeesForStudent(fees, student)).toBe(100);
  });

  it("includes STUDENT fees only for that student and never when there is no student id", () => {
    const fees = [extra({ amount: 50, targetType: "STUDENT", targetStudentId: "st1" }), extra({ amount: 60, targetType: "STUDENT", targetStudentId: "st2" })];
    expect(sumExtraFeesForStudent(fees, student)).toBe(50);
    expect(sumExtraFeesForStudent(fees, { ...student, studentId: null })).toBe(0);
  });

  it("ignores unknown target types", () => {
    expect(sumExtraFeesForStudent([extra({ amount: 999, targetType: "GALAXY" })], student)).toBe(0);
  });

  it("is zero for no fees", () => {
    expect(sumExtraFeesForStudent([], student)).toBe(0);
  });
});

describe("sumExtraFeesForStudent residency rules", () => {
  it("applies DAY_SCHOLAR- and HOSTELLER-scoped fees to the right students", () => {
    const fees = [extra({ amount: 100, residencyScope: "DAY_SCHOLAR" }), extra({ amount: 200, residencyScope: "HOSTELLER" })];
    expect(sumExtraFeesForStudent(fees, { ...student, residencyType: "Day Scholar" })).toBe(100);
    expect(sumExtraFeesForStudent(fees, { ...student, residencyType: "Hosteller" })).toBe(200);
  });

  it("does not charge mess to hostellers, or hostel to day scholars", () => {
    const fees = [extra({ name: "Mess Fee", amount: 100 }), extra({ name: "Hostel Fee", amount: 200 })];
    expect(sumExtraFeesForStudent(fees, { ...student, residencyType: "Hosteller" })).toBe(200);
    expect(sumExtraFeesForStudent(fees, { ...student, residencyType: "Day Scholar" })).toBe(100);
  });

  it("skips tuition-named extras for RTE students but keeps others", () => {
    const fees = [extra({ name: "Tuition Fee (1st Installment)", amount: 1000 }), extra({ name: "Transport", amount: 300 })];
    expect(sumExtraFeesForStudent(fees, { ...student, residencyType: "RTE" })).toBe(300);
    expect(sumExtraFeesForStudent(fees, student)).toBe(1300);
  });
});

describe("sumExtraFeesForStudent legacy duplicate handling", () => {
  it("drops installment rows when a lump row of the same fee and scope exists", () => {
    const fees = [
      extra({ name: "Library", amount: 1000 }),
      extra({ name: "Library (1st Installment)", amount: 500 }),
    ];
    expect(sumExtraFeesForStudent(fees, student)).toBe(1000);
  });

  it("charges the installment pair, not the lump, when a lump and both installments coexist", () => {
    const fees = [
      extra({ name: "Library", amount: 1000 }),
      extra({ name: "Library (1st Installment)", amount: 500 }),
      extra({ name: "Library (2nd Installment)", amount: 500 }),
    ];
    expect(sumExtraFeesForStudent(fees, student)).toBe(1000);
  });

  it("still lets a lump win over a single installment", () => {
    const fees = [
      extra({ name: "Library", amount: 1000 }),
      extra({ name: "Library (1st Installment)", amount: 500 }),
    ];
    expect(sumExtraFeesForStudent(fees, student)).toBe(1000);
  });

  it("keeps both installments when there is no lump", () => {
    const fees = [
      extra({ name: "Library (1st Installment)", amount: 500 }),
      extra({ name: "Library (2nd Installment)", amount: 500 }),
    ];
    expect(sumExtraFeesForStudent(fees, student)).toBe(1000);
  });

  it("does not treat a lump in a different scope as a duplicate", () => {
    const fees = [
      extra({ name: "Library", amount: 1000, targetType: "CLASS", targetClassId: "c2" }),
      extra({ name: "Library (1st Installment)", amount: 500 }),
    ];
    expect(sumExtraFeesForStudent(fees, student)).toBe(500);
  });

  it("exposes the same rule for the breakdown view", () => {
    const lump = extra({ name: "Library", amount: 1000 }) as ExtraFeeRow & { name: string };
    const inst = extra({ name: "Library (1st Installment)", amount: 500 }) as ExtraFeeRow & { name: string };
    const opts = { classId: "c1", residencyType: "Day Scholar" };
    expect(shouldOmitLegacySplitHostelMessExtraForBreakdown(inst, [lump, inst], opts)).toBe(true);
    expect(shouldOmitLegacySplitHostelMessExtraForBreakdown(lump, [lump, inst], opts)).toBe(false);
  });
});

describe("computeStudentTuitionPartsSync", () => {
  const cache: TuitionBulkCache = {
    baseByClassId: new Map([["c1", 10000]]),
    extraFees: [extra({ amount: 1500 })],
  };

  it("adds the class base and applicable extras", () => {
    expect(computeStudentTuitionPartsSync(student, cache)).toEqual({ base: 10000, extrasTotal: 1500, totalFee: 11500 });
  });

  it("has no base for RTE students", () => {
    expect(computeStudentTuitionPartsSync({ ...student, residencyType: "RTE" }, cache)).toEqual({
      base: 0,
      extrasTotal: 1500,
      totalFee: 1500,
    });
  });

  it("has no base for a student without a class or with an unknown class", () => {
    expect(computeStudentTuitionPartsSync({ ...student, classId: null }, cache).base).toBe(0);
    expect(computeStudentTuitionPartsSync({ ...student, classId: "nope" }, cache).base).toBe(0);
  });
});

describe("buildStudentFeeRecalcPayload", () => {
  const cache: TuitionBulkCache = {
    baseByClassId: new Map([["c1", 10000]]),
    extraFees: [extra({ amount: 2000 })],
  };
  const base = { id: "st1", classId: "c1", section: "A", residencyType: "Day Scholar", discountPercent: 10, amountPaid: 3000 };

  it("computes total, discounted final and remaining fee", () => {
    const p = buildStudentFeeRecalcPayload(base, cache);
    expect(p.totalFee).toBe(12000);
    expect(p.finalFee).toBeCloseTo(11000);
    expect(p.remainingFee).toBeCloseTo(8000);
    expect(p).toMatchObject({ studentId: "st1", discountPercent: 10, amountPaid: 3000 });
  });

  it("never reports a negative remaining fee when overpaid", () => {
    expect(buildStudentFeeRecalcPayload({ ...base, amountPaid: 50000 }, cache).remainingFee).toBe(0);
  });

  it("rounds remaining fee to paise", () => {
    const p = buildStudentFeeRecalcPayload({ ...base, discountPercent: 33.333, amountPaid: 0 }, cache);
    expect(p.remainingFee).toBe(Math.round(p.finalFee * 100) / 100);
    expect(p.remainingFee).toBeCloseTo(2000 + 10000 * (1 - 0.33333), 5);
  });
});
