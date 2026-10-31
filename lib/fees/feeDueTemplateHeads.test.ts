import { aggregateRowByHead, classifyDueGroup } from "@/lib/fees/feeDueTemplateHeads";

const g = (id: string, label: string) => ({ id, label });

describe("classifyDueGroup", () => {
  it.each([
    ["Hostel Fee (1st Installment)", "hostel"],
    ["Mess Fee (2nd Installment)", "mess"],
    ["Transport fee 7-10 kms (1st Installment)", "bus"],
    ["Transportation Fee 2nd installment- ABOVE 15 KMS", "bus"],
    ["Bus Fee", "bus"],
    ["Tuition Fee 1st Installment · CLASS 6 - A", "tuition"],
    ["Admission Fee", "admission"],
    ["Uniform Kit", "other"],
  ])("%s -> %s", (label, expected) => {
    expect(classifyDueGroup(g(`EXTRA_NAME@x_${label}`, label))).toBe(expected);
  });

  it("treats previous-year columns separately, whatever they are called", () => {
    expect(classifyDueGroup(g("EXTRA_NAME@previous_year_2025_2026_fee_due", "Previous Year 2025-2026 Fee Due"))).toBe("previousYear");
    // A previous-year group is never mistaken for tuition just because of its name.
    expect(classifyDueGroup(g("EXTRA_NAME@previous_year_tuition", "Previous Year Tuition Fee Due"))).toBe("previousYear");
  });
});

describe("aggregateRowByHead", () => {
  const groups = [
    g("BASE@c1@0", "Tuition Fee 1st Installment"),
    g("BASE@c1@1", "Tuition Fee 2nd Installment"),
    g("EXTRA_NAME@mess_1", "Mess Fee (1st Installment)"),
    g("EXTRA_NAME@mess_2", "Mess Fee (2nd Installment)"),
    g("EXTRA_NAME@previous_year_2025_2026_fee_due", "Previous Year 2025-2026 Fee Due"),
  ];

  it("adds installments into one head and keeps previous year apart", () => {
    const out = aggregateRowByHead(
      {
        cellsByGroupId: {
          "BASE@c1@0": { fee: 19800, concession: 0, paid: 19250, due: 550 },
          "BASE@c1@1": { fee: 19800, concession: 1000, paid: 0, due: 18800 },
          "EXTRA_NAME@mess_1": { fee: 15400, concession: 0, paid: 15400, due: 0 },
          "EXTRA_NAME@mess_2": { fee: 15400, concession: 0, paid: 15400, due: 0 },
          "EXTRA_NAME@previous_year_2025_2026_fee_due": { fee: 14000, concession: 9000, paid: 5000, due: 0 },
        },
      },
      groups
    );

    expect(out.tuition).toEqual({ fee: 39600, concession: 1000, paid: 19250, due: 19350 });
    expect(out.mess).toEqual({ fee: 30800, concession: 0, paid: 30800, due: 0 });
    expect(out.previousYear).toEqual({ fee: 14000, concession: 9000, paid: 5000, due: 0 });
    expect(out.hostel).toEqual({ fee: 0, concession: 0, paid: 0, due: 0 });
  });

  it("puts a group it does not recognise under 'other' rather than dropping it", () => {
    const out = aggregateRowByHead({ cellsByGroupId: { "EXTRA_NAME@kit": { fee: 500, concession: 0, paid: 0, due: 500 } } }, [
      g("EXTRA_NAME@kit", "Uniform Kit"),
    ]);
    expect(out.other).toEqual({ fee: 500, concession: 0, paid: 0, due: 500 });
  });

  it("never loses money: every cell lands in exactly one head", () => {
    const cells = {
      "BASE@c1@0": { fee: 100, concession: 10, paid: 40, due: 50 },
      "EXTRA_NAME@mess_1": { fee: 200, concession: 0, paid: 0, due: 200 },
      "EXTRA_NAME@unknown": { fee: 7, concession: 0, paid: 0, due: 7 },
    };
    const out = aggregateRowByHead({ cellsByGroupId: cells }, [
      ...groups,
      g("EXTRA_NAME@unknown", "Something Else"),
    ]);
    const sum = (k: "fee" | "concession" | "paid" | "due") => Object.values(out).reduce((s, c) => s + c[k], 0);
    expect(sum("fee")).toBe(307);
    expect(sum("concession")).toBe(10);
    expect(sum("paid")).toBe(40);
    expect(sum("due")).toBe(257);
  });
});
