/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/fees/petty-cash/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockResolveFeesSchoolId = jest.fn();
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();

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
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// GET's list read now goes through the app_tenant-connected, RLS-restricted
// client (docs/SECURITY_REVIEW.md) instead of the app's normal prisma import.
// POST's create (with its voucher-number retry logic) is unchanged.
const mockWithTenantScopedClient = jest.fn(async (_schoolId: string, fn: (tx: unknown) => unknown) =>
  fn({ pettyCashExpense: { findMany: (...args: unknown[]) => mockFindMany(...args) } })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const postRequest = (body: unknown) =>
  new Request("http://localhost/api/fees/petty-cash", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const validBody = {
  itemName: "Stationery",
  headOfAccount: "Office Supplies",
  paymentType: "CASH",
  amount: 250,
  expenseDate: "2024-01-15",
  description: "Pens and paper",
};

describe("GET /api/fees/petty-cash", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockCreate.mockReset();
    mockWithTenantScopedClient.mockClear();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns the school's petty cash expenses ordered by date/voucher", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindMany.mockResolvedValue([{ id: "e1", voucherNo: 3, amount: 100 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expenses).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { schoolId: "s1" },
      orderBy: [{ expenseDate: "desc" }, { voucherNo: "desc" }],
    });
  });
});

describe("POST /api/fees/petty-cash", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockResolveFeesSchoolId.mockReset();
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockCreate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller cannot manage fees", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(403);
  });

  it("returns 400 when headOfAccount is missing", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(postRequest({ ...validBody, headOfAccount: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid payment type", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(postRequest({ ...validBody, paymentType: "UPI" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/cash or online/i);
  });

  it("returns 400 for a non-positive amount", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(postRequest({ ...validBody, amount: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid expense date", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(postRequest({ ...validBody, expenseDate: "not-a-date" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/invalid expense date/i);
  });

  it("returns 400 when the description is too long", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    const res = await POST(postRequest({ ...validBody, description: "x".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("auto-assigns the next voucher number and creates the expense", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue({ voucherNo: 5 });
    mockCreate.mockResolvedValue({ id: "e1", voucherNo: 6, amount: 250 });

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.expense.voucherNo).toBe(6);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "s1",
          voucherNo: 6,
          itemName: "Stationery",
          headOfAccount: "Office Supplies",
          paymentType: "CASH",
          amount: 250,
        }),
      })
    );
  });

  it("starts voucher numbering at 1 when no expenses exist yet", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "e1", voucherNo: 1, amount: 250 });

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ voucherNo: 1 }) })
    );
  });

  it("retries voucher assignment on a unique-constraint clash and succeeds", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue({ voucherNo: 5 });
    mockCreate
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce({ id: "e1", voucherNo: 6, amount: 250 });

    const res = await POST(postRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("defaults itemName to headOfAccount when itemName is blank", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockResolveFeesSchoolId.mockResolvedValue("s1");
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "e1", voucherNo: 1, amount: 250 });

    const res = await POST(postRequest({ ...validBody, itemName: "" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemName: "Office Supplies" }),
      })
    );
  });
});
