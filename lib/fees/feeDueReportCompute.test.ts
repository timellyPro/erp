jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import {
  buildFeeDueReportPayload,
  extraFeesForDueReportRoster,
  extraFeesForExportRoster,
  feeDueGroupHeaderNames,
  fillMissingClassFeeStructuresFromSiblings,
  type ExtraFeeLite,
  type StudentFeeDueInput,
} from "./feeDueReportCompute";

type Comp = { name: string; amount: number };

const student = (over: Partial<StudentFeeDueInput> = {}): StudentFeeDueInput => ({
  studentId: "st1",
  classId: "c1",
  section: "A",
  classDisplay: "8-A",
  totalFee: 12000,
  finalFee: 12000,
  amountPaid: 0,
  remainingFee: 12000,
  discountPercent: 0,
  discountFeeHeadKey: null,
  discountFeeHeadLabel: null,
  name: "Asha",
  admissionNo: "A1",
  parent: "Parent",
  mobile: "9000000000",
  category: "Day Scholar",
  ...over,
});

const extra = (over: Partial<ExtraFeeLite> & { id: string; name: string; amount: number }): ExtraFeeLite => ({
  targetType: "CLASS",
  targetClassId: "c1",
  targetSection: null,
  targetStudentId: null,
  residencyScope: "ALL",
  ...over,
});

const comps = (): Map<string, Comp[]> =>
  new Map([
    [
      "c1",
      [
        { name: "Tuition", amount: 10000 },
        { name: "Lab", amount: 2000 },
      ],
    ],
  ]);

function build(args: {
  students?: StudentFeeDueInput[];
  extraFees?: ExtraFeeLite[];
  paid?: Record<string, number>;
  components?: Map<string, Comp[]>;
  includeSchoolWideExtras?: boolean;
}) {
  return buildFeeDueReportPayload({
    schoolName: "Test School",
    extraFees: args.extraFees ?? [],
    students: args.students ?? [student()],
    netPaidByStudentHead: new Map(Object.entries(args.paid ?? {})),
    componentsByClassId: args.components ?? comps(),
    includeSchoolWideExtras: args.includeSchoolWideExtras,
  });
}

describe("buildFeeDueReportPayload base fees and payments", () => {
  it("reports fee, paid and due per class fee head and rolls them into the row totals", () => {
    const { rows, groups, schoolName } = build({ paid: { "st1|BASE:0": 4000 } });
    expect(schoolName).toBe("Test School");
    expect(groups.map((g) => g.label)).toEqual(["Tuition", "Lab"]);
    const row = rows[0];
    expect(row.cellsByGroupId["BASE@c1@0"]).toEqual({ fee: 10000, concession: 0, paid: 4000, due: 6000 });
    expect(row.cellsByGroupId["BASE@c1@1"]).toEqual({ fee: 2000, concession: 0, paid: 0, due: 2000 });
    expect(row).toMatchObject({ totalFee: 12000, totalDiscount: 0, feesPaid: 4000, feesDue: 8000 });
  });

  it("caps paid at the head's due so an overpayment cannot inflate paid", () => {
    const { rows } = build({ paid: { "st1|BASE:0": 15000 } });
    expect(rows[0].cellsByGroupId["BASE@c1@0"]).toMatchObject({ paid: 10000, due: 0 });
    expect(rows[0].feesPaid).toBe(10000);
  });

  it("ignores negative net paid (net refund) instead of increasing the due", () => {
    const { rows } = build({ paid: { "st1|BASE:0": -500 } });
    expect(rows[0].cellsByGroupId["BASE@c1@0"]).toMatchObject({ paid: 0, due: 10000 });
  });

  it("only counts payments recorded for that student", () => {
    const { rows } = build({ paid: { "other|BASE:0": 9999 } });
    expect(rows[0].feesPaid).toBe(0);
  });

  it("spreads legacy BASE:-1 payments across heads, matching the student profile", () => {
    const { rows } = build({ paid: { "st1|BASE:-1": 6000 } });
    expect(rows[0].feesPaid).toBe(6000);
    expect(rows[0].feesDue).toBe(6000);
  });

  it("has no base fee columns for a student without a class structure", () => {
    const { rows, groups } = build({ students: [student({ classId: null, section: null })] });
    expect(groups).toEqual([]);
    expect(rows[0]).toMatchObject({ totalFee: 0, feesDue: 0 });
  });

  it("drops columns where nothing is charged, paid or discounted", () => {
    const zero = new Map([["c1", [{ name: "Tuition", amount: 5000 }, { name: "Free Head", amount: 0 }]]]);
    const { groups } = build({ components: zero, students: [student({ totalFee: 5000, finalFee: 5000 })] });
    expect(groups.map((g) => g.label)).toEqual(["Tuition"]);
  });
});

