/**
 * @jest-environment node
 */
import { GET } from "@/app/api/payment/receipt/route";

const mockGetServerSession = jest.fn();
const mockPaymentFindFirst = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payment: { findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args) },
  },
}));

const request = (query = "") => new Request(`http://localhost/api/payment/receipt${query}`);

const studentSession = { user: { id: "u1", role: "STUDENT", studentId: "stu1" } };

const paymentRow = {
  id: "pay1",
  transactionId: "order1",
  hyperpgTxnId: "txn1",
  amount: 500,
  status: "SUCCESS",
  gateway: "HYPERPG",
  hyperpgStatus: "CHARGED",
  hyperpgStatusId: 21,
  hyperpgRefunded: false,
  hyperpgAmountRefunded: 0,
  createdAt: new Date("2024-01-01"),
  student: {
    id: "stu1",
    admissionNumber: "A1",
    fatherName: "Father One",
    user: { name: "Student One", email: "s1@example.com" },
    class: { name: "5", section: "A" },
    school: { name: "Test School" },
  },
};

describe("GET /api/payment/receipt", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockPaymentFindFirst.mockReset();
  });

  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(request("?order_id=order1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-student session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
    const res = await GET(request("?order_id=order1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when order_id is missing", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns 404 when no matching payment exists for the student", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await GET(request("?order_id=order1"));
    expect(res.status).toBe(404);
  });

  it("returns the mapped receipt, scoped to the caller's studentId and matching by transactionId or hyperpgOrderId", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockPaymentFindFirst.mockResolvedValue(paymentRow);

    const res = await GET(request("?order_id=order1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.receipt).toMatchObject({
      paymentId: "pay1",
      orderId: "order1",
      transactionId: "txn1",
      amount: 500,
      currency: "INR",
      status: "SUCCESS",
      student: {
        name: "Student One",
        admissionNumber: "A1",
        class: "5 - A",
        school: "Test School",
      },
    });

    expect(mockPaymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "stu1",
          OR: [{ transactionId: "order1" }, { hyperpgOrderId: "order1" }],
        },
      })
    );
  });

  it("falls back to the father's name and the payment id when other identifiers are missing", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockPaymentFindFirst.mockResolvedValue({
      ...paymentRow,
      transactionId: null,
      hyperpgTxnId: null,
      student: { ...paymentRow.student, user: null },
    });

    const res = await GET(request("?order_id=order1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.receipt.transactionId).toBe("pay1");
    expect(json.receipt.orderId).toBe("order1");
    expect(json.receipt.student.name).toBe("Father One");
  });

  it("returns 500 when the database lookup throws", async () => {
    mockGetServerSession.mockResolvedValue(studentSession);
    mockPaymentFindFirst.mockRejectedValue(new Error("DB exploded"));
    const res = await GET(request("?order_id=order1"));
    expect(res.status).toBe(500);
  });
});
