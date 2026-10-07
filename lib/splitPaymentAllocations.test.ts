jest.mock("@/lib/studentFeeReadCache", () => ({
  invalidateStudentFeeReadCaches: jest.fn(),
}));

import { splitPaymentAllocations } from "@/lib/splitPaymentAllocations";

describe("splitPaymentAllocations", () => {
  it("replaces single-head payment with multi-head split totaling payment amount", async () => {
    const created: unknown[] = [];
    const db = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          studentId: "stu-1",
          amount: 21000,
          student: { schoolId: "school-1" },
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<number>) => {
        const tx = {
          paymentFeeAllocation: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
              created.push(...data);
            }),
          },
        };
        return fn(tx);
      }),
    };

    const result = await splitPaymentAllocations(
      db as never,
      "pay-1",
      [
        {
          headType: "EXTRA_FEE",
          extraFeeId: "transport-id",
          componentName: "Transportation Fee - 1st Installment",
          allocatedAmount: 5500,
        },
        {
          headType: "EXTRA_FEE",
          extraFeeId: "mess-id",
          componentName: "Mess Fee - 1st Installment",
          allocatedAmount: 15500,
        },
      ],
      { schoolId: "school-1", studentId: "stu-1" }
    );

    expect(result.replaced).toBe(2);
    expect(created).toHaveLength(2);
    expect(
      (created as Array<{ allocatedAmount: number }>).reduce((s, r) => s + r.allocatedAmount, 0)
    ).toBe(21000);
  });

  it("rejects splits that do not sum to payment amount", async () => {
    const db = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          studentId: "stu-1",
          amount: 21000,
          student: { schoolId: "school-1" },
        }),
      },
      $transaction: jest.fn(),
    };

    await expect(
      splitPaymentAllocations(db as never, "pay-1", [
        {
          headType: "EXTRA_FEE",
          extraFeeId: "mess-id",
          componentName: "Mess Fee",
          allocatedAmount: 10000,
        },
      ])
    ).rejects.toThrow(/must equal payment amount/);
  });
});
