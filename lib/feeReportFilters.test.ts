import { filterFeeDueReportToHead, type FeeDueReportPayload } from "@/lib/feeDueReportCompute";
import {
  feeHeadNameMatches,
  filterDayReportTransactions,
  isCreatedAtInDateRange,
  narrowDayReportTransactionToHead,
  orderedYmdRange,
} from "@/lib/feeReportFilters";
import type { DayReportTx } from "@/lib/feeDayReportExcel";

const duePayload: FeeDueReportPayload = {
  schoolName: "Lotus",
  generatedAt: "2026-09-29T00:00:00.000Z",
  groups: [
    { id: "tuition", label: "Tuition Fee" },
    { id: "tuition-2", label: "Tuition Fee - 2nd Installment" },
    { id: "hostel", label: "Hostel Fee" },
    { id: "transport", label: "Transportation Fee" },
  ],
  rows: [
    {
      studentId: "s1",
      no: 1,
      name: "Mokshitha",
      admissionNo: "LS1",
      section: "CLASS 10-C",
      parent: "Parent",
      mobile: "9000000000",
      category: "Day Scholar",
      totalFee: 400,
      totalDiscount: 20,
      feesPaid: 150,
      feesDue: 230,
      previousYearTotalFee: 50,
      previousYearFeesPaid: 10,
      previousYearFeesDue: 40,
      cellsByGroupId: {
        tuition: { fee: 100, concession: 10, paid: 40, due: 50 },
        "tuition-2": { fee: 100, concession: 10, paid: 60, due: 30 },
        hostel: { fee: 100, concession: 0, paid: 50, due: 50 },
        transport: { fee: 100, concession: 0, paid: 0, due: 100 },
      },
    },
    {
      studentId: "s2",
      no: 2,
      name: "Rithvik",
      admissionNo: "LS323",
      section: "CLASS 6-B",
      parent: "Parent",
      mobile: "9000000001",
      category: "Hosteller",
      totalFee: 100,
      totalDiscount: 0,
      feesPaid: 0,
      feesDue: 100,
      cellsByGroupId: {
        hostel: { fee: 100, concession: 0, paid: 0, due: 100 },
      },
    },
  ],
};

function payment(partial: Partial<DayReportTx> & Pick<DayReportTx, "id" | "createdAt">): DayReportTx {
  return {
    amount: 0,
    gateway: "CASH",
    student: { class: { id: "class-10c", name: "CLASS 10", section: "C" }, user: { name: "Student" } },
    ...partial,
  };
}

describe("fee head matching", () => {
  it("matches the head and its installments only", () => {
    expect(feeHeadNameMatches("Tuition Fee", "Tuition Fee")).toBe(true);
    expect(feeHeadNameMatches("  tuition   fee ", "Tuition Fee")).toBe(true);
    expect(feeHeadNameMatches("Tuition Fee - 2nd Installment", "Tuition Fee")).toBe(true);
    expect(feeHeadNameMatches("Tuition Fee-1st Installment", "Tuition Fee")).toBe(true);
    expect(feeHeadNameMatches("Hostel Fee", "Tuition Fee")).toBe(false);
    expect(feeHeadNameMatches("Transportation Fee", "Transport")).toBe(false);
    expect(feeHeadNameMatches("Anything", "")).toBe(true);
  });
});

describe("fee due report head filter", () => {
  it("keeps every tuition column, drops other heads, and retotals the row", () => {
    const filtered = filterFeeDueReportToHead(duePayload, "Tuition Fee");
    expect(filtered.groups.map((group) => group.id)).toEqual(["tuition", "tuition-2"]);
    expect(filtered.rows.map((row) => row.name)).toEqual(["Mokshitha"]);
    const row = filtered.rows[0];
    expect(row.no).toBe(1);
    expect(row.totalFee).toBe(200);
    expect(row.totalDiscount).toBe(20);
    expect(row.feesPaid).toBe(100);
    expect(row.feesDue).toBe(80);
    expect(row.previousYearTotalFee).toBe(0);
    expect(row.previousYearFeesPaid).toBe(0);
    expect(row.previousYearFeesDue).toBe(0);
    expect(Object.keys(row.cellsByGroupId).sort()).toEqual(["tuition", "tuition-2"]);
    const cells = Object.values(row.cellsByGroupId);
    expect(cells.reduce((sum, cell) => sum + cell.fee, 0)).toBe(row.totalFee);
    expect(cells.reduce((sum, cell) => sum + cell.concession, 0)).toBe(row.totalDiscount);
    expect(cells.reduce((sum, cell) => sum + cell.paid, 0)).toBe(row.feesPaid);
    expect(cells.reduce((sum, cell) => sum + cell.due, 0)).toBe(row.feesDue);
  });

  it("keeps hostel students and leaves tuition out", () => {
    const filtered = filterFeeDueReportToHead(duePayload, "hostel fee");
    expect(filtered.groups).toEqual([{ id: "hostel", label: "Hostel Fee" }]);
    expect(filtered.rows.map((row) => row.name)).toEqual(["Mokshitha", "Rithvik"]);
    expect(filtered.rows[1].totalFee).toBe(100);
    expect(filtered.rows[1].feesDue).toBe(100);
    expect(filtered.rows[1].cellsByGroupId.tuition).toBeUndefined();
  });

  it("returns no rows for an unknown head and the full report for a blank head", () => {
    const missing = filterFeeDueReportToHead(duePayload, "Mess Fee");
    expect(missing.groups).toEqual([]);
    expect(missing.rows).toEqual([]);

    const all = filterFeeDueReportToHead(duePayload, "   ");
    expect(all.groups).toHaveLength(4);
    expect(all.rows).toHaveLength(2);
    expect(all.rows[0].totalFee).toBe(400);
  });
});

