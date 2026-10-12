jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import {
  DISCOUNT_HEAD_OVERALL_KEY,
  discountedSnapshotDueForHead,
  finalFeeFromDiscountedHeads,
  isOverallDiscountKey,
  resolveDiscountFeeHeadKey,
  storedDiscountRupeeAmount,
  studentFeeDiscountFromRecord,
} from "./studentFeeHeadDiscount";

describe("isOverallDiscountKey", () => {
  it("is true for empty, whitespace, nullish and the overall sentinel", () => {
    for (const k of [undefined, null, "", "   ", DISCOUNT_HEAD_OVERALL_KEY]) {
      expect(isOverallDiscountKey(k)).toBe(true);
    }
  });

  it("is false for a real head key", () => {
    expect(isOverallDiscountKey("BASE:0")).toBe(false);
  });
});

describe("resolveDiscountFeeHeadKey", () => {
  const components = [{ name: "Tuition Fee" }, { name: "Lab Fee" }];

  it("returns a stored real key untouched", () => {
    expect(resolveDiscountFeeHeadKey("BASE:1", "Whatever", components)).toBe("BASE:1");
  });

  it("recovers BASE:n from the label (case and space insensitive) when the key is missing", () => {
    expect(resolveDiscountFeeHeadKey(null, "  lab fee ", components)).toBe("BASE:1");
    expect(resolveDiscountFeeHeadKey(DISCOUNT_HEAD_OVERALL_KEY, "Tuition Fee", components)).toBe("BASE:0");
  });

  it("keeps the overall key when the label matches nothing", () => {
    expect(resolveDiscountFeeHeadKey(DISCOUNT_HEAD_OVERALL_KEY, "Unknown", components)).toBe(DISCOUNT_HEAD_OVERALL_KEY);
  });

  it("returns null when there is neither key nor label", () => {
    expect(resolveDiscountFeeHeadKey(null, "", components)).toBeNull();
    expect(resolveDiscountFeeHeadKey(undefined, undefined, components)).toBeNull();
  });
});

describe("studentFeeDiscountFromRecord", () => {
  it("treats a percent-only discount as overall with no fixed amount", () => {
    const d = studentFeeDiscountFromRecord({ discountPercent: 10, totalFee: 1000, finalFee: 900 });
    expect(d).toEqual({ discountPercent: 10, discountFeeHeadKey: null, discountFixedAmount: null });
  });

  it("derives a fixed rupee amount for a per-head discount", () => {
    const d = studentFeeDiscountFromRecord(
      { discountPercent: 0, totalFee: 1000, finalFee: 850.5, discountFeeHeadKey: "BASE:1" },
      [{ name: "A" }, { name: "B" }]
    );
    expect(d).toEqual({ discountPercent: 0, discountFeeHeadKey: "BASE:1", discountFixedAmount: 149.5 });
  });

  it("does not report a fixed amount when nothing was actually discounted", () => {
    const d = studentFeeDiscountFromRecord({ discountPercent: 0, totalFee: 1000, finalFee: 1000, discountFeeHeadKey: "BASE:0" });
    expect(d.discountFixedAmount).toBeNull();
  });

  it("never yields a negative discount when finalFee exceeds totalFee", () => {
    const d = studentFeeDiscountFromRecord({ discountPercent: 0, totalFee: 1000, finalFee: 1200, discountFeeHeadKey: "BASE:0" });
    expect(d.discountFixedAmount).toBeNull();
  });
});

describe("storedDiscountRupeeAmount", () => {
  it("prefers a positive fixed amount, rounded to paise", () => {
    expect(storedDiscountRupeeAmount(1000, 900, 123.456)).toBe(123.46);
  });

  it("falls back to total minus final", () => {
    expect(storedDiscountRupeeAmount(1000, 900, null)).toBe(100);
    expect(storedDiscountRupeeAmount(1000, 900, 0)).toBe(100);
  });

  it("clamps at zero", () => {
    expect(storedDiscountRupeeAmount(1000, 1100)).toBe(0);
  });
});

