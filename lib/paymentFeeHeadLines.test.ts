import {
  labelForPaymentAllocation,
  rawExtraFeeAllocationName,
} from "@/lib/paymentFeeHeadLines";

describe("paymentFeeHeadLines", () => {
  const extraFeeNameById = new Map([
    ["ef-hostel-1", "Hostel Fee - 1st Installment"],
    ["ef-transport", "Transportation Fee - 11 to 12 kms"],
  ]);

  it("uses extra fee name when id resolves", () => {
    expect(
      labelForPaymentAllocation(
        {
          headType: "EXTRA_FEE",
          componentIndex: null,
          componentName: null,
          extraFeeId: "ef-hostel-1",
        },
        extraFeeNameById
      )
    ).toBe("Hostel Fee - 1st Installment");
  });

  it("falls back to stored componentName when extra fee row is missing", () => {
    expect(
      labelForPaymentAllocation(
        {
          headType: "EXTRA_FEE",
          componentIndex: null,
          componentName: "Hostel Fee - 2nd Installment",
          extraFeeId: "deleted-id",
        },
        extraFeeNameById
      )
    ).toBe("Hostel Fee - 2nd Installment");
  });

  it("returns Extra Fee only when both lookup and snapshot are missing", () => {
    expect(
      labelForPaymentAllocation(
        {
          headType: "EXTRA_FEE",
          componentIndex: null,
          componentName: null,
          extraFeeId: "deleted-id",
        },
        extraFeeNameById
      )
    ).toBe("Extra Fee");
  });

  it("rawExtraFeeAllocationName prefers live extra fee over snapshot", () => {
    expect(
      rawExtraFeeAllocationName(
        {
          componentName: "Old snapshot",
          extraFeeId: "ef-hostel-1",
        },
        extraFeeNameById
      )
    ).toBe("Hostel Fee - 1st Installment");
  });
});
