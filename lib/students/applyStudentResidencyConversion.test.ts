/**
 * @jest-environment node
 */
import { applyStudentResidencyConversion } from "@/lib/students/applyStudentResidencyConversion";

jest.mock("@/lib/db/tenantContext", () => ({ tenantDb: {} }));

type Row = Record<string, unknown>;

const hostelCatalog: Row = {
  id: "cat-hostel",
  name: "Hostel Fee",
  amount: 12000,
  targetType: "SCHOOL",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "HOSTELLER",
  residencyConversion: false,
};
const messCatalog: Row = {
  ...hostelCatalog,
  id: "cat-mess",
  name: "Mess Fee",
  amount: 6000,
  residencyScope: "DAY_SCHOLAR",
};

/**
 * A fake database. `existingConversionRows` are what the student already has; `allocations`
 * are payment allocations (by fee row id) those rows carry.
 */
function makeDb(opts: {
  catalog?: Row[];
  existingConversionRows?: Row[];
  allocations?: Row[];
  afterWriteFails?: boolean;
  residencyYearMonths?: number | null;
}) {
  const order: string[] = [];
  const catalog = opts.catalog ?? [hostelCatalog, messCatalog];
  const existing = opts.existingConversionRows ?? [];

  const extraFeeFindMany = jest.fn(async (args: { where: Record<string, unknown> }) => {
    if (args.where.residencyConversion === false) return catalog; // catalog for the plan
    if (args.where.residencyConversion === true) return existing; // the student's current rows (in tx)
    return []; // names for paid heads
  });

  const tx = {
    extraFee: {
      findMany: extraFeeFindMany,
      update: jest.fn(async (_a: unknown) => order.push("extraFee.update")),
      delete: jest.fn(async (_a: unknown) => order.push("extraFee.delete")),
      createMany: jest.fn(async (_a: unknown) => order.push("extraFee.createMany")),
    },
    paymentFeeAllocation: { findMany: jest.fn(async (_a: unknown) => opts.allocations ?? []) },
    studentResidencyPeriod: {
      deleteMany: jest.fn(async (_a: unknown) => order.push("period.deleteMany")),
      createMany: jest.fn(async (_a: unknown) => order.push("period.createMany")),
    },
    student: { update: jest.fn(async (_a: unknown) => order.push("student.update")) },
  };

  const db = {
    extraFee: { findMany: extraFeeFindMany },
    studentResidencyPeriod: { findMany: jest.fn(async () => []) },
    paymentFeeAllocation: { findMany: jest.fn(async () => []) },
    schoolSettings: {
      findUnique: jest.fn(async () => (opts.residencyYearMonths == null ? null : { residencyYearMonths: opts.residencyYearMonths })),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  return { db, tx, order };
}

const base = {
  schoolId: "sch1",
  studentId: "stu1",
  classId: "c1",
  section: "A",
  fromResidency: "Day Scholar" as const,
  toResidency: "Hosteller" as const,
  // October: 4 day-scholar months (Jun-Sep) then 8 hostel months
  convertedOn: "2026-10-07",
};

const run = (db: unknown, hooks?: Parameters<typeof applyStudentResidencyConversion>[2]) =>
  applyStudentResidencyConversion(db as Parameters<typeof applyStudentResidencyConversion>[0], base, hooks);

describe("applyStudentResidencyConversion", () => {
  it("prorates by months: 8 hostel months of 12,000 and 4 day-scholar months of 6,000 mess", async () => {
    const { db, tx } = makeDb({});
    await run(db);
    const created = (tx.extraFee.createMany.mock.calls[0]![0] as { data: Row[] }).data;
    expect(created.map((r) => [r.name, r.amount])).toEqual([
      ["Hostel Fee", 8000],
      ["Mess Fee", 2000],
    ]);
    expect(created.every((r) => r.residencyConversion === true && r.targetStudentId === "stu1")).toBe(true);
    expect(tx.student.update).toHaveBeenCalledWith({ where: { id: "stu1" }, data: { residencyType: "Hosteller" } });
  });

  it("uses the school's year length: with 10 months a move on 1 October is 4 day-scholar months then 6 hostel months, each annual / 10", async () => {
    const { db, tx } = makeDb({ residencyYearMonths: 10 });
    await applyStudentResidencyConversion(db as unknown as Parameters<typeof applyStudentResidencyConversion>[0], { ...base, convertedOn: "2026-10-01" });
    const created = (tx.extraFee.createMany.mock.calls[0]![0] as { data: Row[] }).data;
    expect(created.map((r) => [r.name, r.amount])).toEqual([
      ["Hostel Fee", 7200], // 12,000 / 10 x 6
      ["Mess Fee", 2400], // 6,000 / 10 x 4
    ]);
  });

  it("falls back to 12 months when the school has no setting row", async () => {
    const { db, tx } = makeDb({ residencyYearMonths: null });
    await applyStudentResidencyConversion(db as unknown as Parameters<typeof applyStudentResidencyConversion>[0], { ...base, convertedOn: "2026-10-01" });
    const created = (tx.extraFee.createMany.mock.calls[0]![0] as { data: Row[] }).data;
    expect(created.map((r) => r.amount)).toEqual([8000, 2000]);
  });

  it("runs the afterWrite hook inside the same transaction, after every write", async () => {
    const { db, tx, order } = makeDb({});
    const afterWrite = jest.fn(async (t: unknown) => {
      expect(t).toBe(tx);
      order.push("afterWrite");
    });
    await run(db, { afterWrite });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(order[order.length - 1]).toBe("afterWrite");
    expect(order.indexOf("student.update")).toBeLessThan(order.indexOf("afterWrite"));
    expect(order.indexOf("extraFee.createMany")).toBeLessThan(order.indexOf("afterWrite"));
  });

  it("rejects when the hook fails, so the whole conversion rolls back with it", async () => {
    const { db } = makeDb({});
    await expect(
      run(db, {
        afterWrite: async () => {
          throw new Error("recalc failed");
        },
      })
    ).rejects.toThrow("recalc failed");
  });

  it("updates existing conversion rows IN PLACE by name, keeping their ids so payments stay attached", async () => {
    const { db, tx } = makeDb({
      existingConversionRows: [
        { id: "e-hostel", name: "Hostel Fee", amount: 5000 },
        { id: "e-mess", name: "mess fee", amount: 2000 }, // same name (case-insensitive), same amount
      ],
    });
    await run(db);
    expect(tx.extraFee.update).toHaveBeenCalledTimes(1);
    expect(tx.extraFee.update).toHaveBeenCalledWith({ where: { id: "e-hostel" }, data: { amount: 8000 } });
    expect(tx.extraFee.delete).not.toHaveBeenCalled();
    expect(tx.extraFee.createMany).not.toHaveBeenCalled();
  });

  it("keeps a row the new plan drops when payments are linked to it, billing only what was paid", async () => {
    const { db, tx } = makeDb({
      existingConversionRows: [{ id: "e-old", name: "Transport Fee (7 to 10 kms)", amount: 5000 }],
      allocations: [
        { extraFeeId: "e-old", allocationType: "PAYMENT", allocatedAmount: 3000 },
        { extraFeeId: "e-old", allocationType: "REFUND", allocatedAmount: 500 },
      ],
    });
    await run(db);
    expect(tx.extraFee.delete).not.toHaveBeenCalled();
    expect(tx.extraFee.update).toHaveBeenCalledWith({ where: { id: "e-old" }, data: { amount: 2500 } });
    // the plan's own rows are still created
    expect((tx.extraFee.createMany.mock.calls[0]![0] as { data: Row[] }).data).toHaveLength(2);
  });

  it("deletes a dropped row that has no payments", async () => {
    const { db, tx } = makeDb({
      existingConversionRows: [{ id: "e-old", name: "Transport Fee (7 to 10 kms)", amount: 5000 }],
    });
    await run(db);
    expect(tx.extraFee.delete).toHaveBeenCalledWith({ where: { id: "e-old" } });
  });

  it("looks up payments only through successful payments", async () => {
    const { db, tx } = makeDb({
      existingConversionRows: [{ id: "e-old", name: "Gone", amount: 100 }],
    });
    await run(db);
    const where = (tx.paymentFeeAllocation.findMany.mock.calls[0]![0] as { where: Row }).where;
    expect(where).toMatchObject({ extraFeeId: { in: ["e-old"] }, headType: "EXTRA_FEE" });
    expect(JSON.stringify(where.payment)).toContain("SUCCESS");
  });

  it("rewrites the residency periods for the academic year", async () => {
    const { db, tx } = makeDb({});
    await run(db);
    expect(tx.studentResidencyPeriod.deleteMany).toHaveBeenCalledWith({
      where: { studentId: "stu1", academicYearStartYear: 2026 },
    });
    const periods = (tx.studentResidencyPeriod.createMany.mock.calls[0]![0] as { data: Row[] }).data;
    expect(periods.map((p) => [p.residencyType, p.months])).toEqual([
      ["Day Scholar", 4],
      ["Hosteller", 8],
    ]);
  });

  it("stops with TRANSPORT_REQUIRED, before writing anything, when a transport slab must be chosen", async () => {
    const transport = (id: string, name: string): Row => ({
      ...hostelCatalog,
      id,
      name,
      amount: 12000,
      residencyScope: "ALL",
    });
    const { db } = makeDb({
      catalog: [
        hostelCatalog,
        messCatalog,
        transport("t1", "Transport Fee - 7 to 10 kms"),
        transport("t2", "Transport Fee - 11 to 12 kms"),
      ],
    });
    await expect(
      applyStudentResidencyConversion(
        db as unknown as Parameters<typeof applyStudentResidencyConversion>[0],
        { ...base, fromResidency: "Hosteller", toResidency: "Day Scholar" }
      )
    ).rejects.toMatchObject({ code: "TRANSPORT_REQUIRED" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
