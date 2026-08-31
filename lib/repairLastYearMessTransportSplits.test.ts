import { repairLastYearMessTransportSplits } from "@/lib/repairLastYearMessTransportSplits";

jest.mock("@/lib/computeAdminStudentFeeBreakdown", () => ({
  computeAdminStudentFeeBreakdown: jest.fn(),
}));

jest.mock("@/lib/splitPaymentAllocations", () => ({
  splitPaymentAllocations: jest.fn(),
}));

import { computeAdminStudentFeeBreakdown } from "@/lib/computeAdminStudentFeeBreakdown";
import { splitPaymentAllocations } from "@/lib/splitPaymentAllocations";

const mockBreakdown = computeAdminStudentFeeBreakdown as jest.MockedFunction<
  typeof computeAdminStudentFeeBreakdown
>;
const mockSplit = splitPaymentAllocations as jest.MockedFunction<typeof splitPaymentAllocations>;

describe("repairLastYearMessTransportSplits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSplit.mockResolvedValue({ replaced: 3 });
  });

  it("splits day-scholar payment posted entirely to last year into transport + mess + remainder", async () => {
    mockBreakdown.mockResolvedValue({
      dueHeads: [
        {
          headType: "EXTRA_FEE",
          label: "Mess Fee - 1st Installment",
          extraFeeId: "mess-id",
          dueBefore: 17050,
          snapshotAmount: 17050,
          paid: 0,
        },
        {
          headType: "EXTRA_FEE",
          label: "Transportation Fee (7 to 10 kms) - 1st Installment",
          extraFeeId: "transport-id",
          dueBefore: 5500,
          snapshotAmount: 5500,
          paid: 0,
        },
      ],
    } as never);

    const db = {
      extraFee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "last-year-id",
            targetStudentId: "stu-1",
            name: "Last Year 2025-2026 Fee Due",
            amount: 29000,
          },
        ]),
      },
      paymentFeeAllocation: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "alloc-1",
              paymentId: "pay-1",
              studentId: "stu-1",
              allocatedAmount: 29000,
              payment: { amount: 29000, status: "SUCCESS" },
            },
          ])
          .mockResolvedValueOnce([
            {
              paymentId: "pay-1",
              extraFeeId: "last-year-id",
              allocatedAmount: 29000,
            },
          ]),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: "stu-1",
          residencyType: "DAY_SCHOLAR",
          schoolId: "school-1",
        }),
      },
      payment: {},
    };

    const result = await repairLastYearMessTransportSplits(db as never, "school-1");

    expect(result).toEqual({ scanned: 1, repaired: 1, skipped: 0 });
    expect(mockSplit).toHaveBeenCalledTimes(1);
    const splits = mockSplit.mock.calls[0]![2] as Array<{
      extraFeeId: string;
      allocatedAmount: number;
    }>;
    expect(splits.find((s) => s.extraFeeId === "transport-id")?.allocatedAmount).toBe(5500);
    expect(splits.find((s) => s.extraFeeId === "mess-id")?.allocatedAmount).toBe(17050);
    expect(splits.find((s) => s.extraFeeId === "last-year-id")?.allocatedAmount).toBe(6450);
  });

  it("skips hostellers", async () => {
    const db = {
      extraFee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "last-year-id",
            targetStudentId: "stu-1",
            name: "Last Year 2025-2026 Fee Due",
            amount: 20000,
          },
        ]),
      },
      paymentFeeAllocation: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: "alloc-1",
              paymentId: "pay-1",
              studentId: "stu-1",
              allocatedAmount: 20000,
              payment: { amount: 20000, status: "SUCCESS" },
            },
          ])
          .mockResolvedValueOnce([
            {
              paymentId: "pay-1",
              extraFeeId: "last-year-id",
              allocatedAmount: 20000,
            },
          ]),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: "stu-1",
          residencyType: "HOSTELLER",
          schoolId: "school-1",
        }),
      },
      payment: {},
    };

    const result = await repairLastYearMessTransportSplits(db as never, "school-1");
    expect(result).toEqual({ scanned: 1, repaired: 0, skipped: 1 });
    expect(mockBreakdown).not.toHaveBeenCalled();
    expect(mockSplit).not.toHaveBeenCalled();
  });
});
