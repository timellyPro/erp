import {
  buildResidencyConversionPlan,
  includeExtraFeeOnStudentBill,
  monthsBetweenYmd,
  residencyConversionCreditByHead,
  residencyConversionStudentIds,
} from "@/lib/residencyConversion";
import type { CatalogExtraFee } from "@/lib/residencyConversion";

function fee(partial: Partial<CatalogExtraFee> & Pick<CatalogExtraFee, "id" | "name" | "amount">): CatalogExtraFee {
  return {
    targetType: "SCHOOL",
    targetClassId: null,
    targetSection: null,
    targetStudentId: null,
    residencyScope: "ALL",
    ...partial,
  };
}

describe("residency conversion plan", () => {
  const catalog: CatalogExtraFee[] = [
    fee({ id: "h1", name: "Hostel Fee (1st Installment)", amount: 30000, residencyScope: "HOSTELLER" }),
    fee({ id: "h2", name: "Hostel Fee (2nd Installment)", amount: 30000, residencyScope: "HOSTELLER" }),
    fee({ id: "m1", name: "Mess Fee (1st Installment)", amount: 12000, residencyScope: "DAY_SCHOLAR" }),
    fee({ id: "m2", name: "Mess Fee (2nd Installment)", amount: 12000, residencyScope: "DAY_SCHOLAR" }),
    fee({
      id: "t1",
      name: "Transportation Fee - 7 to 10 kms (1st Installment)",
      amount: 6000,
      residencyScope: "DAY_SCHOLAR",
    }),
    fee({
      id: "t2",
      name: "Transportation Fee - 7 to 10 kms (2nd Installment)",
      amount: 6000,
      residencyScope: "DAY_SCHOLAR",
    }),
    fee({
      id: "t3",
      name: "Transportation Fee - 11 to 12 kms (1st Installment)",
      amount: 8000,
      residencyScope: "DAY_SCHOLAR",
    }),
    fee({
      id: "t4",
      name: "Transportation Fee - 11 to 12 kms (2nd Installment)",
      amount: 8000,
      residencyScope: "DAY_SCHOLAR",
    }),
  ];

  it("splits a December conversion into 6 hostel months and 6 day-scholar months", () => {
    const plan = buildResidencyConversionPlan({
      academicYearStartYear: 2026,
      convertedOn: "2026-12-01",
      fromResidency: "Hosteller",
      toResidency: "Day Scholar",
      classId: "class-1",
      section: "A",
      studentId: "stu-1",
      catalog,
      existingPeriods: [],
      transportKey: "transportation fee - 11 to 12 kms",
    });

    expect(plan.requiresTransportChoice).toBe(false);
    expect(plan.periods.map((period) => [period.residencyType, period.months])).toEqual([
      ["Hosteller", 6],
      ["Day Scholar", 6],
    ]);
    expect(plan.charges.find((charge) => charge.category === "hostel")).toMatchObject({
      months: 6,
      proratedAmount: 30000,
    });
    expect(plan.charges.find((charge) => charge.category === "mess")).toMatchObject({
      months: 6,
      proratedAmount: 12000,
    });
    expect(plan.charges.find((charge) => charge.category === "transport")).toMatchObject({
      months: 6,
      proratedAmount: 8000,
    });
    expect(plan.periods.reduce((sum, period) => sum + period.months, 0)).toBe(12);
  });

  it("keeps an earlier stretch when the student converts back", () => {
    const first = buildResidencyConversionPlan({
      academicYearStartYear: 2026,
      convertedOn: "2026-12-01",
      fromResidency: "Hosteller",
      toResidency: "Day Scholar",
      classId: null,
      section: null,
      studentId: "stu-1",
      catalog,
      existingPeriods: [],
      transportKey: "transportation fee - 7 to 10 kms",
    });
    const second = buildResidencyConversionPlan({
      academicYearStartYear: 2026,
      convertedOn: "2027-03-01",
      fromResidency: "Day Scholar",
      toResidency: "Hosteller",
      classId: null,
      section: null,
      studentId: "stu-1",
      catalog,
      existingPeriods: first.periods,
    });

    expect(second.periods.map((period) => [period.residencyType, period.months])).toEqual([
      ["Hosteller", 6],
      ["Day Scholar", 3],
      ["Hosteller", 3],
    ]);
    expect(monthsBetweenYmd("2026-06-01", "2026-12-01", 2026)).toBe(6);
    expect(second.charges.find((charge) => charge.category === "hostel")?.months).toBe(9);
    expect(second.charges.find((charge) => charge.category === "mess")?.months).toBe(3);
  });

  it("asks for a transport slab only for this student when several kilometre bands exist", () => {
    const plan = buildResidencyConversionPlan({
      academicYearStartYear: 2026,
      convertedOn: "2026-12-01",
      fromResidency: "Hosteller",
      toResidency: "Day Scholar",
      classId: null,
      section: null,
      studentId: "stu-1",
      catalog,
      existingPeriods: [],
    });
    expect(plan.requiresTransportChoice).toBe(true);
    expect(plan.transportOptions.map((option) => option.label).sort()).toEqual([
      "11 to 12 kms",
      "7 to 10 kms",
    ]);
    expect(plan.feeRows.some((row) => row.name.toLowerCase().includes("transport"))).toBe(false);
  });

  it("does not bill class hostel or mess once this student has conversion rows", () => {
    const fees = [
      fee({ id: "class-hostel", name: "Hostel Fee (1st Installment)", amount: 30000 }),
      fee({
        id: "own",
        name: "Hostel Fee (1st Installment)",
        amount: 15000,
        targetType: "STUDENT",
        targetStudentId: "stu-1",
        residencyConversion: true,
      }),
    ];
    const converted = residencyConversionStudentIds(fees);
    expect(includeExtraFeeOnStudentBill(fees[0]!, "Day Scholar", "stu-1", converted)).toBe(false);
    expect(includeExtraFeeOnStudentBill(fees[1]!, "Day Scholar", "stu-1", converted)).toBe(true);
    expect(includeExtraFeeOnStudentBill(fees[0]!, "Hosteller", "stu-2", converted)).toBe(true);
  });

  it("moves hostel overpayment onto the new day-scholar fees without changing receipts", () => {
    const { creditByKey, creditApplied } = residencyConversionCreditByHead([
      { key: "hostel", snapshotDue: 30000, paid: 60000, residencyConversion: true },
      { key: "mess", snapshotDue: 12000, paid: 0, residencyConversion: true },
      { key: "transport", snapshotDue: 8000, paid: 0, residencyConversion: true },
    ]);
    expect(creditApplied).toBe(20000);
    expect(creditByKey.get("mess")).toBe(12000);
    expect(creditByKey.get("transport")).toBe(8000);
    expect(creditByKey.has("hostel")).toBe(false);
  });
});
