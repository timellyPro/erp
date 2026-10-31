/**
 * @jest-environment node
 */
import { birthdayMonthDays, loadBirthdaysToday, todayInIst } from "@/lib/school/birthdaysToday";

describe("todayInIst", () => {
  it("uses the India calendar date, not the server's", () => {
    // 20:00 UTC on 30 Oct is already 01:30 on 31 Oct in India.
    expect(todayInIst(new Date("2026-10-30T20:00:00Z"))).toMatchObject({ year: 2026, month: 10, day: 31, ymd: "2026-10-31" });
    // 18:00 UTC on 30 Oct is 23:30 on 30 Oct in India.
    expect(todayInIst(new Date("2026-10-30T18:00:00Z")).ymd).toBe("2026-10-30");
  });
});

describe("birthdayMonthDays", () => {
  it("returns just today on an ordinary day", () => {
    expect(birthdayMonthDays({ year: 2026, month: 10, day: 31 })).toEqual([{ month: 10, day: 31 }]);
  });

  it("celebrates 29 Feb babies on 28 Feb in a non-leap year", () => {
    expect(birthdayMonthDays({ year: 2026, month: 2, day: 28 })).toEqual([
      { month: 2, day: 28 },
      { month: 2, day: 29 },
    ]);
  });

  it("does not add 29 Feb on 28 Feb of a leap year", () => {
    expect(birthdayMonthDays({ year: 2028, month: 2, day: 28 })).toEqual([{ month: 2, day: 28 }]);
  });
});

describe("loadBirthdaysToday", () => {
  const now = new Date("2026-10-31T06:00:00Z");

  it("maps rows, formats the class and computes the age they turn", async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { id: "s1", name: "  Asha R ", admissionNumber: "ADM/2026/LS1", className: "CLASS 6", section: "A", dobYmd: "2015-10-31" },
      { id: "s2", name: null, admissionNumber: "ADM/2026/LS2", className: null, section: null, dobYmd: "2012-10-31" },
    ]);
    const out = await loadBirthdaysToday({ $queryRaw: queryRaw } as never, "school-1", now);

    expect(out.date).toBe("2026-10-31");
    expect(out.count).toBe(2);
    expect(out.students[0]).toEqual({ id: "s1", name: "Asha R", className: "CLASS 6 - A", admissionNumber: "ADM/2026/LS1", turning: 11 });
    expect(out.students[1]).toMatchObject({ name: "-", className: "-", turning: 14 });
  });

  it("scopes the query to the school and only active students", async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    await loadBirthdaysToday({ $queryRaw: queryRaw } as never, "school-1", now);

    const sql = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain('s."schoolId" =');
    expect(sql.sql).toContain("Asia/Kolkata");
    expect(sql.values).toEqual(expect.arrayContaining(["school-1", "Active", 10, 31]));
  });

  it("matches both 28 and 29 Feb on 28 Feb of a non-leap year", async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    await loadBirthdaysToday({ $queryRaw: queryRaw } as never, "school-1", new Date("2026-02-28T06:00:00Z"));

    const sql = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining([28, 29]));
  });

  it("returns an empty list when nobody has a birthday", async () => {
    const out = await loadBirthdaysToday({ $queryRaw: jest.fn().mockResolvedValue([]) } as never, "school-1", now);
    expect(out).toEqual({ date: "2026-10-31", count: 0, students: [] });
  });
});
