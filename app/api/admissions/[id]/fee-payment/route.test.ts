/**
 * @jest-environment node
 */
import { POST } from "@/app/api/admissions/[id]/fee-payment/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockGetServerSession = jest.fn();
const mockGetSessionSchoolId = jest.fn();
const mockAssertCanManageAdmissions = jest.fn();
const mockApplicationFindFirst = jest.fn();
const mockApplicationUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/app/api/admissions/_utils", () => ({
  getSessionSchoolId: (...args: unknown[]) => mockGetSessionSchoolId(...args),
  assertCanManageAdmissions: (...args: unknown[]) => mockAssertCanManageAdmissions(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    studentApplication: {
      findFirst: (...args: unknown[]) => mockApplicationFindFirst(...args),
      update: (...args: unknown[]) => mockApplicationUpdate(...args),
    },
  },
}));

const ctx = { params: Promise.resolve({ id: "app1" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/admissions/app1/fee-payment", {
    method: "POST",
    body: JSON.stringify(body),
  });

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

const admissionRow = {
  id: "app1",
  applicationFee: 500,
  admissionFee: 2000,
  applicationFeePaid: false,
  admissionFeePaid: false,
};

describe("POST /api/admissions/[id]/fee-payment", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetSessionSchoolId.mockReset();
    mockAssertCanManageAdmissions.mockReset();
    mockApplicationFindFirst.mockReset();
    mockApplicationUpdate.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller cannot manage admissions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    mockAssertCanManageAdmissions.mockImplementation(() => {
      const err = new Error("You do not have permission to manage admissions") as Error & {
        statusCode?: number;
      };
      err.statusCode = 403;
      throw err;
    });
    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue(null);
    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid feeType", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    const res = await POST(request({ feeType: "OTHER" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unsupported paymentMethod", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    const res = await POST(request({ feeType: "APPLICATION", paymentMethod: "CRYPTO" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when UPI/Bank Transfer is chosen without a reference number", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    const res = await POST(request({ feeType: "APPLICATION", paymentMethod: "UPI" }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/reference number/i);
  });

  it("returns 404 when the admission is not found in the school", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue(null);
    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the application fee amount is not set", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue({ ...admissionRow, applicationFee: 0 });
    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/application fee amount is not set/i);
  });

  it("returns 400 when the application fee is already paid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue({ ...admissionRow, applicationFeePaid: true });
    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/already paid/i);
  });

  it("marks the application fee paid with a plain payment method when there is no reference or remarks", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue(admissionRow);
    mockApplicationUpdate.mockResolvedValue({ id: "app1", applicationFeePaid: true });

    const res = await POST(request({ feeType: "APPLICATION" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/application fee marked as paid/i);
    expect(mockApplicationUpdate).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: expect.objectContaining({
        applicationFeePaid: true,
        applicationFeePaymentMode: "OFFLINE",
        applicationFeePaymentMethod: "CASH",
      }),
      select: expect.anything(),
    });
  });

  it("includes the reference number and remarks in the stored payment method string", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue(admissionRow);
    mockApplicationUpdate.mockResolvedValue({ id: "app1", applicationFeePaid: true });

    const res = await POST(
      request({
        feeType: "APPLICATION",
        paymentMethod: "UPI",
        referenceNo: "UTR123",
        remarks: "Paid at counter",
      }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mockApplicationUpdate).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: expect.objectContaining({
        applicationFeePaymentMethod: "UPI | REF:UTR123 | REMARKS:Paid at counter",
      }),
      select: expect.anything(),
    });
  });

  it("returns 400 when the admission fee amount is not set", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue({ ...admissionRow, admissionFee: 0 });
    const res = await POST(request({ feeType: "ADMISSION" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the admission fee is already paid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue({ ...admissionRow, admissionFeePaid: true });
    const res = await POST(request({ feeType: "ADMISSION" }), ctx);
    expect(res.status).toBe(400);
  });

  it("marks the admission fee paid", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindFirst.mockResolvedValue(admissionRow);
    mockApplicationUpdate.mockResolvedValue({ id: "app1", admissionFeePaid: true });

    const res = await POST(request({ feeType: "ADMISSION" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toMatch(/admission fee marked as paid/i);
    expect(mockApplicationUpdate).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: expect.objectContaining({ admissionFeePaid: true }),
      select: expect.anything(),
    });
  });
});
