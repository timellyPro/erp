/**
 * @jest-environment node
 */
import { GET } from "@/app/api/media/route";

const mockGetServerSession = jest.fn();
const mockDownload = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        download: (...args: unknown[]) => mockDownload(...args),
      }),
    },
  },
  SUPABASE_BUCKET: "uploads",
}));

const ORIGINAL_SECRET = process.env.NEXTAUTH_SECRET;
const ORIGINAL_INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

function makeRequest(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/media", () => {
  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockDownload.mockReset();
    process.env.NEXTAUTH_SECRET = "test-secret";
    // getInternalSecret() (lib/internalSecret.ts) prefers INTERNAL_API_SECRET over
    // NEXTAUTH_SECRET. A real INTERNAL_API_SECRET set in the dev .env would otherwise
    // leak in here and shadow the "test-secret" fallback these tests assert against.
    delete process.env.INTERNAL_API_SECRET;
  });

  afterAll(() => {
    process.env.NEXTAUTH_SECRET = ORIGINAL_SECRET;
    process.env.INTERNAL_API_SECRET = ORIGINAL_INTERNAL_SECRET;
  });

  it("rejects anonymous requests with no session and no internal secret", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/media?path=some/file.png");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("rejects a request with a wrong internal secret and no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/media?path=some/file.png", {
      "x-internal-secret": "wrong-secret",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("serves the file for a logged-in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4), type: "image/png" },
      error: null,
    });
    const req = makeRequest("http://localhost/api/media?path=some/file.png");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockDownload).toHaveBeenCalledWith("some/file.png");
  });

  it("serves the file for the internal service-to-service secret with no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4), type: "image/png" },
      error: null,
    });
    const req = makeRequest("http://localhost/api/media?path=some/file.png", {
      "x-internal-secret": "test-secret",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("rejects a bucket other than the configured one, even for a logged-in session", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    const req = makeRequest(
      "http://localhost/api/media?path=some/file.png&bucket=some-other-bucket"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("blocks a session from reading another school's prefix", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", role: "TEACHER" } });
    const req = makeRequest("http://localhost/api/media?path=schools/s2/logo/a.png");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("allows a session to read its own school's prefix", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", role: "TEACHER" } });
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4), type: "image/png" },
      error: null,
    });
    const req = makeRequest("http://localhost/api/media?path=schools/s1/logo/a.png");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("allows SUPERADMIN to read any school's prefix", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: null, role: "SUPERADMIN" } });
    mockDownload.mockResolvedValue({
      data: { arrayBuffer: async () => new ArrayBuffer(4), type: "image/png" },
      error: null,
    });
    const req = makeRequest("http://localhost/api/media?path=schools/s2/logo/a.png");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("rejects path traversal segments", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1", role: "TEACHER" } });
    const req = makeRequest("http://localhost/api/media?path=schools/s1/../s2/a.png");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("prefers INTERNAL_API_SECRET over NEXTAUTH_SECRET when set", async () => {
    process.env.INTERNAL_API_SECRET = "dedicated";
    try {
      mockGetServerSession.mockResolvedValue(null);
      const res = await GET(
        makeRequest("http://localhost/api/media?path=some/file.png", {
          "x-internal-secret": "test-secret",
        })
      );
      expect(res.status).toBe(401);
    } finally {
      delete process.env.INTERNAL_API_SECRET;
    }
  });
});
