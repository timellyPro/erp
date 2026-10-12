import {
  baseComponentIndexFromHead,
  mergeDiscountApprovals,
  type DiscountApprovalSummary,
} from "./feesBreakdownHelpers";

describe("baseComponentIndexFromHead", () => {
  it("returns null when the head is an extra fee", () => {
    expect(baseComponentIndexFromHead({ key: "BASE:2", extraFeeId: "ef1" })).toBeNull();
  });

  it("returns null when the key isn't a BASE: key", () => {
    expect(baseComponentIndexFromHead({ key: "EXTRA:1" })).toBeNull();
  });

  it("extracts the numeric index from a BASE:<n> key", () => {
    expect(baseComponentIndexFromHead({ key: "BASE:3" })).toBe(3);
  });

  it("extracts the numeric index from a BASE:<n>::suffix key", () => {
    expect(baseComponentIndexFromHead({ key: "BASE:5::tuition" })).toBe(5);
  });

  it("prefers sourceKey over key when both are present", () => {
    expect(
      baseComponentIndexFromHead({ key: "irrelevant", sourceKey: "BASE:7" })
    ).toBe(7);
  });

  it("returns null when the index portion isn't a finite number", () => {
    expect(baseComponentIndexFromHead({ key: "BASE:not-a-number" })).toBeNull();
  });
});

describe("mergeDiscountApprovals", () => {
  const approval = (overrides: Partial<DiscountApprovalSummary>): DiscountApprovalSummary => ({
    id: "a1",
    status: "PENDING",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("keeps both when ids differ", () => {
    const result = mergeDiscountApprovals(
      [approval({ id: "a1" })],
      [approval({ id: "a2" })]
    );
    expect(result.map((r) => r.id).sort()).toEqual(["a1", "a2"]);
  });

  it("deduplicates by id, preferring the incoming (newer) version", () => {
    const result = mergeDiscountApprovals(
      [approval({ id: "a1", status: "PENDING" })],
      [approval({ id: "a1", status: "APPROVED" })]
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("APPROVED");
  });

  it("sorts the merged list newest-first by createdAt", () => {
    const result = mergeDiscountApprovals(
      [approval({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" })],
      [approval({ id: "new", createdAt: "2026-02-01T00:00:00.000Z" })]
    );
    expect(result.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("treats a missing createdAt as the oldest (epoch)", () => {
    const result = mergeDiscountApprovals(
      [approval({ id: "no-date", createdAt: undefined })],
      [approval({ id: "dated", createdAt: "2026-01-01T00:00:00.000Z" })]
    );
    expect(result.map((r) => r.id)).toEqual(["dated", "no-date"]);
  });
});
