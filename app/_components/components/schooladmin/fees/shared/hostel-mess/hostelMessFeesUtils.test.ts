import {
  scopeLabel,
  normName,
  classLabel,
  combinedAmount,
  patchTargetId,
  type CatalogHead,
} from "./hostelMessFeesUtils";
import type { ExtraFee } from "../../types";

const fee = (overrides: Partial<ExtraFee> = {}): ExtraFee =>
  ({
    id: "ef1",
    name: "Hostel Fee",
    amount: 1000,
    targetType: "CLASS",
    ...overrides,
  }) as ExtraFee;

describe("scopeLabel", () => {
  it("labels HOSTELLER scope", () => {
    expect(scopeLabel("HOSTELLER")).toBe("Hostel only");
  });

  it("labels DAY_SCHOLAR scope", () => {
    expect(scopeLabel("DAY_SCHOLAR")).toBe("Day scholars only");
  });

  it("defaults to 'All students' for null/undefined/ALL/unknown", () => {
    expect(scopeLabel(null)).toBe("All students");
    expect(scopeLabel(undefined)).toBe("All students");
    expect(scopeLabel("ALL")).toBe("All students");
    expect(scopeLabel("SOMETHING_ELSE")).toBe("All students");
  });

  it("is case-insensitive", () => {
    expect(scopeLabel("hosteller")).toBe("Hostel only");
  });
});

describe("normName", () => {
  it("trims and lowercases", () => {
    expect(normName("  Hostel Fee  ")).toBe("hostel fee");
  });
});

describe("classLabel", () => {
  it("combines name and section", () => {
    expect(classLabel({ name: "5", section: "A" } as never)).toBe("5 A");
  });

  it("omits the section when absent", () => {
    expect(classLabel({ name: "5", section: null } as never)).toBe("5");
  });
});

describe("combinedAmount", () => {
  it("sums both installments for a pair", () => {
    const head: CatalogHead = {
      pair: { first: fee({ amount: 500 }), second: fee({ amount: 600 }) },
      lump: null,
      single: null,
    };
    expect(combinedAmount(head)).toBe(1100);
  });

  it("returns the lump amount", () => {
    const head: CatalogHead = { pair: null, lump: fee({ amount: 1200 }), single: null };
    expect(combinedAmount(head)).toBe(1200);
  });

  it("returns the single amount", () => {
    const head: CatalogHead = { pair: null, lump: null, single: fee({ amount: 800 }) };
    expect(combinedAmount(head)).toBe(800);
  });

  it("returns 0 when nothing resolved", () => {
    expect(combinedAmount({ pair: null, lump: null, single: null })).toBe(0);
  });

  it("treats a non-numeric amount as 0", () => {
    const head: CatalogHead = {
      pair: null,
      lump: null,
      single: fee({ amount: "not-a-number" as unknown as number }),
    };
    expect(combinedAmount(head)).toBe(0);
  });
});

describe("patchTargetId", () => {
  it("returns the first installment's id for a pair", () => {
    const head: CatalogHead = {
      pair: { first: fee({ id: "first-id" }), second: fee({ id: "second-id" }) },
      lump: null,
      single: null,
    };
    expect(patchTargetId(head)).toBe("first-id");
  });

  it("returns the lump id", () => {
    expect(patchTargetId({ pair: null, lump: fee({ id: "lump-id" }), single: null })).toBe(
      "lump-id"
    );
  });

  it("returns the single id", () => {
    expect(patchTargetId({ pair: null, lump: null, single: fee({ id: "single-id" }) })).toBe(
      "single-id"
    );
  });

  it("returns null when nothing resolved", () => {
    expect(patchTargetId({ pair: null, lump: null, single: null })).toBeNull();
  });
});