describe("discountedSnapshotDueForHead", () => {
  it("returns pre-discount due when there is no discount", () => {
    expect(discountedSnapshotDueForHead("BASE:0", 1000, { discountPercent: 0 })).toBe(1000);
  });

  it("returns 0 for non-positive or invalid dues", () => {
    expect(discountedSnapshotDueForHead("BASE:0", 0, { discountPercent: 10 })).toBe(0);
    expect(discountedSnapshotDueForHead("BASE:0", -50, { discountPercent: 10 })).toBe(0);
    expect(discountedSnapshotDueForHead("BASE:0", Number.NaN, { discountPercent: 10 })).toBe(0);
  });

  it("applies an overall percent to every head", () => {
    const d = { discountPercent: 10, discountFeeHeadKey: null };
    expect(discountedSnapshotDueForHead("BASE:0", 1000, d)).toBeCloseTo(900);
    expect(discountedSnapshotDueForHead("EXTRA:x", 500, d)).toBeCloseTo(450);
  });

  it("clamps the percent to 0-100", () => {
    expect(discountedSnapshotDueForHead("BASE:0", 1000, { discountPercent: 150 })).toBeCloseTo(0);
    expect(discountedSnapshotDueForHead("BASE:0", 1000, { discountPercent: -20 })).toBe(1000);
  });

  it("applies a per-head percent only to the targeted head", () => {
    const d = { discountPercent: 20, discountFeeHeadKey: "BASE:1" };
    expect(discountedSnapshotDueForHead("BASE:1", 1000, d)).toBe(800);
    expect(discountedSnapshotDueForHead("BASE:0", 1000, d)).toBe(1000);
  });

  it("uses the fixed amount over the percent for the targeted head and never goes below zero", () => {
    const d = { discountPercent: 50, discountFeeHeadKey: "BASE:1", discountFixedAmount: 300 };
    expect(discountedSnapshotDueForHead("BASE:1", 1000, d)).toBe(700);
    expect(discountedSnapshotDueForHead("BASE:1", 200, d)).toBe(0);
  });

  it("applies a fixed-only discount even when percent is 0", () => {
    const d = { discountPercent: 0, discountFeeHeadKey: "BASE:1", discountFixedAmount: 250 };
    expect(discountedSnapshotDueForHead("BASE:1", 1000, d)).toBe(750);
  });

  describe("virtual installment targets", () => {
    it("leaves the first installment at half the lump", () => {
      const d = { discountPercent: 10, discountFeeHeadKey: "BASE:0::INST1" };
      expect(discountedSnapshotDueForHead("BASE:0", 1000, d)).toBe(500);
    });

    it("discounts only the second half", () => {
      const d = { discountPercent: 10, discountFeeHeadKey: "BASE:0::INST2" };
      expect(discountedSnapshotDueForHead("BASE:0", 1000, d)).toBe(450);
    });

    it("uses a fixed amount on the second half when given", () => {
      const d = { discountPercent: 0, discountFeeHeadKey: "BASE:0::INST2", discountFixedAmount: 100 };
      expect(discountedSnapshotDueForHead("BASE:0", 1000, d)).toBe(400);
    });

    it("does not touch other heads", () => {
      const d = { discountPercent: 10, discountFeeHeadKey: "BASE:0::INST2" };
      expect(discountedSnapshotDueForHead("BASE:1", 1000, d)).toBe(1000);
    });

    it("keeps paise correct when the lump is odd", () => {
      const d = { discountPercent: 0, discountFeeHeadKey: "BASE:0::INST2", discountFixedAmount: 0.01 };
      const first = discountedSnapshotDueForHead("BASE:0", 1001, { ...d, discountFeeHeadKey: "BASE:0::INST1" });
      const second = discountedSnapshotDueForHead("BASE:0", 1001, d);
      expect(first).toBe(500.5);
      expect(second).toBe(500.49);
    });
  });
});

describe("finalFeeFromDiscountedHeads", () => {
  const heads = [
    { key: "BASE:0", preDiscountDue: 1000 },
    { key: "BASE:1", preDiscountDue: 2000 },
    { key: "EXTRA:x", preDiscountDue: 500 },
  ];

  it("sums to the undiscounted total with no discount", () => {
    expect(finalFeeFromDiscountedHeads(heads, { discountPercent: 0 })).toBe(3500);
  });

  it("applies an overall percent to all heads", () => {
    expect(finalFeeFromDiscountedHeads(heads, { discountPercent: 10 })).toBeCloseTo(3150);
  });

  it("applies a per-head discount to one head only", () => {
    const d = { discountPercent: 0, discountFeeHeadKey: "BASE:1", discountFixedAmount: 500 };
    expect(finalFeeFromDiscountedHeads(heads, d)).toBe(3000);
  });

  it("is 0 for no heads", () => {
    expect(finalFeeFromDiscountedHeads([], { discountPercent: 10 })).toBe(0);
  });
});
