/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  applyBulkSetFeeHead,
  BulkEditConflictError,
  planBulkSetFeeHead,
  undoBulkSetFeeHead,
  validateBulkInput,
} from "@/lib/fees/bulkSetFeeHead";

const state: {
  students: any[];
  extras: any[];
  allocations: Array<{ extraFeeId: string; allocationType: string; allocatedAmount: number }>;
  edits: any[];
  audit: any[];
  deltas: Array<{ sqlValues: unknown[] }>;
  seq: number;
} = { students: [], extras: [], allocations: [], edits: [], audit: [], deltas: [], seq: 0 };

const db: any = {
  student: { findMany: jest.fn(async ({ where }: any) => state.students.filter((s) => where.id.in.includes(s.id))) },
  extraFee: {
    // Copies, like a real client: a caller's rows must not change when the table does.
    findMany: jest.fn(async ({ where }: any) =>
      state.extras
        .filter((e) => (!where.targetStudentId || e.targetStudentId === where.targetStudentId) && (!where.id || where.id.in.includes(e.id)))
        .map((e) => ({ ...e }))
    ),
    findFirst: jest.fn(async ({ where }: any) => {
      const row = state.extras.find((e) => e.id === where.id);
      return row ? { ...row } : null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { splitIntoTwoInstallments: false, residencyConversion: false, ...data, id: `ef${++state.seq}` };
      state.extras.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: any) => ({ ...Object.assign(state.extras.find((e) => e.id === where.id), data) })),
    updateMany: jest.fn(async ({ where, data }: any) => {
      state.extras.filter((e) => e.id === where.id).forEach((e) => Object.assign(e, data));
      return { count: 1 };
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const ids: string[] = where.id.in;
      state.extras = state.extras.filter((e) => !ids.includes(e.id));
      return { count: ids.length };
    }),
    delete: jest.fn(async ({ where }: any) => {
      state.extras = state.extras.filter((e) => e.id !== where.id);
    }),
  },
  paymentFeeAllocation: {
    groupBy: jest.fn(async ({ where }: any) => {
      const ids: string[] = where.extraFeeId.in;
      const map = new Map<string, number>();
      for (const a of state.allocations.filter((x) => ids.includes(x.extraFeeId))) {
        const key = `${a.extraFeeId}|${a.allocationType}`;
        map.set(key, (map.get(key) ?? 0) + a.allocatedAmount);
      }
      return [...map].map(([k, v]) => ({ extraFeeId: k.split("|")[0], allocationType: k.split("|")[1], _sum: { allocatedAmount: v } }));
    }),
    findMany: jest.fn(async () => []),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  feeBulkEdit: {
    create: jest.fn(async ({ data }: any) => {
      const row = { ...data, id: `b${++state.seq}`, status: "APPLIED" };
      state.edits.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: any) => state.edits.find((e) => e.id === where.id) ?? null),
    update: jest.fn(async ({ where, data }: any) => Object.assign(state.edits.find((e) => e.id === where.id), data)),
  },
  feeAuditLog: { create: jest.fn(async ({ data }: any) => state.audit.push(data)) },
  $executeRaw: jest.fn(async (...args: unknown[]) => {
    state.deltas.push({ sqlValues: (args[0] as any).values });
    return 1;
  }),
  $transaction: jest.fn(async (fn: any) => fn(db)),
};

jest.mock("@/lib/db/tenantContext", () => ({ tenantDb: new Proxy({}, { get: (_t, p) => (db as any)[p] }) }));
jest.mock("@/lib/fees/studentFeeReadCache", () => ({ invalidateSchoolFeeReadCaches: jest.fn() }));

const stu = (id: string, residencyType: string, classId = "c1") => ({
  id,
  admissionNumber: `ADM-${id}`,
  residencyType,
  classId,
  class: { name: "5", section: "A" },
  user: { name: `Student ${id}` },
});
const extra = (over: any) => ({
  id: over.id,
  schoolId: "s1",
  name: "Transport",
  amount: 1000,
  targetType: "STUDENT",
  targetClassId: null,
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  residencyConversion: false,
  splitIntoTwoInstallments: false,
  ...over,
});
const actor = { userId: "u1", name: "Admin", role: "SCHOOLADMIN" };

beforeEach(() => {
  state.students = [stu("a", "Day Scholar"), stu("b", "Hosteller"), stu("c", "Day Scholar")];
  state.extras = [];
  state.allocations = [];
  state.edits = [];
  state.audit = [];
  state.deltas = [];
  state.seq = 0;
});

describe("validateBulkInput", () => {
  it("rejects bad input", () => {
    expect(validateBulkInput("", 10, ["a"])).toMatch(/name/);
    expect(validateBulkInput("Transport", 0, ["a"])).toMatch(/Amount/);
    expect(validateBulkInput("Transport", 10, [])).toMatch(/Select/);
    expect(validateBulkInput("Transport", 10, Array.from({ length: 501 }, (_, i) => `${i}`))).toMatch(/at most/);
    expect(validateBulkInput("Transport", 10, ["a"])).toBeNull();
  });
});

describe("planBulkSetFeeHead", () => {
  it("creates for students without the fee and updates those who have it", async () => {
    state.extras = [extra({ id: "e1", targetStudentId: "b", amount: 1000 })];
    const plan = await planBulkSetFeeHead("s1", { headName: "Transport", amount: 1500, studentIds: ["a", "b"] });
    const byId = Object.fromEntries(plan.items.map((i) => [i.studentId, i]));
    expect(byId.a).toMatchObject({ action: "CREATE", currentAmount: 0, newAmount: 1500, delta: 1500 });
    expect(byId.b).toMatchObject({ action: "UPDATE", currentAmount: 1000, newAmount: 1500, delta: 500 });
    expect(plan.willChange).toBe(2);
    expect(plan.totalDelta).toBe(2000);
  });

  it("skips a student when a school or class fee with that name already applies", async () => {
    state.extras = [extra({ id: "e1", targetType: "SCHOOL", amount: 800 })];
    const plan = await planBulkSetFeeHead("s1", { headName: "Transport", amount: 1500, studentIds: ["a"] });
    expect(plan.items[0]).toMatchObject({ action: "SKIP" });
    expect(plan.items[0]!.reason).toMatch(/already applies/);
  });

  it("skips no-change, below-paid, wrong-residency and unknown students", async () => {
    state.extras = [extra({ id: "e1", targetStudentId: "a", amount: 1500 }), extra({ id: "e2", targetStudentId: "c", amount: 2000 })];
    state.allocations = [{ extraFeeId: "e2", allocationType: "PAYMENT", allocatedAmount: 1800 }];
    const plan = await planBulkSetFeeHead("s1", { headName: "Transport", amount: 1500, studentIds: ["a", "c", "zzz"] });
    const reasons = Object.fromEntries(plan.items.map((i) => [i.studentId, i.reason ?? ""]));
    expect(reasons.a).toMatch(/Already set/);
    expect(reasons.c).toMatch(/Already paid 1800/);
    expect(reasons.zzz).toMatch(/not found/);

    const mess = await planBulkSetFeeHead("s1", { headName: "Mess Fee", amount: 5000, studentIds: ["b"] });
    expect(mess.items[0]!.reason).toMatch(/does not apply/); // hostellers never owe Mess
  });

  it("only reads students of the given school", async () => {
    await planBulkSetFeeHead("s1", { headName: "Transport", amount: 1500, studentIds: ["a"] });
    expect((db.student.findMany as jest.Mock).mock.calls.at(-1)![0].where.schoolId).toBe("s1");
  });
});

describe("applyBulkSetFeeHead / undoBulkSetFeeHead", () => {
  it("applies, records the batch and an audit row per student, then undoes it exactly", async () => {
    state.extras = [extra({ id: "e1", targetStudentId: "b", amount: 1000 })];
    const result = await applyBulkSetFeeHead("s1", {
      headName: "Transport",
      amount: 1500,
      studentIds: ["a", "b"],
      confirmCount: 2,
      actor,
    });
    expect(result).toMatchObject({ changed: 2, totalDelta: 2000 });
    expect(state.extras.find((e) => e.targetStudentId === "a")?.amount).toBe(1500);
    expect(state.extras.find((e) => e.id === "e1")?.amount).toBe(1500);
    expect(state.deltas).toHaveLength(2);
    expect(state.audit).toHaveLength(2);
    expect(state.edits[0]).toMatchObject({ headName: "Transport", studentCount: 2, actorName: "Admin" });

    const undo = await undoBulkSetFeeHead("s1", result.batchId, actor);
    expect(undo.undone).toBe(2);
    expect(state.extras.find((e) => e.targetStudentId === "a")).toBeUndefined();
    expect(state.extras.find((e) => e.id === "e1")?.amount).toBe(1000);
    expect(state.edits[0].status).toBe("UNDONE");
    await expect(undoBulkSetFeeHead("s1", result.batchId, actor)).rejects.toBeInstanceOf(BulkEditConflictError);
  });

  it("refuses to apply when the count differs from the preview", async () => {
    await expect(
      applyBulkSetFeeHead("s1", { headName: "Transport", amount: 1500, studentIds: ["a", "b"], confirmCount: 1, actor })
    ).rejects.toBeInstanceOf(BulkEditConflictError);
    expect(state.extras).toHaveLength(0);
  });

  it("refuses to undo when payments were made on a fee the edit created", async () => {
    const result = await applyBulkSetFeeHead("s1", { headName: "Transport", amount: 1500, studentIds: ["a"], confirmCount: 1, actor });
    const created = state.extras[0]!.id;
    state.allocations = [{ extraFeeId: created, allocationType: "PAYMENT", allocatedAmount: 500 }];
    await expect(undoBulkSetFeeHead("s1", result.batchId, actor)).rejects.toThrow(/Cannot undo/);
    expect(state.extras).toHaveLength(1);
    expect(state.edits[0].status).toBe("APPLIED");
  });
});