describe("buildFeeDueReportPayload discounts", () => {
  it("applies an overall percent discount to every head as concession", () => {
    const { rows } = build({ students: [student({ discountPercent: 10, finalFee: 10800 })] });
    expect(rows[0]).toMatchObject({ totalFee: 12000, totalDiscount: 1200, feesDue: 10800 });
    expect(rows[0].cellsByGroupId["BASE@c1@0"]).toMatchObject({ fee: 10000, concession: 1000, due: 9000 });
  });

  it("applies a per-head discount to only that head", () => {
    const { rows } = build({
      students: [student({ discountFeeHeadKey: "BASE:0", finalFee: 11000 })],
    });
    expect(rows[0].cellsByGroupId["BASE@c1@0"]).toMatchObject({ concession: 1000, due: 9000 });
    expect(rows[0].cellsByGroupId["BASE@c1@1"]).toMatchObject({ concession: 0, due: 2000 });
    expect(rows[0].totalDiscount).toBe(1000);
  });

  it("recovers the discounted head from its label when the key is missing", () => {
    const { rows } = build({
      students: [student({ discountFeeHeadKey: null, discountFeeHeadLabel: "lab", finalFee: 11500 })],
    });
    expect(rows[0].cellsByGroupId["BASE@c1@1"]).toMatchObject({ concession: 500, due: 1500 });
    expect(rows[0].cellsByGroupId["BASE@c1@0"].concession).toBe(0);
  });
});

