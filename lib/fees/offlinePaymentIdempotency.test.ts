import type { Payment } from "@prisma/client";
import { findExistingOfflinePaymentByRef, resolveOfflinePaymentTransactionId } from "./offlinePaymentIdempotency";

describe("resolveOfflinePaymentTransactionId", () => {
  it("prefers the trimmed transactionId over refNo", () => {
    expect(resolveOfflinePaymentTransactionId("  TXN1 ", "REF1")).toBe("TXN1");
  });

  it("falls back to refNo when transactionId is blank or missing", () => {
    expect(resolveOfflinePaymentTransactionId("   ", " REF1 ")).toBe("REF1");
    expect(resolveOfflinePaymentTransactionId(null, "REF1")).toBe("REF1");
  });

  it("returns null when neither is provided", () => {
    expect(resolveOfflinePaymentTransactionId()).toBeNull();
    expect(resolveOfflinePaymentTransactionId("", "  ")).toBeNull();
  });
});

describe("findExistingOfflinePaymentByRef", () => {
  const pay = (id: string, gateway: string) => ({ id, gateway }) as unknown as Payment;

  it("skips the query entirely without a reference", async () => {
    const findMany = jest.fn();
    expect(await findExistingOfflinePaymentByRef({ payment: { findMany } }, "s1", null)).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("looks up successful payments for that student and reference", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await findExistingOfflinePaymentByRef({ payment: { findMany } }, "s1", "UTR9");
    expect(findMany).toHaveBeenCalledWith({
      where: { studentId: "s1", transactionId: "UTR9", status: { in: ["SUCCESS", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
  });

  it("returns the first offline match and ignores online gateway rows", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([pay("online", "HYPERPG"), pay("off1", "OFFLINE_UPI"), pay("off2", "OFFLINE_CASH")]);
    const found = await findExistingOfflinePaymentByRef({ payment: { findMany } }, "s1", "UTR9");
    expect(found?.id).toBe("off1");
  });

  it("returns null when only online payments share the reference", async () => {
    const findMany = jest.fn().mockResolvedValue([pay("online", "HYPERPG")]);
    expect(await findExistingOfflinePaymentByRef({ payment: { findMany } }, "s1", "UTR9")).toBeNull();
  });
});
