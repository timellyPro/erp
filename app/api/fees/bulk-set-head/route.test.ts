/**
 * @jest-environment node
 */
import { POST, GET } from "@/app/api/fees/bulk-set-head/route";
import { BulkEditConflictError } from "@/lib/fees/bulkSetFeeHead";

jest.mock("@/lib/db/tenantContext", () => ({
  runInTenantScope: (schoolId: string, fn: (id: string) => unknown) => fn(schoolId),
  tenantDb: { feeBulkEdit: { findMany: jest.fn().mockResolvedValue([{ id: "b1" }]) } },
}));

const mockSession = jest.fn();
const mockPlan = jest.fn();
const mockApply = jest.fn();

jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => mockSession(...a) }));
jest.mock("@/lib/auth/authOptions", () => ({}));
jest.mock("@/lib/fees/resolveFeesSchoolId", () => ({ resolveFeesSchoolId: jest.fn().mockResolvedValue("s1") }));
jest.mock("@/lib/fees/bulkSetFeeHead", () => ({
  ...jest.requireActual("@/lib/fees/bulkSetFeeHead"),
  planBulkSetFeeHead: (...a: unknown[]) => mockPlan(...a),
  applyBulkSetFeeHead: (...a: unknown[]) => mockApply(...a),
}));

const admin = { user: { id: "u1", name: "Admin", role: "SCHOOLADMIN", schoolId: "s1" } };
const post = (body: unknown) =>
  new Request("http://localhost/api/fees/bulk-set-head", { method: "POST", body: JSON.stringify(body) });
const valid = { mode: "preview", headName: "Hostel Fee", amount: 71500, studentIds: ["a", "b"] };

describe("/api/fees/bulk-set-head", () => {
  beforeEach(() => {
    mockSession.mockReset().mockResolvedValue(admin);
    mockPlan.mockReset().mockResolvedValue({ willChange: 2 });
    mockApply.mockReset().mockResolvedValue({ batchId: "b1", changed: 2, skipped: 0, totalDelta: 143000 });
  });

  it("401 without a session, 403 for a teacher", async () => {
    mockSession.mockResolvedValueOnce(null);
    expect((await POST(post(valid)))!.status).toBe(401);
    mockSession.mockResolvedValueOnce({ user: { id: "t1", role: "TEACHER" } });
    expect((await POST(post(valid)))!.status).toBe(403);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("400 for a bad body or invalid values", async () => {
    expect((await POST(post({ nope: true })))!.status).toBe(400);
    expect((await POST(post({ ...valid, amount: -5 })))!.status).toBe(400);
    expect((await POST(post({ ...valid, studentIds: [] })))!.status).toBe(400);
  });

  it("previews without changing anything", async () => {
    const res = (await POST(post(valid)))!;
    expect(res.status).toBe(200);
    expect((await res.json()).plan.willChange).toBe(2);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("will not apply without the confirmed count from a preview", async () => {
    const res = (await POST(post({ ...valid, mode: "apply" })))!;
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("applies with the confirmed count and records who did it", async () => {
    const res = (await POST(post({ ...valid, mode: "apply", confirmCount: 2 })))!;
    expect(res.status).toBe(201);
    expect(mockApply).toHaveBeenCalledWith("s1", expect.objectContaining({ confirmCount: 2, actor: expect.objectContaining({ userId: "u1", role: "SCHOOLADMIN" }) }));
  });

  it("409 when the preview is out of date", async () => {
    mockApply.mockRejectedValueOnce(new BulkEditConflictError("Preview again."));
    const res = (await POST(post({ ...valid, mode: "apply", confirmCount: 3 })))!;
    expect(res.status).toBe(409);
  });

  it("lists recent edits for admins only", async () => {
    expect((await GET())!.status).toBe(200);
    mockSession.mockResolvedValueOnce({ user: { id: "t1", role: "TEACHER" } });
    expect((await GET())!.status).toBe(403);
  });
});
