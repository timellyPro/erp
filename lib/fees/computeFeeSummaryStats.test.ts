/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeCurrentAndPreviousFeeStats } from "@/lib/fees/computeFeeSummaryStats";

const db: any = {
  studentFee: { findMany: jest.fn() },
  classFeeStructure: { findMany: jest.fn() },
  extraFee: { findMany: jest.fn() },
  class: { findMany: jest.fn() },
  paymentFeeAllocation: { findMany: jest.fn() },
};

jest.mock("@/lib/db/tenantContext", () => ({ tenantDb: new Proxy({}, { get: (_t, p) => db[p] }) }));

const feeRow = {
  studentId: "st1",
  totalFee: 1000,
  finalFee: 1000,
  amountPaid: 1100,
  remainingFee: 0,
  discountPercent: 0,
  discountFeeHeadKey: null,
  discountFeeHeadLabel: null,
  student: {
    id: "st1",
    admissionNumber: "A1",
    fatherName: "F",
    phoneNo: "1",
    residencyType: "Day Scholar",
    class: { id: "c1", name: "5", section: "A" },
    user: { name: "S" },
  },
};

describe("computeCurrentAndPreviousFeeStats unplaced payments", () => {
  beforeEach(() => {
    db.studentFee.findMany.mockResolvedValue([feeRow]);
    db.classFeeStructure.findMany.mockResolvedValue([{ classId: "c1", components: [{ name: "Tuition", amount: 1000 }] }]);
    db.extraFee.findMany.mockResolvedValue([]);
    db.class.findMany.mockResolvedValue([{ id: "c1", name: "5", section: "A" }]);
  });

  it("reports money paid against a fee head the student no longer owes", async () => {
    db.paymentFeeAllocation.findMany
      .mockResolvedValueOnce([
        { studentId: "st1", headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, allocatedAmount: 800 },
        { studentId: "st1", headType: "EXTRA_FEE", componentIndex: null, extraFeeId: "deleted-fee", allocatedAmount: 300 },
      ])
      .mockResolvedValueOnce([]);
    const stats = await computeCurrentAndPreviousFeeStats("s1");
    expect(stats.totalCollected).toBe(800);
    expect(stats.unplacedPayments).toBe(300);
    expect(stats.unplacedStudents).toBe(1);
  });

  it("reports nothing when every payment landed on a fee head", async () => {
    db.paymentFeeAllocation.findMany
      .mockResolvedValueOnce([{ studentId: "st1", headType: "BASE_COMPONENT", componentIndex: 0, extraFeeId: null, allocatedAmount: 800 }])
      .mockResolvedValueOnce([]);
    const stats = await computeCurrentAndPreviousFeeStats("s1");
    expect(stats.unplacedPayments).toBe(0);
    expect(stats.unplacedStudents).toBe(0);
  });
});
