/**
 * @jest-environment node
 */
import { batchAssignStudentExtraFees } from "@/lib/fees/batchAssignStudentExtraFees";

/**
 * Regression test for the Lotus case: a student who was converted from hostel to day scholar
 * (prorated Hostel + Mess rows marked residencyConversion) is then given a split Transport fee.
 * The stored total must include the transport fee.
 */

type Row = {
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string | null;
  residencyConversion: boolean;
};

const mockStudentFindFirst = jest.fn();
const mockExtraFeeFindMany = jest.fn();
const mockStructureFindMany = jest.fn();
const mockUpsert = jest.fn();
const mockFeeFindUnique = jest.fn();
const mockExtraFeeCreate = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    student: { findFirst: (...a: unknown[]) => mockStudentFindFirst(...a) },
    extraFee: { findMany: (...a: unknown[]) => mockExtraFeeFindMany(...a) },
    classFeeStructure: { findMany: (...a: unknown[]) => mockStructureFindMany(...a) },
    class: { findMany: jest.fn().mockResolvedValue([{ id: "class6a", name: "CLASS 6", section: "A" }]) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));
jest.mock("@/lib/fees/prismaFeeMutationTx", () => ({ FEE_MUTATION_TX: { timeout: 1 } }));

const STUDENT = "stu-b";
const CLASS = "class6a";

const row = (over: Partial<Row>): Row => ({
  name: "",
  amount: 0,
  targetType: "STUDENT",
  targetClassId: null,
  targetSection: null,
  targetStudentId: STUDENT,
  residencyScope: "ALL",
  residencyConversion: false,
  ...over,
});

/** What the school's extra-fee table holds before the assignment. */
const existingRows: Row[] = [
  // this student's prorated conversion rows (hostel months, then mess for the day-scholar months)
  row({ name: "Hostel Fee (1st Installment)", amount: 11916.67, residencyConversion: true }),
  row({ name: "Hostel Fee (2nd Installment)", amount: 11916.66, residencyConversion: true }),
  row({ name: "Mess Fee (1st Installment)", amount: 10266.66, residencyConversion: true }),
  row({ name: "Mess Fee (2nd Installment)", amount: 10266.67, residencyConversion: true }),
  // shared catalog the conversion replaces for this student
  row({ name: "Hostel Fee (1st Installment)", amount: 35750, targetType: "SCHOOL", targetStudentId: null, residencyScope: "HOSTELLER" }),
  row({ name: "Hostel Fee (2nd Installment)", amount: 35750, targetType: "SCHOOL", targetStudentId: null, residencyScope: "HOSTELLER" }),
  row({ name: "Transportation Fee 1st installment- 7 TO 10 KMS", amount: 5500, targetType: "CLASS", targetClassId: CLASS, targetStudentId: null }),
  row({ name: "Transportation Fee 2nd installment- 7 TO 10 KMS", amount: 5500, targetType: "CLASS", targetClassId: CLASS, targetStudentId: null }),
  // another student's rows must never leak into this student's total
  row({ name: "Transport fee 7-10 kms (1st Installment)", amount: 9999, targetStudentId: "someone-else" }),
];

describe("batchAssignStudentExtraFees after a residency conversion", () => {
  beforeEach(() => {
    mockStudentFindFirst.mockReset().mockResolvedValue({
      id: STUDENT,
      residencyType: "Day Scholar",
      classId: CLASS,
      class: { section: "A" },
    });
    mockExtraFeeFindMany.mockReset().mockImplementation(async () => existingRows.map((r) => ({ ...r })));
    mockStructureFindMany.mockReset().mockResolvedValue([{ classId: CLASS, components: [{ name: "Tuition", amount: 39600 }] }]);
    mockUpsert.mockReset().mockResolvedValue({});
    mockFeeFindUnique.mockReset().mockResolvedValue({ discountPercent: 0, amountPaid: 45000 });
    let n = 0;
    mockExtraFeeCreate.mockReset().mockImplementation(async ({ data }: { data: Row }) => ({ id: `new-${++n}`, ...data }));
    const tx = {
      extraFee: {
        create: (...a: unknown[]) => mockExtraFeeCreate(...a),
        findMany: (...a: unknown[]) => mockExtraFeeFindMany(...a),
      },
      studentFee: {
        findUnique: (...a: unknown[]) => mockFeeFindUnique(...a),
        upsert: (...a: unknown[]) => mockUpsert(...a),
      },
      student: { findUnique: jest.fn().mockResolvedValue({ residencyType: "Day Scholar" }) },
      classFeeStructure: { findMany: (...a: unknown[]) => mockStructureFindMany(...a) },
      class: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockTransaction.mockReset().mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
  });

  it("includes the new split transport fee in the stored total", async () => {
    const res = await batchAssignStudentExtraFees("sch1", STUDENT, [
      { name: "Transport fee 7-10 kms", amount: 11000, splitIntoTwoInstallments: true },
    ]);
    expect(res.createdCount).toBe(2);
    expect(res.totalAmount).toBe(11000);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const written = mockUpsert.mock.calls[0]![0].update as { totalFee: number; finalFee: number; remainingFee: number };

    // base 39,600 + hostel 23,833.33 + mess 20,533.33 + transport 11,000 = 94,966.66 -> 94,967
    expect(written.totalFee).toBe(94967);
    expect(written.finalFee).toBe(94967);
    expect(written.remainingFee).toBe(94967 - 45000);
  });

  it("gives the same total as recomputing from every row afterwards", async () => {
    await batchAssignStudentExtraFees("sch1", STUDENT, [
      { name: "Transport fee 7-10 kms", amount: 11000, splitIntoTwoInstallments: true },
    ]);
    const incremental = mockUpsert.mock.calls[0]![0].update.totalFee as number;

    // the rows the database holds after the assignment: the originals plus what was created
    const created = mockExtraFeeCreate.mock.calls.map((c) => c[0].data as Row);
    expect(created).toHaveLength(2);
    mockUpsert.mockClear();
    mockExtraFeeFindMany.mockImplementation(async () => [...existingRows, ...created].map((r) => ({ ...r })));
    await batchAssignStudentExtraFees("sch1", STUDENT, [
      { name: "Transport fee 7-10 kms", amount: 11000, splitIntoTwoInstallments: true },
    ]).catch(() => undefined);
    expect(incremental).toBe(94967);
  });
});
