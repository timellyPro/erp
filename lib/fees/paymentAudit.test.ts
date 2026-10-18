import {
  auditActorFromSession,
  describePaymentChange,
  paymentAuditSnapshot,
  recordPaymentAudit,
} from "@/lib/fees/paymentAudit";

describe("auditActorFromSession", () => {
  it("uses the user's name, id and role", () => {
    expect(
      auditActorFromSession({ user: { id: "u1", name: " Asha ", email: "a@x.com", role: "SCHOOLADMIN" } })
    ).toEqual({ userId: "u1", name: "Asha", role: "SCHOOLADMIN" });
  });

  it("falls back to the email, then to null", () => {
    expect(auditActorFromSession({ user: { id: "u1", name: "", email: "a@x.com" } }).name).toBe("a@x.com");
    expect(auditActorFromSession(null)).toEqual({ userId: null, name: null, role: null });
  });
});

describe("paymentAuditSnapshot", () => {
  const payment = {
    id: "p1",
    studentId: "s1",
    amount: 1500,
    status: "SUCCESS",
    gateway: "OFFLINE_CASH",
    transactionId: "UTR1",
    createdAt: new Date("2026-10-07T12:00:00.000Z"),
    collectedByName: "Front desk",
    // extra fields a Prisma row carries must never leak into the log
    purpose: "FEES",
    clientRequestId: "secret-key",
  } as Parameters<typeof paymentAuditSnapshot>[0];

  it("keeps only ids, amounts and references", () => {
    const snap = paymentAuditSnapshot(payment) as Record<string, unknown>;
    expect(snap).toEqual({
      id: "p1",
      receiptNo: null,
      studentId: "s1",
      amount: 1500,
      status: "SUCCESS",
      gateway: "OFFLINE_CASH",
      transactionId: "UTR1",
      createdAt: "2026-10-07T12:00:00.000Z",
      collectedByName: "Front desk",
    });
    expect(JSON.stringify(snap)).not.toContain("secret-key");
  });

  it("includes allocations with a count, capped at 50 rows", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ allocatedAmount: i, componentName: `H${i}` }));
    const snap = paymentAuditSnapshot(payment, many) as { allocations: unknown[]; allocationCount: number };
    expect(snap.allocations).toHaveLength(50);
    expect(snap.allocationCount).toBe(60);
  });
});

describe("describePaymentChange", () => {
  const base = {
    amount: 5000,
    transactionId: "A",
    gateway: "OFFLINE_CASH",
    createdAt: new Date("2026-10-01T12:00:00Z"),
  };

  it("lists every changed field", () => {
    const text = describePaymentChange(base, {
      amount: 4500,
      transactionId: "B",
      gateway: "OFFLINE_UPI",
      createdAt: new Date("2026-10-02T12:00:00Z"),
    });
    expect(text).toBe(
      "Amount 5000 -> 4500; Reference A -> B; Mode OFFLINE_CASH -> OFFLINE_UPI; Date 2026-10-01 -> 2026-10-02"
    );
  });

  it("returns null when nothing changed", () => {
    expect(describePaymentChange(base, { ...base })).toBeNull();
  });

  it("ignores sub-paisa float noise in the amount", () => {
    expect(describePaymentChange(base, { ...base, amount: 5000.000001 })).toBeNull();
  });
});

describe("recordPaymentAudit", () => {
  it("writes one row with the actor and snapshots", async () => {
    const create = jest.fn().mockResolvedValue({});
    await recordPaymentAudit(
      { paymentAuditLog: { create } },
      {
        schoolId: "sc1",
        paymentId: "p1",
        studentId: "s1",
        action: "DELETE",
        actor: { userId: "u1", name: "Asha", role: "SCHOOLADMIN" },
        summary: "x".repeat(900),
        before: { amount: 10 },
      }
    );
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      schoolId: "sc1",
      paymentId: "p1",
      studentId: "s1",
      action: "DELETE",
      actorUserId: "u1",
      actorName: "Asha",
      actorRole: "SCHOOLADMIN",
      before: { amount: 10 },
    });
    expect(data.summary).toHaveLength(500);
    expect("after" in data).toBe(false);
  });

  it("lets a failing write propagate so the surrounding transaction rolls back", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    await expect(
      recordPaymentAudit(
        { paymentAuditLog: { create } },
        { schoolId: "s", paymentId: "p", studentId: "t", action: "CREATE" }
      )
    ).rejects.toThrow("db down");
  });
});
