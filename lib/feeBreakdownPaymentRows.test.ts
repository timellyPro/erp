import { applyPendingDiscountsToDueRows, type DueHeadRow } from "@/lib/feeBreakdownPaymentRows";

function row(partial: Partial<DueHeadRow> & Pick<DueHeadRow, "key" | "label">): DueHeadRow {
  return {
    totalAmount: 23650,
    paidAmount: 0,
    discountAmount: 0,
    dueBefore: 23650,
    payAmount: "",
    payEntireHead: false,
    ...partial,
  };
}

describe("applyPendingDiscountsToDueRows", () => {
  it("reduces the matching fee head while a discount is still pending", () => {
    const rows = [
      row({ key: "EXTRA:tuition-1", label: "Tuition Fee - 1st Installment" }),
      row({ key: "EXTRA:tuition-2", label: "Tuition Fee - 2nd Installment", paidAmount: 13650, dueBefore: 10000 }),
    ];

    const next = applyPendingDiscountsToDueRows(rows, [
      {
        status: "PENDING",
        discountFixedAmount: 10000,
        discountFeeHeadKey: "EXTRA:tuition-2",
        discountFeeHeadLabel: "Tuition Fee - 2nd Installment",
      },
    ]);

    expect(next[0]).toMatchObject({ discountAmount: 0, dueBefore: 23650, paidAmount: 0 });
    expect(next[1]).toMatchObject({
      totalAmount: 23650,
      discountAmount: 10000,
      paidAmount: 13650,
      dueBefore: 0,
    });
  });

  it("leaves an accepted discount unchanged because the breakdown already includes it", () => {
    const rows = [
      row({
        key: "EXTRA:tuition-2",
        label: "Tuition Fee - 2nd Installment",
        discountAmount: 10000,
        paidAmount: 13650,
        dueBefore: 0,
      }),
    ];

    const next = applyPendingDiscountsToDueRows(rows, [
      {
        status: "APPROVED",
        discountFixedAmount: 10000,
        discountFeeHeadKey: "EXTRA:tuition-2",
        discountFeeHeadLabel: "Tuition Fee - 2nd Installment",
      },
    ]);

    expect(next[0]).toMatchObject({ discountAmount: 10000, dueBefore: 0, paidAmount: 13650 });
  });

  it("does not reduce a rejected discount", () => {
    const rows = [row({ key: "EXTRA:tuition-2", label: "Tuition Fee - 2nd Installment" })];
    const next = applyPendingDiscountsToDueRows(rows, [
      {
        status: "REJECTED",
        discountFixedAmount: 10000,
        discountFeeHeadKey: "EXTRA:tuition-2",
      },
    ]);
    expect(next[0].discountAmount).toBe(0);
    expect(next[0].dueBefore).toBe(23650);
  });

  it("matches the fee head by label when the stored key is missing", () => {
    const rows = [row({ key: "EXTRA:hostel-2", label: "Hostel Fee - 2nd Installment" })];
    const next = applyPendingDiscountsToDueRows(rows, [
      {
        status: "PENDING",
        discountFixedAmount: 5000,
        discountFeeHeadLabel: "Hostel Fee - 2nd Installment",
      },
    ]);
    expect(next[0]).toMatchObject({ discountAmount: 5000, dueBefore: 18650 });
  });
});