describe("day report date range and head", () => {
  const transactions: DayReportTx[] = [
    payment({
      id: "in-range-mixed",
      createdAt: "2026-09-10T10:30:00.000Z",
      amount: 1500,
      feeAllocations: [
        { name: "Tuition Fee - 1st Installment", amount: 1000 },
        { name: "Hostel Fee - 1st Installment", amount: 500 },
      ],
    }),
    payment({
      id: "before",
      createdAt: "2026-09-01T02:00:00.000Z",
      amount: 200,
      feeTypeName: "Tuition Fee",
    }),
    payment({
      id: "after",
      createdAt: "2026-09-21T18:00:00.000Z",
      amount: 300,
      feeAllocations: [{ name: "Tuition Fee", amount: 300 }],
    }),
    payment({
      id: "other-class",
      createdAt: "2026-09-12T08:00:00.000Z",
      amount: 400,
      feeAllocations: [{ name: "Tuition Fee", amount: 400 }],
      student: { class: { id: "class-6b" }, user: { name: "Other" } },
    }),
    payment({
      id: "type-only",
      createdAt: "2026-09-15T12:00:00.000Z",
      amount: 250,
      feeTypeName: "Tuition Fee - 2nd Installment",
    }),
  ];

  it("includes both ends of the calendar range and excludes days outside it", () => {
    expect(isCreatedAtInDateRange("2026-09-05T00:30:00", "2026-09-05", "2026-09-20")).toBe(true);
    expect(isCreatedAtInDateRange("2026-09-20T23:30:00", "2026-09-05", "2026-09-20")).toBe(true);
    expect(isCreatedAtInDateRange("2026-09-04T23:30:00", "2026-09-05", "2026-09-20")).toBe(false);
    expect(isCreatedAtInDateRange("2026-09-21T00:30:00", "2026-09-05", "2026-09-20")).toBe(false);
    expect(isCreatedAtInDateRange("not-a-date", "2026-09-05", "2026-09-20")).toBe(false);
    expect(orderedYmdRange("2026-09-20", "2026-09-05")).toEqual({
      from: "2026-09-05",
      to: "2026-09-20",
    });
  });

  it("downloads only the selected head inside the from-to range", () => {
    const rows = filterDayReportTransactions(transactions, {
      fromYmd: "2026-09-20",
      toYmd: "2026-09-05",
      classId: "class-10c",
      headName: "Tuition Fee",
    });

    expect(rows.map((row) => row.id)).toEqual(["in-range-mixed", "type-only"]);
    const mixed = rows[0];
    expect(mixed.amount).toBe(1000);
    expect(mixed.feeAllocations).toEqual([{ name: "Tuition Fee - 1st Installment", amount: 1000 }]);
    expect(mixed.feeTypeName).toBe("Tuition Fee - 1st Installment");
    expect(rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)).toBe(1250);
  });

  it("keeps the full payment when no head is selected", () => {
    const rows = filterDayReportTransactions(transactions, {
      fromYmd: "2026-09-10",
      toYmd: "2026-09-10",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1500);
    expect(rows[0].feeAllocations).toHaveLength(2);
  });

  it("drops a payment that has none of the selected head", () => {
    const hostelOnly = payment({
      id: "hostel",
      createdAt: "2026-09-10T04:00:00.000Z",
      amount: 500,
      feeAllocations: [{ name: "Hostel Fee", amount: 500 }],
    });
    expect(narrowDayReportTransactionToHead(hostelOnly, "Tuition Fee")).toBeNull();
  });
});
