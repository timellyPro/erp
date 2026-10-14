import { roundRupee } from "@/lib/formatRupee";

/** Mirrors reconcileStudentFeeIntegrity fee math (pure, for unit tests). */
export function computeIntegrityTotals(input: {
  grossTotal: number;
  finalFee: number;
  paymentSum: number;
}) {
  const totalFee = roundRupee(input.grossTotal);
  const finalFee = roundRupee(input.finalFee);
  const amountPaid = roundRupee(input.paymentSum);
  const remainingFee = Math.max(0, roundRupee(finalFee - amountPaid));
  const discountAmount = Math.max(0, roundRupee(totalFee - finalFee));
  return { totalFee, finalFee, amountPaid, remainingFee, discountAmount };
}

describe("computeIntegrityTotals", () => {
  it("pending = finalFee - paid (receipt truth)", () => {
    const r = computeIntegrityTotals({
      grossTotal: 116400,
      finalFee: 116400,
      paymentSum: 36000,
    });
    expect(r.remainingFee).toBe(80400);
    expect(r.amountPaid).toBe(36000);
  });

  it("fully paid student has zero pending", () => {
    const r = computeIntegrityTotals({
      grossTotal: 111100,
      finalFee: 104100,
      paymentSum: 104100,
    });
    expect(r.remainingFee).toBe(0);
    expect(r.discountAmount).toBe(7000);
  });

  it("never shows negative pending", () => {
    const r = computeIntegrityTotals({
      grossTotal: 48400,
      finalFee: 48400,
      paymentSum: 83000,
    });
    expect(r.remainingFee).toBe(0);
  });
});
