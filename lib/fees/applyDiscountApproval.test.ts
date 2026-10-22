import { applyApprovedDiscounts, recalculateFeeAfterDiscountApproval } from "@/lib/fees/applyDiscountApproval";

const row = (o: Partial<Parameters<typeof applyApprovedDiscounts>[1][number]> = {}) => ({
  discountPercent: 0,
  discountFixedAmount: null,
  discountFeeHeadKey: null,
  discountFeeHeadLabel: null,
  discountRemarks: null,
  ...o,
});

describe("applyApprovedDiscounts", () => {
  it("takes a percent concession off the structure only, extras stay at full price", () => {
    const r = applyApprovedDiscounts({ base: 50000, extrasTotal: 10000 }, [row({ discountPercent: 10 })]);
    expect(r).toMatchObject({ totalFee: 60000, finalFee: 55000, totalDiscount: 5000 });
    expect(r.discountPercent).toBeCloseTo(10);
  });

  it("takes a fixed concession off as given and stacks several", () => {
    const r = applyApprovedDiscounts({ base: 50000, extrasTotal: 0 }, [
      row({ discountFixedAmount: 10000 }),
      row({ discountFixedAmount: 5000 }),
    ]);
    expect(r).toMatchObject({ totalFee: 50000, finalFee: 35000, totalDiscount: 15000 });
  });

  it("never discounts below zero", () => {
    const r = applyApprovedDiscounts({ base: 1000, extrasTotal: 0 }, [row({ discountFixedAmount: 5000 })]);
    expect(r.finalFee).toBe(0);
    expect(r.discountPercent).toBe(100);
  });

  it("with no approved discounts the final fee is the full total", () => {
    expect(applyApprovedDiscounts({ base: 40000, extrasTotal: 2500 }, [])).toMatchObject({
      totalFee: 42500,
      finalFee: 42500,
      discountPercent: 0,
    });
  });
});

describe("recalculateFeeAfterDiscountApproval", () => {
  function fakeTx(opts: { storedTotal: number; amountPaid: number; structure: number; approved: unknown[] }) {
    const updates: unknown[][] = [];
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ totalFee: opts.storedTotal, amountPaid: opts.amountPaid }]) // locked row
        .mockResolvedValueOnce(opts.approved),
      $executeRaw: jest.fn(async (...args: unknown[]) => {
        updates.push(args);
        return 1;
      }),
      student: { findFirst: jest.fn().mockResolvedValue({ classId: "c1", residencyType: "Day Scholar", class: { section: "B" } }) },
      classFeeStructure: {
        findUnique: jest.fn().mockResolvedValue(opts.structure ? { components: [{ amount: opts.structure }] } : null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      extraFee: { findMany: jest.fn().mockResolvedValue([]) },
      class: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    };
    return { tx, updates };
  }

  it("rebuilds a short stored total from the fee structure instead of reusing it", async () => {
    // Stored total is missing tuition (15,000 instead of 54,550); the structure says 54,550.
    const { tx, updates } = fakeTx({ storedTotal: 15000, amountPaid: 0, structure: 54550, approved: [row({ discountFixedAmount: 10000 })] });
    const r = await recalculateFeeAfterDiscountApproval(tx as never, { schoolId: "s1", studentId: "st1", studentFeeId: "sf1" });
    expect(r).toMatchObject({ totalFee: 54550, finalFee: 44550 });
    // values bound into the UPDATE: totalFee, discountPercent, finalFee, remainingFee ...
    const bound = updates[0].slice(1);
    expect(bound[0]).toBe(54550);
    expect(bound[2]).toBe(44550);
    expect(bound[3]).toBe(44550);
  });

  it("uses the amount paid from the locked row for the remaining balance and never writes it", async () => {
    const { tx, updates } = fakeTx({ storedTotal: 50000, amountPaid: 20000, structure: 50000, approved: [row({ discountFixedAmount: 5000 })] });
    await recalculateFeeAfterDiscountApproval(tx as never, { schoolId: "s1", studentId: "st1", studentFeeId: "sf1" });
    expect(updates[0].slice(1)[3]).toBe(25000);
    expect(String((updates[0][0] as string[]).join(" "))).not.toContain('"amountPaid"');
  });

  it("locks the fee row before reading it", async () => {
    const { tx } = fakeTx({ storedTotal: 1, amountPaid: 0, structure: 1000, approved: [] });
    await recalculateFeeAfterDiscountApproval(tx as never, { schoolId: "s1", studentId: "st1", studentFeeId: "sf1" });
    expect((tx.$queryRaw.mock.calls[0][0] as string[]).join(" ")).toMatch(/FOR UPDATE/);
  });

  it("keeps the stored total when there is no structure to rebuild from", async () => {
    const { tx } = fakeTx({ storedTotal: 30000, amountPaid: 0, structure: 0, approved: [] });
    const r = await recalculateFeeAfterDiscountApproval(tx as never, { schoolId: "s1", studentId: "st1", studentFeeId: "sf1" });
    expect(r?.totalFee).toBe(30000);
  });

  it("returns null when the fee row does not exist", async () => {
    const { tx } = fakeTx({ storedTotal: 0, amountPaid: 0, structure: 0, approved: [] });
    tx.$queryRaw.mockReset().mockResolvedValueOnce([]);
    expect(await recalculateFeeAfterDiscountApproval(tx as never, { schoolId: "s1", studentId: "st1", studentFeeId: "x" })).toBeNull();
  });
});