describe("buildFeeDueReportPayload extras", () => {
  it("adds a column for a class-scoped extra fee", () => {
    const { rows, groups } = build({
      students: [student({ totalFee: 12500, finalFee: 12500 })],
      extraFees: [extra({ id: "e1", name: "Bus", amount: 500 })],
    });
    expect(groups.map((g) => g.label)).toEqual(["Tuition", "Lab", "Bus"]);
    expect(rows[0].cellsByGroupId["EXTRA_NAME@bus"]).toEqual({ fee: 500, concession: 0, paid: 0, due: 500 });
    expect(rows[0].totalFee).toBe(12500);
  });

  it("merges extras with the same name into one column and sums their fee and payments", () => {
    const { rows, groups } = build({
      extraFees: [extra({ id: "e1", name: "Bus", amount: 300 }), extra({ id: "e2", name: "bus", amount: 200 })],
      paid: { "st1|EXTRA:e1": 100, "st1|EXTRA:e2": 50 },
    });
    expect(groups.filter((g) => g.id.startsWith("EXTRA_NAME@"))).toHaveLength(1);
    expect(rows[0].cellsByGroupId["EXTRA_NAME@bus"]).toEqual({ fee: 500, concession: 0, paid: 150, due: 350 });
  });

  it("does not apply an extra from another class or section", () => {
    const { rows } = build({
      extraFees: [
        extra({ id: "e1", name: "Other Class", amount: 900, targetClassId: "c2" }),
        extra({ id: "e2", name: "Other Section", amount: 900, targetType: "SECTION", targetSection: "B" }),
      ],
    });
    expect(Object.keys(rows[0].cellsByGroupId)).toEqual(["BASE@c1@0", "BASE@c1@1"]);
  });

  it("applies a student-specific extra only to that student", () => {
    const { rows } = build({
      students: [student(), student({ studentId: "st2", name: "Ravi" })],
      extraFees: [extra({ id: "e1", name: "Trip", amount: 400, targetType: "STUDENT", targetStudentId: "st2" })],
    });
    const byId = Object.fromEntries(rows.map((r) => [r.studentId, r]));
    expect(byId.st1.cellsByGroupId["EXTRA_NAME@trip"]).toBeUndefined();
    expect(byId.st2.cellsByGroupId["EXTRA_NAME@trip"]).toMatchObject({ fee: 400, due: 400 });
  });

  it("leaves out school-wide extras by default but includes them when asked", () => {
    const school = extra({ id: "e1", name: "Diary", amount: 100, targetType: "SCHOOL", targetClassId: null });
    expect(build({ extraFees: [school] }).groups.map((g) => g.label)).not.toContain("Diary");
    expect(build({ extraFees: [school], includeSchoolWideExtras: true }).groups.map((g) => g.label)).toContain("Diary");
  });

  it("always includes school-wide mess fees for day scholars and hostel fees for hostellers", () => {
    const mess = extra({ id: "m1", name: "Mess Fee", amount: 3000, targetType: "SCHOOL", targetClassId: null });
    const hostel = extra({ id: "h1", name: "Hostel Fee", amount: 4000, targetType: "SCHOOL", targetClassId: null });
    const day = build({ extraFees: [mess, hostel], students: [student({ category: "Day Scholar" })] });
    expect(day.groups.map((g) => g.label)).toContain("Mess Fee");
    expect(day.groups.map((g) => g.label)).not.toContain("Hostel Fee");

    const host = build({ extraFees: [mess, hostel], students: [student({ category: "Hosteller" })] });
    expect(host.groups.map((g) => g.label)).toContain("Hostel Fee");
    expect(host.groups.map((g) => g.label)).not.toContain("Mess Fee");
  });

  it("charges an RTE student no base fees and no tuition-named extras, but keeps other extras", () => {
    const { rows } = build({
      students: [student({ category: "RTE" })],
      extraFees: [extra({ id: "t1", name: "Tuition Fee", amount: 800 }), extra({ id: "e1", name: "Bus", amount: 500 })],
    });
    expect(rows[0].cellsByGroupId["EXTRA_NAME@bus"]).toMatchObject({ fee: 500 });
    expect(rows[0].cellsByGroupId["EXTRA_NAME@tuition_fee"]).toBeUndefined();
    expect(rows[0].totalFee).toBe(500);
  });
});

describe("buildFeeDueReportPayload previous-year fees", () => {
  it("keeps previous-year dues out of the current-year totals and reports them separately", () => {
    const { rows } = build({
      extraFees: [
        extra({ id: "p1", name: "Last Year Fee Due", amount: 800, targetType: "STUDENT", targetClassId: null, targetStudentId: "st1" }),
      ],
      paid: { "st1|EXTRA:p1": 300 },
    });
    expect(rows[0]).toMatchObject({
      totalFee: 12000,
      feesDue: 12000,
      previousYearTotalFee: 800,
      previousYearFeesPaid: 300,
      previousYearFeesDue: 500,
    });
    expect(rows[0].cellsByGroupId["EXTRA_NAME@previous_year_fee_due"]).toBeDefined();
  });
});

