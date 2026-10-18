/**
 * @jest-environment node
 */
import { POST } from "@/app/api/payment/webhook/route";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  runInOptionalTenantScope: (_schoolId: unknown, fn: () => unknown) => fn(),
  tenantDb: new Proxy({}, { get: (_t, p) => (jest.requireMock("@/lib/db").default as Record<string | symbol, unknown>)[p] }),
}));

const mockWebhookEventCreate = jest.fn();
const mockWebhookEventFindUnique = jest.fn();
const mockWebhookEventUpdate = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    paymentWebhookEvent: {
      create: (...args: unknown[]) => mockWebhookEventCreate(...args),
      findUnique: (...args: unknown[]) => mockWebhookEventFindUnique(...args),
      update: (...args: unknown[]) => mockWebhookEventUpdate(...args),
    },
    payment: { findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/payment/webhook", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const basicAuthHeader = (user: string, pass: string) => ({
  authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
});

/** Every non-auth-focused test needs valid credentials now that auth is mandatory. */
const authedRequest = (body: unknown, headers: Record<string, string> = {}) =>
  request(body, { ...basicAuthHeader("whuser", "whpass"), ...headers });

/** What Prisma throws when the event id already exists. */
const uniqueViolation = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

const chargedEvent = {
  id: "evt1",
  event_name: "ORDER_SUCCEEDED",
  content: {
    order: {
      order_id: "order1",
      id: "hp1",
      status: "CHARGED",
      status_id: 21,
      txn_id: "txn1",
    },
  },
};

