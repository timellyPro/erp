import {
  baseComponentIndexFromAllocationKey,
  extraFeeIdFromAllocationKey,
  normalizeFeeAllocationKey,
} from "@/lib/feeAllocationKeys";

describe("feeAllocationKeys", () => {
  it("strips installment UI suffix from extra fee keys", () => {
    expect(normalizeFeeAllocationKey("EXTRA:abc123::INST1")).toBe("EXTRA:abc123");
    expect(extraFeeIdFromAllocationKey("EXTRA:abc123::INST1")).toBe("abc123");
  });

  it("parses base component index", () => {
    expect(baseComponentIndexFromAllocationKey("BASE:2::INST1")).toBe(2);
  });
});
