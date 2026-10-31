/**
 * @jest-environment node
 */
import { describeDevice, loadLoginAudit, parseLoginAuditFilters, todayIst } from "@/lib/school/loginAudit";

const params = (q: string) => new URLSearchParams(q);
// 31 Oct 2026, 23:00 UTC = 1 Nov 2026, 04:30 in India.
const LATE_UTC = new Date("2026-10-31T23:00:00Z");

describe("parseLoginAuditFilters", () => {
  it("defaults to the last 7 days ending today in India, everyone, page 1 of 50", () => {
    expect(todayIst(LATE_UTC)).toBe("2026-11-01");
    expect(parseLoginAuditFilters(params(""), LATE_UTC)).toEqual({
      category: null,
      from: "2026-10-26",
      to: "2026-11-01",
      q: "",
      classId: null,
      page: 1,
      pageSize: 50,
    });
  });

  it("caps page size and floors page", () => {
    expect(parseLoginAuditFilters(params("pageSize=5000&page=-3"))).toMatchObject({ pageSize: 100, page: 1 });
  });

  it("treats ALL as no category", () => {
    expect(parseLoginAuditFilters(params("category=ALL"))).toMatchObject({ category: null });
  });
});

describe("describeDevice", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 13; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36", "Chrome on Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Safari on iPhone / iPad"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0", "Edge on Windows"],
    [null, "Unknown device"],
  ])("%s", (ua, label) => {
    expect(describeDevice(ua)).toBe(label);
  });
});

describe("loadLoginAudit", () => {
  const db = {
    loginAuditLog: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    student: { findMany: jest.fn() },
    class: { findMany: jest.fn() },
  };
  const base = { category: null, from: "2026-10-25", to: "2026-10-31", q: "", classId: null, page: 1, pageSize: 50 } as const;

  beforeEach(() => {
    jest.clearAllMocks();
    db.loginAuditLog.count.mockResolvedValue(2);
    db.loginAuditLog.groupBy.mockResolvedValue([
      { role: "STUDENT", userId: "u1", _count: { _all: 3 } },
      { role: "STUDENT", userId: "u2", _count: { _all: 1 } },
      { role: "TEACHER", userId: "t1", _count: { _all: 2 } },
      { role: "CHAIRMAN", userId: "c1", _count: { _all: 1 } },
    ]);
    db.class.findMany.mockResolvedValue([{ id: "c6a", name: "CLASS 6", section: "A" }]);
    db.loginAuditLog.findMany.mockResolvedValue([
      { id: "l1", createdAt: new Date("2026-10-31T04:00:00Z"), role: "STUDENT", name: "Asha", email: "ADM/1", studentId: "s1", ipAddress: "1.2.3.4", userAgent: null },
      { id: "l2", createdAt: new Date("2026-10-30T04:00:00Z"), role: "TEACHER", name: " ", email: "t@x.in", studentId: null, ipAddress: null, userAgent: null },
    ]);
    db.student.findMany.mockResolvedValue([
      { id: "s1", admissionNumber: "ADM/1", fatherName: "Ravi", class: { name: "CLASS 6", section: "A" } },
    ]);
  });

  it("scopes every query to the school and uses India-time day bounds", async () => {
    await loadLoginAudit(db as never, "school-1", base);
    const where = db.loginAuditLog.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      schoolId: "school-1",
      createdAt: { gte: new Date("2026-10-24T18:30:00.000Z"), lte: new Date("2026-10-31T18:29:59.999Z") },
    });
    expect(db.loginAuditLog.count.mock.calls[0][0].where.schoolId).toBe("school-1");
    expect(db.loginAuditLog.groupBy.mock.calls[0][0].where.schoolId).toBe("school-1");
    expect(db.class.findMany.mock.calls[0][0].where).toEqual({ schoolId: "school-1" });
    expect(db.student.findMany.mock.calls[0][0].where).toEqual({ schoolId: "school-1", id: { in: ["s1"] } });
  });

  it("summarises people and sign-ins per category, admin and chairman together", async () => {
    const page = await loadLoginAudit(db as never, "school-1", base);
    expect(page.summary).toEqual({
      TEACHER: { logins: 2, people: 1 },
      PARENT_STUDENT: { logins: 4, people: 2 },
      STAFF: { logins: 1, people: 1 },
    });
  });

  it("adds the student's class, admission number and father to parent / student rows", async () => {
    const page = await loadLoginAudit(db as never, "school-1", base);
    expect(page.entries[0]).toMatchObject({
      category: "PARENT_STUDENT",
      name: "Asha",
      admissionNumber: "ADM/1",
      className: "CLASS 6 - A",
      fatherName: "Ravi",
      device: "Unknown device",
    });
    expect(page.entries[1]).toMatchObject({ category: "TEACHER", name: "t@x.in", admissionNumber: null });
    expect(page.classes).toEqual([{ id: "c6a", name: "CLASS 6 - A" }]);
  });

  it("filters by category, search and class (class limited to the school's own students)", async () => {
    db.student.findMany.mockResolvedValueOnce([{ id: "s1" }, { id: "s2" }]);
    await loadLoginAudit(db as never, "school-1", { ...base, category: "PARENT_STUDENT", q: "asha", classId: "c6a", page: 3, pageSize: 10 });

    expect(db.student.findMany.mock.calls[0][0].where).toEqual({ schoolId: "school-1", classId: "c6a" });
    const args = db.loginAuditLog.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      schoolId: "school-1",
      role: { in: ["STUDENT"] },
      studentId: { in: ["s1", "s2"] },
      OR: [
        { name: { contains: "asha", mode: "insensitive" } },
        { email: { contains: "asha", mode: "insensitive" } },
      ],
    });
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    // Summary covers the date range only.
    expect(db.loginAuditLog.groupBy.mock.calls[0][0].where).not.toHaveProperty("role");
  });
});
