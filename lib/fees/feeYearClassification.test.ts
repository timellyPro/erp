import {
  currentAcademicYearStartYear,
  extractAcademicYearRange,
  isPreviousYearFeeHeadName,
  previousYearFeeHeadLabel,
} from "./feeYearClassification";

describe("currentAcademicYearStartYear", () => {
  it("starts the academic year in June", () => {
    expect(currentAcademicYearStartYear(new Date(2026, 5, 1))).toBe(2026);
    expect(currentAcademicYearStartYear(new Date(2026, 11, 31))).toBe(2026);
  });

  it("belongs to the previous calendar year from January to May", () => {
    expect(currentAcademicYearStartYear(new Date(2026, 0, 1))).toBe(2025);
    expect(currentAcademicYearStartYear(new Date(2026, 4, 31))).toBe(2025);
  });
});

describe("extractAcademicYearRange", () => {
  it.each([
    ["2024-25", { startYear: 2024, endYear: 2025 }],
    ["2024 - 2025", { startYear: 2024, endYear: 2025 }],
    ["Fee 2023/24 due", { startYear: 2023, endYear: 2024 }],
  ])("parses %j", (text, expected) => {
    expect(extractAcademicYearRange(text)).toEqual(expected);
  });

  it("returns null for text with no range, an inverted range, or nullish input", () => {
    expect(extractAcademicYearRange("Tuition Fee")).toBeNull();
    expect(extractAcademicYearRange("2025-24")).toBeNull();
    expect(extractAcademicYearRange("2099-00")).toBeNull();
    expect(extractAcademicYearRange(null)).toBeNull();
    expect(extractAcademicYearRange(undefined)).toBeNull();
  });
});

describe("isPreviousYearFeeHeadName", () => {
  const current = 2025;

  it("detects last/previous year wording combined with a fee word", () => {
    expect(isPreviousYearFeeHeadName("Last Year Fee", current)).toBe(true);
    expect(isPreviousYearFeeHeadName("previous year balance", current)).toBe(true);
    expect(isPreviousYearFeeHeadName("  Previous   Year   Pending ", current)).toBe(true);
  });

  it("requires a fee word alongside the year wording", () => {
    expect(isPreviousYearFeeHeadName("Last year trip", current)).toBe(false);
  });

  it("detects an older academic year range on a fee head", () => {
    expect(isPreviousYearFeeHeadName("Tuition Fee 2023-24", current)).toBe(true);
    expect(isPreviousYearFeeHeadName("2024-25 Balance", current)).toBe(true);
  });

  it("does not flag the current or a future year", () => {
    expect(isPreviousYearFeeHeadName("Tuition Fee 2025-26", current)).toBe(false);
    expect(isPreviousYearFeeHeadName("Tuition Fee 2026-27", current)).toBe(false);
  });

  it("does not flag ordinary heads or empty values", () => {
    expect(isPreviousYearFeeHeadName("Tuition Fee", current)).toBe(false);
    expect(isPreviousYearFeeHeadName("", current)).toBe(false);
    expect(isPreviousYearFeeHeadName(null, current)).toBe(false);
  });
});

describe("previousYearFeeHeadLabel", () => {
  it("returns null for a non previous-year head", () => {
    expect(previousYearFeeHeadLabel("Tuition Fee")).toBeNull();
  });

  it("returns a generic label when there is no year range", () => {
    expect(previousYearFeeHeadLabel("Last Year Fee")).toBe("Previous Year Fee Due");
  });
});
