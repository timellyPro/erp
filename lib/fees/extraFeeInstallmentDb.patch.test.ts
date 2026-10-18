/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { patchExtraFeeWithInstallmentSupport } from "@/lib/fees/extraFeeInstallmentDb";

jest.mock("@/lib/db/tenantContext", () => ({ tenantDb: {} }));

type Row = {
  id: string;
  schoolId: string;
  name: string;
  amount: number;
  targetType: string;
  targetClassId: string | null;
  targetSection: string | null;
  targetStudentId: string | null;
  residencyScope: string;
  splitIntoTwoInstallments: boolean;
};

const row = (over: Partial<Row>): Row => ({
  id: "ef1",
  schoolId: "s1",
  name: "Mess Fee",
  amount: 40000,
  targetType: "SCHOOL",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  splitIntoTwoInstallments: false,
  ...over,
});

function makeDb(rows: Row[]) {
  const db: Record<string, any> = {
    extraFee: {
      findMany: jest.fn(async () => rows),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => ({
        ...rows.find((r) => r.id === where.id)!,
        ...data,
      })),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const created = { ...data, id: `new-${data.name}` };
        rows.push(created);
        return created;
      }),
      delete: jest.fn(async () => ({})),
    },
    paymentFeeAllocation: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db)),
  };
  return db;
}

describe("patchExtraFeeWithInstallmentSupport", () => {
  it("keeps the row id when a Mess lump is only renamed", async () => {
    const lump = row({});
    const db = makeDb([lump]);
    const result = await patchExtraFeeWithInstallmentSupport(db as never, lump, { name: "Mess Charges", amount: 40000 });
    expect(result).not.toBe("no_changes");
    if (result === "no_changes") return;
    expect(result.migrated).toBe(false);
    expect(result.extraFeeIds).toEqual(["ef1"]);
    expect(db.extraFee.create).not.toHaveBeenCalled();
    expect(db.extraFee.delete).not.toHaveBeenCalled();
    expect(db.extraFee.update).toHaveBeenCalledWith({ where: { id: "ef1" }, data: expect.objectContaining({ name: "Mess Charges" }) });
    // payment name snapshot follows the rename
    expect(db.paymentFeeAllocation.updateMany).toHaveBeenCalledWith({
      where: { extraFeeId: "ef1", headType: "EXTRA_FEE" },
      data: { componentName: "Mess Charges" },
    });
    expect(result.studentFeeDelta).toBe(0);
    expect(result.totalBefore).toBe(40000);
  });

  it("still splits a Mess lump into two rows when its amount changes, moving payments across", async () => {
    const lump = row({});
    const db = makeDb([lump]);
    const result = await patchExtraFeeWithInstallmentSupport(db as never, lump, { amount: 50000 });
    if (result === "no_changes") throw new Error("expected a change");
    expect(result.migrated).toBe(true);
    expect(result.extraFeeIds).toHaveLength(2);
    expect(result.studentFeeDelta).toBe(10000);
    expect(result.totalBefore).toBe(40000);
    expect(db.extraFee.delete).toHaveBeenCalledWith({ where: { id: "ef1" } });
  });

  it("renames both installment rows and refreshes the payment name snapshot on each", async () => {
    const first = row({ id: "i1", name: "Mess Fee (1st Installment)", amount: 20000 });
    const second = row({ id: "i2", name: "Mess Fee (2nd Installment)", amount: 20000 });
    const db = makeDb([first, second]);
    const result = await patchExtraFeeWithInstallmentSupport(db as never, first, { name: "Dining" });
    if (result === "no_changes") throw new Error("expected a change");
    expect(result.totalBefore).toBe(40000);
    expect(result.studentFeeDelta).toBe(0);
    const calls = db.paymentFeeAllocation.updateMany.mock.calls as unknown as Array<[{ where: { extraFeeId: string }; data: { componentName: string } }]>;
    expect(calls.map((c) => [c[0].where.extraFeeId, c[0].data.componentName])).toEqual([
      ["i1", "Dining (1st Installment)"],
      ["i2", "Dining (2nd Installment)"],
    ]);
  });
});
