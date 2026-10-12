/**
 * @jest-environment node
 */
import { GET } from "@/app/api/admissions/admission-fee-report/route";

const mockGetServerSession = jest.fn();
const mockGetSessionSchoolId = jest.fn();
const mockAssertCanManageAdmissions = jest.fn();
const mockApplicationFindMany = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/app/api/admissions/_utils", () => ({
  getSessionSchoolId: (...args: unknown[]) => mockGetSessionSchoolId(...args),
  assertCanManageAdmissions: (...args: unknown[]) => mockAssertCanManageAdmissions(...args),
}));

const mockWithTenantScopedClient = jest.fn(
  async (_schoolId: string, fn: (tx: unknown) => unknown) =>
    fn({
      studentApplication: { findMany: (...args: unknown[]) => mockApplicationFindMany(...args) },
    })
);

jest.mock("@/lib/db/tenantClient", () => ({
  withTenantScopedClient: (...args: Parameters<typeof mockWithTenantScopedClient>) =>
    mockWithTenantScopedClient(...args),
}));

const request = (query = "") => new Request(`http://localhost/api/admissions/admission-fee-report${query}`);

const adminSession = { user: { id: "u1", role: "SCHOOLADMIN", schoolId: "s1" } };

describe("GET /api/admissions/admission-fee-report", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetSessionSchoolId.mockReset();
    mockAssertCanManageAdmissions.mockReset();
    mockApplicationFindMany.mockReset().mockResolvedValue([]);
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller cannot manage admissions", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "STUDENT" } });
    mockAssertCanManageAdmissions.mockImplementation(() => {
      const err = new Error("forbidden") as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    });
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  it("returns 400 when schoolId cannot be resolved", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue(null);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is after to", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    const res = await GET(request("?from=2024-02-01&to=2024-01-01"));
    expect(res.status).toBe(400);
  });

  it("defaults to a 90-day window ending today when no dates are given", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    expect(json.to).toBe(today);
  });

  it("maps applications, computes day/month rollups, totals, and channel splits", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindMany.mockResolvedValue([
      {
        id: "app1",
        applicationNo: "APP1",
        firstName: "Jane",
        middleName: null,
        lastName: "Doe",
        admissionFee: 2000,
        admissionFeePaidAt: new Date("2024-01-15T10:00:00.000Z"),
        admissionFeePaymentMode: "OFFLINE",
        admissionFeePaymentMethod: "CASH",
        class: { name: "5", section: "A" },
        gradeSought: null,
      },
      {
        id: "app2",
        applicationNo: "APP2",
        firstName: "John",
        middleName: null,
        lastName: "Smith",
        admissionFee: 1500,
        admissionFeePaidAt: new Date("2024-01-15T12:00:00.000Z"),
        admissionFeePaymentMode: "OFFLINE",
        admissionFeePaymentMethod: "UPI | REF:UTR1",
        class: null,
        gradeSought: "Grade 3",
      },
    ]);

    const res = await GET(request("?from=2024-01-01&to=2024-01-31"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.applications).toHaveLength(2);
    expect(json.applications[0]).toMatchObject({
      id: "app1",
      applicantName: "Jane Doe",
      classOrGrade: "5-A",
      admissionFee: 2000,
    });
    expect(json.applications[1].classOrGrade).toBe("Grade 3");

    expect(json.byDay).toEqual([{ period: "2024-01-15", count: 2, amount: 3500 }]);
    expect(json.byMonth).toEqual([{ period: "2024-01", count: 2, amount: 3500 }]);
    expect(json.totals).toEqual({ count: 2, amount: 3500 });

    expect(json.totalsByChannel.cash.amount).toBe(2000);
    expect(json.totalsByChannel.online.amount).toBe(1500);
  });

  it("falls back to '—' when the applicant has no name at all", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindMany.mockResolvedValue([
      {
        id: "app1",
        applicationNo: "APP1",
        firstName: null,
        middleName: null,
        lastName: null,
        admissionFee: 500,
        admissionFeePaidAt: new Date("2024-01-15T10:00:00.000Z"),
        admissionFeePaymentMode: null,
        admissionFeePaymentMethod: null,
        class: null,
        gradeSought: null,
      },
    ]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.applications[0].applicantName).toBe("—");
    expect(json.applications[0].classOrGrade).toBe("—");
  });

  it("returns 500 when the database query throws", async () => {
    mockGetServerSession.mockResolvedValue(adminSession);
    mockGetSessionSchoolId.mockResolvedValue("s1");
    mockApplicationFindMany.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
