import {
  canonicalizeGatewayForStorage,
  feeReportColumnFromGateway,
  isOfflinePaymentGateway,
  paymentTypeExportLabel,
} from "./feePaymentGateway";

describe("canonicalizeGatewayForStorage", () => {
  it.each([
    ["", "OFFLINE_CASH"],
    ["  ", "OFFLINE_CASH"],
    ["cash", "OFFLINE_CASH"],
    ["OFFLINE", "OFFLINE_CASH"],
    ["hyperpg", "HYPERPG"],
    ["offline_upi", "OFFLINE_UPI"],
    ["upi", "OFFLINE_UPI"],
    ["chq", "OFFLINE_CHEQUE"],
    ["cheque", "OFFLINE_CHEQUE"],
    ["dd", "OFFLINE_DD"],
    ["online", "OFFLINE_ONLINE"],
    ["neft", "OFFLINE_BANK_TRANSFER"],
    ["card", "OFFLINE_BANK_TRANSFER"],
    ["others", "OFFLINE_OTHERS"],
    ["something_else", "SOMETHING_ELSE"],
  ])("maps %j to %s", (raw, expected) => {
    expect(canonicalizeGatewayForStorage(raw)).toBe(expected);
  });
});

describe("isOfflinePaymentGateway", () => {
  it("treats OFFLINE_* and legacy offline codes as offline", () => {
    for (const g of ["OFFLINE_CASH", "offline_upi", "CASH", "cheque", "DD", "BANK_TRANSFER"]) {
      expect(isOfflinePaymentGateway(g)).toBe(true);
    }
  });

  it("treats the online gateway and empty values as not offline", () => {
    for (const g of ["HYPERPG", "hyperpg", "", null, undefined]) {
      expect(isOfflinePaymentGateway(g)).toBe(false);
    }
  });
});

describe("feeReportColumnFromGateway", () => {
  it.each([
    ["OFFLINE_CASH", "Cash"],
    ["OFFLINE", "Cash"],
    ["OFFLINE_CHEQUE", "Cheque"],
    ["OFFLINE_DD", "DD"],
    ["HYPERPG", "ONLINE PAYMENT"],
    ["OFFLINE_UPI", "ONLINE PAYMENT"],
    ["OFFLINE_BANK_TRANSFER", "ONLINE PAYMENT"],
    ["OFFLINE_OTHERS", "OTHERS"],
    ["mystery", "OTHERS"],
    [null, "OTHERS"],
  ])("puts %j in the %s column", (gateway, column) => {
    expect(feeReportColumnFromGateway(gateway)).toBe(column);
  });
});

describe("paymentTypeExportLabel", () => {
  it.each([
    ["", "-"],
    [null, "-"],
    ["OFFLINE_CASH", "Cash"],
    ["HYPERPG", "Online (payment gateway)"],
    ["OFFLINE_DD", "Demand Draft (DD)"],
    ["NEFT", "Bank / card / transfer"],
    ["OFFLINE_OTHERS", "Others"],
    ["OFFLINE_WALLET_PAY", "Wallet Pay"],
    ["Razorpay", "Razorpay"],
  ])("labels %j as %j", (gateway, label) => {
    expect(paymentTypeExportLabel(gateway)).toBe(label);
  });
});
