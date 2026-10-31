import { Prisma } from "@prisma/client";
import { activeStudentWhere } from "@/lib/students/studentStatus";

export type BirthdayStudent = {
  id: string;
  name: string;
  className: string;
  admissionNumber: string;
  /** Age the student turns today. */
  turning: number;
};

export type BirthdaysToday = {
  /** Today's date in India, YYYY-MM-DD. */
  date: string;
  count: number;
  students: BirthdayStudent[];
};

/** What parents and students get: other children's name and class only, never admission number or age. */
export type BirthdayStudentLimited = Pick<BirthdayStudent, "id" | "name" | "className">;

export type BirthdaysTodayLimited = Omit<BirthdaysToday, "students"> & { students: BirthdayStudentLimited[] };

export function toLimitedBirthdays(full: BirthdaysToday): BirthdaysTodayLimited {
  return {
    date: full.date,
    count: full.count,
    students: full.students.map(({ id, name, className }) => ({ id, name, className })),
  };
}

export type IstDate = { year: number; month: number; day: number; ymd: string };

const SCHOOL_TIME_ZONE = "Asia/Kolkata";

/** Today's calendar date in India, whatever timezone the server runs in. */
export function todayInIst(now: Date = new Date()): IstDate {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day, ymd };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Month/day pairs whose birthday is celebrated today; 29 Feb babies are celebrated on 28 Feb in non-leap years. */
export function birthdayMonthDays({ year, month, day }: Pick<IstDate, "year" | "month" | "day">) {
  const out = [{ month, day }];
  if (month === 2 && day === 28 && !isLeapYear(year)) out.push({ month: 2, day: 29 });
  return out;
}

type Row = {
  id: string;
  name: string | null;
  admissionNumber: string;
  className: string | null;
  section: string | null;
  dobYmd: string;
};

/**
 * Active students whose birthday is today. `dob` is stored three different ways in the wild (IST midnight as
 * 18:30 UTC the day before, UTC midnight, and noon UTC), so every value is converted to its India calendar date
 * before month/day are compared, otherwise most birthdays would land on the wrong day.
 */
export async function loadBirthdaysToday(
  db: { $queryRaw: <T>(query: Prisma.Sql) => Promise<T> },
  schoolId: string,
  now: Date = new Date()
): Promise<BirthdaysToday> {
  const today = todayInIst(now);
  const matches = birthdayMonthDays(today).map(
    (md) => Prisma.sql`(EXTRACT(MONTH FROM ist.d) = ${md.month} AND EXTRACT(DAY FROM ist.d) = ${md.day})`
  );

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT s.id,
           u.name,
           s."admissionNumber",
           c.name AS "className",
           c.section,
           to_char(ist.d, 'YYYY-MM-DD') AS "dobYmd"
    FROM "Student" s
    JOIN "User" u ON u.id = s."userId"
    LEFT JOIN "Class" c ON c.id = s."classId"
    CROSS JOIN LATERAL (SELECT (s.dob AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' AS d) ist
    WHERE s."schoolId" = ${schoolId}
      AND s.status = ${activeStudentWhere.status}
      AND (${Prisma.join(matches, " OR ")})
    ORDER BY c.name NULLS LAST, c.section NULLS LAST, u.name
  `);

  const students: BirthdayStudent[] = rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || "-",
    className: r.className ? `${r.className}${r.section ? ` - ${r.section}` : ""}` : "-",
    admissionNumber: r.admissionNumber,
    turning: today.year - Number(r.dobYmd.slice(0, 4)),
  }));

  return { date: today.ymd, count: students.length, students };
}
