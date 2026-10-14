import { formatPaymentMethod, formatRupee, headStatus } from "./parentFeesHelpers";

describe("formatPaymentMethod", () => {
  it("returns an em dash for an empty/undefined method", () => {
    expect(formatPaymentMethod(undefined)).toBe("—");
    expect(formatPaymentMethod("")).toBe("—");
    expect(formatPaymentMethod("   ")).toBe("—");
  });

  it.each([
    ["OFFLINE", "Cash"],
    ["CASH", "Cash"],
    ["OFFLINE_CASH", "Cash"],
    ["UPI", "UPI"],
    ["OFFLINE_UPI", "UPI"],
    ["CHEQUE", "Cheque"],
    ["DD", "Demand draft"],
    ["ONLINE", "Online"],
    ["BANK_TRANSFER", "Bank transfer"],
    ["CARD", "Card"],
    ["HYPERPG", "Online gateway"],
    ["OTHERS", "Others"],
    ["OFFLINE_OTHERS", "Others"],
  ])("maps %s to %s", (input, expected) => {
    expect(formatPaymentMethod(input)).toBe(expected);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(formatPaymentMethod("  upi  ")).toBe("UPI");
    expect(formatPaymentMethod("cash")).toBe("Cash");
  });

  it("title-cases an unrecognized OFFLINE_ prefixed method", () => {
    expect(formatPaymentMethod("OFFLINE_NET_BANKING")).toBe("Net Banking");
  });

  it("falls back to the raw method for anything else unrecognized", () => {
    expect(formatPaymentMethod("SOMETHING_WEIRD")).toBe("SOMETHING_WEIRD");
  });
});

describe("formatRupee", () => {
  it("formats a whole number with the Indian numbering system", () => {
    expect(formatRupee(150000)).toBe("₹1,50,000");
  });

  it("rounds a fractional amount", () => {
    expect(formatRupee(999.6)).toBe("₹1,000");
    expect(formatRupee(999.4)).toBe("₹999");
  });

  it("treats NaN/undefined-like input as 0", () => {
    expect(formatRupee(Number("not-a-number"))).toBe("₹0");
  });

  it("formats zero", () => {
    expect(formatRupee(0)).toBe("₹0");
  });
});

describe("headStatus", () => {
  it("returns N/A when the head has no total", () => {
    expect(headStatus(0, 0)).toEqual({ label: "N/A", className: "bg-white/10 text-gray-400" });
    expect(headStatus(0, -5)).toEqual({ label: "N/A", className: "bg-white/10 text-gray-400" });
  });

  it("returns Paid when nothing is due", () => {
    expect(headStatus(0, 1000)).toEqual({
      label: "Paid",
      className: "bg-emerald-500/20 text-emerald-400",
    });
  });

  it("returns Partial when some but not all is due", () => {
    expect(headStatus(400, 1000)).toEqual({
      label: "Partial",
      className: "bg-amber-500/20 text-amber-400",
    });
  });

  it("returns Due when the full amount is outstanding", () => {
    expect(headStatus(1000, 1000)).toEqual({
      label: "Due",
      className: "bg-red-500/20 text-red-400",
    });
  });
});
