import { allocationKeyFromRecord, planSameRefPayment, type ExistingPaymentAllocation } from "./offlinePaymentSameRef";

const base = (index: number, amount: number): ExistingPaymentAllocation => ({
  headType: "BASE_COMPONENT",
  componentIndex: index,
  extraFeeId: null,
  allocatedAmount: amount,
});
const extra = (id: string, amount: number): ExistingPaymentAllocation => ({
  headType: "EXTRA_FEE",
  componentIndex: null,
  extraFeeId: id,
  allocatedAmount: amount,
});

describe("allocationKeyFromRecord", () => {
  it("builds BASE and EXTRA keys", () => {
    expect(allocationKeyFromRecord(base(2, 10))).toBe("BASE:2");
    expect(allocationKeyFromRecord(extra("abc", 10))).toBe("EXTRA:abc");
  });

  it("supports component index 0", () => {
    expect(allocationKeyFromRecord(base(0, 10))).toBe("BASE:0");
  });

  it("returns null for rows without the identifying field", () => {
    expect(
      allocationKeyFromRecord({ headType: "EXTRA_FEE", componentIndex: null, extraFeeId: null, allocatedAmount: 1 })
    ).toBeNull();
    expect(
      allocationKeyFromRecord({ headType: "BASE_COMPONENT", componentIndex: null, extraFeeId: null, allocatedAmount: 1 })
    ).toBeNull();
    expect(
      allocationKeyFromRecord({ headType: "OTHER", componentIndex: 1, extraFeeId: "x", allocatedAmount: 1 })
    ).toBeNull();
  });
});

describe("planSameRefPayment", () => {
  it("treats an identical request as a duplicate", () => {
    const plan = planSameRefPayment(
      [base(0, 1000), extra("e1", 500)],
      [
        { key: "BASE:0", amount: 1000 },
        { key: "EXTRA:e1", amount: 500 },
      ]
    );
    expect(plan).toEqual({ kind: "duplicate" });
  });

  it("appends only the new head", () => {
    const plan = planSameRefPayment(
      [base(0, 1000)],
      [
        { key: "BASE:0", amount: 1000 },
        { key: "EXTRA:e1", amount: 250 },
      ]
    );
    expect(plan).toEqual({ kind: "append", appendTotal: 250, deltas: [{ key: "EXTRA:e1", amount: 250 }] });
  });

  it("appends only the extra amount on an existing head", () => {
    const plan = planSameRefPayment([base(0, 1000)], [{ key: "BASE:0", amount: 1600 }]);
    expect(plan).toEqual({ kind: "append", appendTotal: 600, deltas: [{ key: "BASE:0", amount: 600 }] });
  });

  it("is a duplicate when the requested amount is lower than what is already recorded", () => {
    expect(planSameRefPayment([base(0, 1000)], [{ key: "BASE:0", amount: 400 }])).toEqual({ kind: "duplicate" });
  });

  it("sums multiple existing rows for the same key", () => {
    const plan = planSameRefPayment([base(1, 300), base(1, 200)], [{ key: "BASE:1", amount: 500 }]);
    expect(plan).toEqual({ kind: "duplicate" });
  });

  it("normalises :: suffixed keys and ignores zero, negative and non-numeric amounts", () => {
    const plan = planSameRefPayment(
      [],
      [
        { key: "BASE:0::Tuition", amount: 100 },
        { key: "BASE:1", amount: 0 },
        { key: "BASE:2", amount: -50 },
        { key: "BASE:3", amount: Number.NaN },
      ]
    );
    expect(plan).toEqual({ kind: "append", appendTotal: 100, deltas: [{ key: "BASE:0", amount: 100 }] });
  });

  it("rounds fractional rupees before diffing", () => {
    expect(planSameRefPayment([base(0, 1000)], [{ key: "BASE:0", amount: 1000.4 }])).toEqual({ kind: "duplicate" });
  });

  it("is a duplicate for an empty request", () => {
    expect(planSameRefPayment([], [])).toEqual({ kind: "duplicate" });
  });
});
