/**
 * @jest-environment node
 */
import {
  perHeadDiscountRupee,
  storedFinalFee,
  upsertStudentFeeFromStructure,
} from "@/lib/fees/studentTuitionFromStructure";

jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

describe("perHeadDiscountRupee", () => {
  it("reads the rupee discount of a per-head discount from gross minus final", () => {
    expect(perHeadDiscountRupee({ totalFee: 92500, finalFee: 90500, discountFeeHeadKey: "BASE:0" })).toBe(2000);
  });
  it("is null for no discount, an overall discount or no stored row", () => {
    expect(perHeadDiscountRupee({ totalFee: 1000, finalFee: 1000, discountFeeHeadKey: "BASE:0" })).toBeNull();
    expect(perHeadDiscountRupee({ totalFee: 1000, finalFee: 900, discountFeeHeadKey: "__DISCOUNT_OVERALL__" })).toBeNull();
    expect(perHeadDiscountRupee({ totalFee: 1000, finalFee: 900, discountFeeHeadKey: null })).toBeNull();
    expect(perHeadDiscountRupee(null)).toBeNull();
  });
});

describe("storedFinalFee", () => {
  const parts = { base: 80000, extrasTotal: 12500 };
  it("applies the percent to the structure only when there is no per-head discount", () => {
    expect(storedFinalFee(parts, 10, null)).toBe(8000 * 9 + 12500); // 84,500
  });
  it("keeps a per-head rupee discount instead of turning it into percent-of-structure", () => {
    const existing = { totalFee: 92500, finalFee: 90500, discountFeeHeadKey: "BASE:0" };
    // percent says 10% (8,000 off); the per-head discount is 2,000 and stays 2,000
    expect(storedFinalFee(parts, 10, existing)).toBe(90500);
  });
  it("keeps the same rupee discount when the structure changes, and never goes below zero", () => {
    const existing = { totalFee: 92500, finalFee: 90500, discountFeeHeadKey: "BASE:0" };
    expect(storedFinalFee({ base: 90000, extrasTotal: 12500 }, 10, existing)).toBe(100500);
    expect(storedFinalFee({ base: 500, extrasTotal: 0 }, 10, existing)).toBe(0);
  });
});

describe("upsertStudentFeeFromStructure", () => {
  it("does not reset a per-head discount when the stored fee is recalculated", async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const db = {
      student: { findUnique: jest.fn().mockResolvedValue({ residencyType: "Day Scholar" }) },
      classFeeStructure: { findUnique: jest.fn().mockResolvedValue({ components: [{ name: "Tuition", amount: 80000 }] }) },
      extraFee: { findMany: jest.fn().mockResolvedValue([]) },
      studentFee: {
        findUnique: jest.fn().mockResolvedValue({ totalFee: 80000, finalFee: 78000, discountFeeHeadKey: "BASE:0" }),
        upsert,
      },
    };
    await upsertStudentFeeFromStructure(db as never, {
      schoolId: "s1",
      studentId: "st1",
      classId: "c1",
      section: "A",
      discountPercent: 10,
      amountPaid: 0,
    });
    const arg = upsert.mock.calls[0]![0] as { update: { finalFee: number } };
    expect(arg.update.finalFee).toBe(78000); // not 72,000
  });
});