describe("POST /api/payment/webhook", () => {
  beforeEach(() => {
    mockWebhookEventCreate.mockReset().mockResolvedValue({});
    mockWebhookEventFindUnique.mockReset().mockResolvedValue(null);
    mockWebhookEventUpdate.mockReset().mockResolvedValue({});
    mockPaymentFindFirst.mockReset();
    mockTransaction.mockReset();
    process.env.HYPERPG_WEBHOOK_USERNAME = "whuser";
    process.env.HYPERPG_WEBHOOK_PASSWORD = "whpass";
    delete process.env.HYPERPG_WEBHOOK_HEADER_NAME;
    delete process.env.HYPERPG_WEBHOOK_HEADER_VALUE;
  });

  it("returns 401 when webhook credentials are not configured (fails closed, not open)", async () => {
    delete process.env.HYPERPG_WEBHOOK_USERNAME;
    delete process.env.HYPERPG_WEBHOOK_PASSWORD;
    const res = await POST(request(chargedEvent, basicAuthHeader("whuser", "whpass")));
    expect(res.status).toBe(401);
    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it("returns 401 when only the username env var is configured", async () => {
    delete process.env.HYPERPG_WEBHOOK_PASSWORD;
    const res = await POST(request(chargedEvent, basicAuthHeader("whuser", "whpass")));
    expect(res.status).toBe(401);
  });

  it("returns 401 when credentials are configured but no Authorization header is sent", async () => {
    const res = await POST(request(chargedEvent));
    expect(res.status).toBe(401);
  });

  it("returns 401 for incorrect Basic Auth credentials", async () => {
    const res = await POST(request(chargedEvent, basicAuthHeader("whuser", "wrong")));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the configured extra header is missing", async () => {
    process.env.HYPERPG_WEBHOOK_HEADER_NAME = "x-webhook-secret";
    process.env.HYPERPG_WEBHOOK_HEADER_VALUE = "secret123";
    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid JSON body", async () => {
    const res = await POST(authedRequest("not json"));
    expect(res.status).toBe(400);
  });

  it("acks with ignored=true when the event has no id", async () => {
    const res = await POST(authedRequest({ event_name: "x" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, ignored: true, reason: "Missing event id" });
    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it("acks with duplicate=true when the event id was already stored AND processed", async () => {
    mockWebhookEventCreate.mockRejectedValue(uniqueViolation());
    mockWebhookEventFindUnique.mockResolvedValue({ processedAt: new Date() });
    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, duplicate: true });
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
  });

  it("acks without updating when there are no order identifiers", async () => {
    const res = await POST(
      authedRequest({ id: "evt2", event_name: "x", content: { order: { status: "CHARGED" } } })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, stored: true, updated: false, reason: "No order identifiers" });
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
  });

  it("acks without updating when no matching payment is found", async () => {
    mockPaymentFindFirst.mockResolvedValue(null);
    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, stored: true, updated: false, reason: "Payment not found" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("transitions a fee payment to SUCCESS and increments the student's fee on a CHARGED event", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay1",
      studentId: "stu1",
      student: { schoolId: "s1" },
      status: "PENDING",
      amount: 500,
      eventRegistrationId: null,
    });
    const tx = {
      paymentAuditLog: { create: jest.fn().mockResolvedValue({}) },
      payment: {
        findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }),
        update: jest.fn().mockResolvedValue({}),
      },
      studentFee: {
        findUnique: jest.fn().mockResolvedValue({ amountPaid: 0, finalFee: 1000 }),
        update: jest.fn().mockResolvedValue({}),
      },
      eventRegistration: { update: jest.fn() },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, stored: true, updated: true });

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pay1" }, data: expect.objectContaining({ status: "SUCCESS" }) })
    );
    expect(tx.studentFee.update).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 500, remainingFee: 500 },
    });
    expect(tx.eventRegistration.update).not.toHaveBeenCalled();
  });

  it("marks an event-registration payment PAID instead of touching studentFee", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay1",
      studentId: "stu1",
      student: { schoolId: "s1" },
      status: "PENDING",
      amount: 500,
      eventRegistrationId: "reg1",
    });
    const tx = {
      paymentAuditLog: { create: jest.fn().mockResolvedValue({}) },
      payment: { findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }), update: jest.fn() },
      studentFee: { findUnique: jest.fn(), update: jest.fn() },
      eventRegistration: { update: jest.fn().mockResolvedValue({}) },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    await POST(authedRequest(chargedEvent));
    expect(tx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: { paymentStatus: "PAID", paymentId: "pay1" },
    });
    expect(tx.studentFee.update).not.toHaveBeenCalled();
  });

  it("marks an event-registration payment FAILED on a failure status transition", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay1",
      studentId: "stu1",
      student: { schoolId: "s1" },
      status: "PENDING",
      amount: 500,
      eventRegistrationId: "reg1",
    });
    const tx = {
      paymentAuditLog: { create: jest.fn().mockResolvedValue({}) },
      payment: { findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }), update: jest.fn() },
      studentFee: { findUnique: jest.fn(), update: jest.fn() },
      eventRegistration: { update: jest.fn().mockResolvedValue({}) },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    const failedEvent = {
      id: "evt3",
      event_name: "ORDER_FAILED",
      content: { order: { order_id: "order1", status: "AUTHORIZATION_FAILED" } },
    };
    await POST(authedRequest(failedEvent));
    expect(tx.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: { paymentStatus: "FAILED" },
    });
  });

  it("does not re-apply the success side-effect when the payment is already SUCCESS", async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: "pay1",
      studentId: "stu1",
      student: { schoolId: "s1" },
      status: "SUCCESS",
      amount: 500,
      eventRegistrationId: null,
    });
    const tx = {
      paymentAuditLog: { create: jest.fn().mockResolvedValue({}) },
      payment: { findUnique: jest.fn().mockResolvedValue({ status: "SUCCESS" }), update: jest.fn() },
      studentFee: { findUnique: jest.fn(), update: jest.fn() },
      eventRegistration: { update: jest.fn() },
    };
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

    await POST(authedRequest(chargedEvent));
    expect(tx.studentFee.update).not.toHaveBeenCalled();
  });

  it("succeeds with correct Basic Auth and extra header when both are configured", async () => {
    process.env.HYPERPG_WEBHOOK_HEADER_NAME = "x-webhook-secret";
    process.env.HYPERPG_WEBHOOK_HEADER_VALUE = "secret123";
    mockPaymentFindFirst.mockResolvedValue(null);

    const res = await POST(
      authedRequest(chargedEvent, {
        "x-webhook-secret": "secret123",
      })
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/payment/webhook retry safety and audit", () => {
  const pendingPayment = {
    id: "pay1",
    studentId: "stu1",
    student: { schoolId: "s1" },
    status: "PENDING",
    amount: 500,
    eventRegistrationId: null,
  };

  const makeTx = (status = "PENDING") => ({
    paymentAuditLog: { create: jest.fn().mockResolvedValue({}) },
    payment: { findUnique: jest.fn().mockResolvedValue({ status }), update: jest.fn().mockResolvedValue({}) },
    studentFee: {
      findUnique: jest.fn().mockResolvedValue({ amountPaid: 0, finalFee: 1000 }),
      update: jest.fn().mockResolvedValue({}),
    },
    eventRegistration: { update: jest.fn() },
  });

  const withTx = (tx: unknown) =>
    mockTransaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

  beforeEach(() => {
    mockWebhookEventCreate.mockReset().mockResolvedValue({});
    mockWebhookEventFindUnique.mockReset().mockResolvedValue(null);
    mockWebhookEventUpdate.mockReset().mockResolvedValue({});
    mockPaymentFindFirst.mockReset().mockResolvedValue(pendingPayment);
    mockTransaction.mockReset();
    process.env.HYPERPG_WEBHOOK_USERNAME = "whuser";
    process.env.HYPERPG_WEBHOOK_PASSWORD = "whpass";
    delete process.env.HYPERPG_WEBHOOK_HEADER_NAME;
    delete process.env.HYPERPG_WEBHOOK_HEADER_VALUE;
  });

  it("does NOT acknowledge when storing the event fails for a reason other than a duplicate id", async () => {
    mockWebhookEventCreate.mockRejectedValue(new Error("connection refused"));
    const res = await POST(authedRequest(chargedEvent));
    // 5xx makes the gateway retry; a 200 here used to drop the event for good
    expect(res.status).toBe(500);
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
    expect(mockWebhookEventUpdate).not.toHaveBeenCalled();
  });

  it("processes a retried event that was stored but never applied, then marks it processed", async () => {
    mockWebhookEventCreate.mockRejectedValue(uniqueViolation());
    mockWebhookEventFindUnique.mockResolvedValue({ processedAt: null });
    const tx = makeTx();
    withTx(tx);

    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: true, updated: true });
    expect(tx.payment.update).toHaveBeenCalled();
    expect(mockWebhookEventUpdate).toHaveBeenCalledWith({
      where: { id: "evt1" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("returns 500 when it cannot tell whether a duplicate was processed", async () => {
    mockWebhookEventCreate.mockRejectedValue(uniqueViolation());
    mockWebhookEventFindUnique.mockRejectedValue(new Error("db down"));
    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(500);
    expect(mockPaymentFindFirst).not.toHaveBeenCalled();
  });

  it("returns 500 and leaves the event unprocessed when applying it fails, so the retry can apply it", async () => {
    mockTransaction.mockRejectedValue(new Error("deadlock"));
    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(500);
    expect(mockWebhookEventUpdate).not.toHaveBeenCalled();
  });

  it("marks the event processed after a successful update", async () => {
    withTx(makeTx());
    await POST(authedRequest(chargedEvent));
    expect(mockWebhookEventUpdate).toHaveBeenCalledWith({
      where: { id: "evt1" },
      data: { processedAt: expect.any(Date) },
    });
  });

  it("marks an event processed when there is nothing to apply (no identifiers / unknown payment)", async () => {
    await POST(authedRequest({ id: "evt2", event_name: "x", content: { order: { status: "CHARGED" } } }));
    expect(mockWebhookEventUpdate).toHaveBeenCalledTimes(1);

    mockWebhookEventUpdate.mockClear();
    mockPaymentFindFirst.mockResolvedValue(null);
    await POST(authedRequest(chargedEvent));
    expect(mockWebhookEventUpdate).toHaveBeenCalledTimes(1);
  });

  it("still answers 200 when only the processed-marker write fails (the work is already done)", async () => {
    withTx(makeTx());
    mockWebhookEventUpdate.mockRejectedValue(new Error("db blip"));
    const res = await POST(authedRequest(chargedEvent));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: true, updated: true });
  });

  it("writes a STATUS history row, attributed to the gateway, on a real transition", async () => {
    const tx = makeTx("PENDING");
    withTx(tx);
    await POST(authedRequest(chargedEvent));
    expect(tx.paymentAuditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentAuditLog.create.mock.calls[0][0].data).toMatchObject({
      schoolId: "s1",
      paymentId: "pay1",
      studentId: "stu1",
      action: "STATUS",
      actorName: "Payment gateway (HyperPG)",
      actorRole: "SYSTEM",
      summary: "Status PENDING -> SUCCESS (gateway: CHARGED)",
    });
  });

  it("writes no history row when the status did not change", async () => {
    const tx = makeTx("SUCCESS");
    withTx(tx);
    await POST(authedRequest(chargedEvent));
    expect(tx.paymentAuditLog.create).not.toHaveBeenCalled();
  });

  it("holds a payment for review instead of crediting it when the gateway reports a different amount", async () => {
    const tx = makeTx("PENDING");
    withTx(tx);
    const mismatched = {
      ...chargedEvent,
      content: { order: { ...chargedEvent.content.order, amount: 50 } },
    };
    const res = await POST(authedRequest(mismatched));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      stored: true,
      updated: false,
      reason: "Amount mismatch: held for review",
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.studentFee.update).not.toHaveBeenCalled();
    expect(tx.paymentAuditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "ALERT",
      paymentId: "pay1",
    });
    expect(tx.paymentAuditLog.create.mock.calls[0][0].data.summary).toMatch(
      /Gateway reports 50 but this payment is 500/
    );
    // handled (flagged for a human), so do not ask the gateway to retry forever
    expect(mockWebhookEventUpdate).toHaveBeenCalled();
  });

  it("credits normally when the reported amount matches (to the paisa)", async () => {
    const tx = makeTx("PENDING");
    withTx(tx);
    const matching = {
      ...chargedEvent,
      content: { order: { ...chargedEvent.content.order, amount: 500.004 } },
    };
    await POST(authedRequest(matching));
    expect(tx.payment.update).toHaveBeenCalled();
    expect(tx.studentFee.update).toHaveBeenCalledWith({
      where: { studentId: "stu1" },
      data: { amountPaid: 500, remainingFee: 500 },
    });
  });

  it("does not run the amount check for a payment that is not becoming SUCCESS", async () => {
    const tx = makeTx("PENDING");
    withTx(tx);
    const failed = {
      id: "evt9",
      event_name: "ORDER_FAILED",
      content: { order: { order_id: "order1", status: "AUTHORIZATION_FAILED", amount: 1 } },
    };
    await POST(authedRequest(failed));
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });
});