describe("buildFeeDueReportPayload rows and columns", () => {
  it("sorts students by class then name and numbers them from 1", () => {
    const { rows } = build({
      students: [
        student({ studentId: "s3", name: "Zed", classDisplay: "9-A", classId: "c1" }),
        student({ studentId: "s2", name: "Bina", classDisplay: "8-A" }),
        student({ studentId: "s1", name: "Asha", classDisplay: "8-A" }),
      ],
    });
    expect(rows.map((r) => [r.no, r.name])).toEqual([
      [1, "Asha"],
      [2, "Bina"],
      [3, "Zed"],
    ]);
  });

  it("falls back to placeholders for missing name and category", () => {
    const { rows } = build({ students: [student({ name: "  ", category: null })] });
    expect(rows[0].name).toBe("-");
    expect(rows[0].category).toBe("Day Scholar");
  });

  it("disambiguates identical head labels from different classes", () => {
    const two = new Map<string, Comp[]>([
      ["c1", [{ name: "Tuition", amount: 1000 }]],
      ["c2", [{ name: "Tuition", amount: 2000 }]],
    ]);
    const { groups } = build({
      components: two,
      students: [
        student({ studentId: "a", classId: "c1", classDisplay: "8-A", name: "A" }),
        student({ studentId: "b", classId: "c2", classDisplay: "9-A", name: "B" }),
      ],
    });
    expect(groups.map((g) => g.label)).toEqual(["Tuition", "Tuition · 9-A"]);
  });

  it("produces an empty report for no students", () => {
    const { rows, groups } = build({ students: [] });
    expect(rows).toEqual([]);
    expect(groups).toEqual([]);
  });

  it("stamps a valid generation timestamp", () => {
    const { generatedAt } = build({});
    expect(Number.isNaN(new Date(generatedAt).getTime())).toBe(false);
  });
});

describe("fillMissingClassFeeStructuresFromSiblings", () => {
  const meta = [
    { id: "c8a", name: "Class 8", section: "A" },
    { id: "c8b", name: "class  8", section: "B" },
    { id: "c9a", name: "Class 9", section: "A" },
  ];

  it("copies components to a sibling section that has none", () => {
    const map = new Map<string, Comp[]>([["c8a", [{ name: "Tuition", amount: 1000 }]]]);
    fillMissingClassFeeStructuresFromSiblings(map, meta);
    expect(map.get("c8b")).toEqual([{ name: "Tuition", amount: 1000 }]);
    expect(map.get("c8b")).not.toBe(map.get("c8a"));
  });

  it("does not overwrite an existing structure or borrow across different class names", () => {
    const map = new Map<string, Comp[]>([
      ["c8a", [{ name: "Tuition", amount: 1000 }]],
      ["c8b", [{ name: "Own", amount: 5 }]],
    ]);
    fillMissingClassFeeStructuresFromSiblings(map, meta);
    expect(map.get("c8b")).toEqual([{ name: "Own", amount: 5 }]);
    expect(map.has("c9a")).toBe(false);
  });

  it("does nothing when no sibling has a structure", () => {
    const map = new Map<string, Comp[]>();
    fillMissingClassFeeStructuresFromSiblings(map, meta);
    expect(map.size).toBe(0);
  });
});

describe("roster extras", () => {
  const students = [student()];
  const classExtra = extra({ id: "c", name: "Bus", amount: 1 });
  const otherClass = extra({ id: "o", name: "Other", amount: 1, targetClassId: "zzz" });
  const schoolExtra = extra({ id: "s", name: "Diary", amount: 1, targetType: "SCHOOL", targetClassId: null });

  it("export roster keeps only extras that apply to someone in the roster", () => {
    expect(extraFeesForExportRoster([classExtra, otherClass], students, false).map((e) => e.id)).toEqual(["c"]);
  });

  it("due-report roster leaves out school-wide extras unless included", () => {
    expect(extraFeesForDueReportRoster([classExtra, schoolExtra], students, false).map((e) => e.id)).toEqual(["c"]);
    expect(extraFeesForDueReportRoster([classExtra, schoolExtra], students, true).map((e) => e.id)).toEqual(["c", "s"]);
  });
});

describe("feeDueGroupHeaderNames", () => {
  it("builds the four sub-headers and strips a trailing 'Fee'", () => {
    expect(feeDueGroupHeaderNames("Tuition Fee")).toEqual({
      fee: "Tuition Fee",
      concession: "Tuition Concession",
      paid: "Tuition Fee Paid",
      due: "Tuition Fee Due",
    });
    expect(feeDueGroupHeaderNames("Bus").fee).toBe("Bus Fee");
  });
});
