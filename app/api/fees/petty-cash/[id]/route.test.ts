/**
 * @jest-environment node
 */
import { PATCH, DELETE } from "@/app/api/fees/petty-cash/[id]/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({
  resolveFeesSchoolId: (...args: unknown[]) => mockResolveFeesSchoolId(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    pettyCashExpense: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

const ctx = { params: Promise.resolve({ id: "e1" }) };

const patchRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/petty-cash/e1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
const deleteRequest = () => new Request("http://localhost/api/fees/petty-cash/e1", { method: "DELETE" });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const existingExpense = {
  id: "e1",
  schoolId: "s1",
  itemName: "Stationery",
  headOfAccount: "Office Supplies",
  paymentType: "CASH",
  amount: 250,
  expenseDate: new Date("2024-01-15"),
  description: "Pens",
  voucherNo: 3,
};

describe("PATCH /api/fees/petty-cash/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 300 }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await PATCH(patchRequest({ amount: 300 }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 300 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the expense does not belong to the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ amount: 300 }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 for an empty itemName", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({ itemName: "" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid paymentType", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({ paymentType: "UPI" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive amount", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({ amount: 0 }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty expenseDate", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({ expenseDate: "" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid expenseDate", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({ expenseDate: "not-a-date" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the description exceeds 500 characters", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({ description: "x".repeat(501) }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns the existing expense unchanged when the body has no editable fields", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    const res = await PATCH(patchRequest({}), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expense.id).toBe("e1");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates only the provided fields", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    mockUpdate.mockResolvedValue({ ...existingExpense, amount: 400 });

    const res = await PATCH(patchRequest({ amount: 400 }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expense.amount).toBe(400);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "e1" }, data: { amount: 400 } });
  });

  it("defaults itemName to headOfAccount's fallback when headOfAccount changes without an explicit itemName", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue({ ...existingExpense, itemName: "" });
    mockUpdate.mockResolvedValue({ ...existingExpense, headOfAccount: "New Head" });

    const res = await PATCH(patchRequest({ headOfAccount: "New Head" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { headOfAccount: "New Head", itemName: "New Head" },
    });
  });

  it("clears the description when an empty string is sent", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(existingExpense);
    mockUpdate.mockResolvedValue({ ...existingExpense, description: null });

    const res = await PATCH(patchRequest({ description: "" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "e1" }, data: { description: null } });
  });
});

describe("DELETE /api/fees/petty-cash/[id]", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockFindFirst.mockReset();
    mockDelete.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a role that cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the expense does not belong to the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes the expense", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue({ id: "e1" });
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});
