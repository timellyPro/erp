/**
 * @jest-environment node
 */
import { ensureReceiptNo, formatReceiptNo, parseReceiptNo } from "@/lib/fees/receiptNumber";

describe("formatReceiptNo / parseReceiptNo", () => {
  it("formats and round-trips", () => {
    expect(formatReceiptNo(123)).toBe("R-000123");
    expect(formatReceiptNo(null)).toBe("-");
    expect(formatReceiptNo(0)).toBe("-");
    expect(parseReceiptNo("R-000123")).toBe(123);
    expect(parseReceiptNo("r123")).toBe(123);
    expect(parseReceiptNo(" 45 ")).toBe(45);
  });
  it("rejects things that are not receipt numbers", () => {
    expect(parseReceiptNo("0")).toBeNull();
    expect(parseReceiptNo("Ravi")).toBeNull();
    expect(parseReceiptNo("TML12345")).toBeNull();
    expect(parseReceiptNo("99999999999")).toBeNull();
  });
});

function makeDb(payment: Record<string, unknown> | null, counter = 7) {
  const state = { payment: payment ? { ...payment } : null, counter };
  return {
    state,
    $queryRaw: jest.fn(async () => [{ lastNo: ++state.counter }]),
    payment: {
      findUnique: jest.fn(async () => (state.payment ? { ...state.payment } : null)),
      updateMany: jest.fn(async ({ data }: { data: { receiptNo: number } }) => {
        if (!state.payment || state.payment.receiptNo != null) return { count: 0 };
        state.payment.receiptNo = data.receiptNo;
        return { count: 1 };
      }),
    },
  };
}

const ok = { receiptNo: null, status: "SUCCESS", purpose: "FEES", eventRegistrationId: null };

describe("ensureReceiptNo", () => {
  it("numbers a successful fee payment from the school counter", async () => {
    const db = makeDb(ok);
    expect(await ensureReceiptNo(db, "s1", "p1")).toBe(8);
    expect(db.state.payment?.receiptNo).toBe(8);
  });
  it("keeps an existing number and does not touch the counter", async () => {
    const db = makeDb({ ...ok, receiptNo: 3 });
    expect(await ensureReceiptNo(db, "s1", "p1")).toBe(3);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("is idempotent when called twice", async () => {
    const db = makeDb(ok);
    const a = await ensureReceiptNo(db, "s1", "p1");
    const b = await ensureReceiptNo(db, "s1", "p1");
    expect(a).toBe(b);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["pending", { ...ok, status: "PENDING" }],
    ["failed", { ...ok, status: "FAILED" }],
    ["not a fee payment", { ...ok, purpose: "EVENT" }],
    ["an event registration", { ...ok, eventRegistrationId: "e1" }],
  ])("does not number %s", async (_n, row) => {
    const db = makeDb(row);
    expect(await ensureReceiptNo(db, "s1", "p1")).toBeNull();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("returns null for a missing payment", async () => {
    expect(await ensureReceiptNo(makeDb(null), "s1", "nope")).toBeNull();
  });
  it("never hands out the same number twice when another request numbered it first", async () => {
    const db = makeDb(ok);
    db.payment.updateMany.mockImplementationOnce(async () => {
      db.state.payment!.receiptNo = 99; // the other request won
      return { count: 0 };
    });
    expect(await ensureReceiptNo(db, "s1", "p1")).toBe(99);
  });
});
