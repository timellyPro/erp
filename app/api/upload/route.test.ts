/**
 * @jest-environment node
 */
import { POST } from "@/app/api/upload/route";

const mockGetServerSession = jest.fn();
const mockGetBucket = jest.fn();
const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/authOptions", () => ({}));

jest.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

let supabaseAdminMock: unknown = {
  storage: {
    getBucket: (...args: unknown[]) => mockGetBucket(...args),
    from: () => ({
      upload: (...args: unknown[]) => mockUpload(...args),
      getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
    }),
  },
};

jest.mock("@/lib/supabase", () => ({
  get supabaseAdmin() {
    return supabaseAdminMock;
  },
  SUPABASE_BUCKET: "test-bucket",
}));

function makeRequest(file: File | null, folder = "images") {
  const formData = new FormData();
  if (file) formData.append("file", file);
  formData.append("folder", folder);
  return new Request("http://localhost/api/upload", { method: "POST", body: formData });
}

function makeFile(name: string, type: string, sizeBytes = 100) {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

describe("POST /api/upload", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockGetServerSession.mockReset();
    mockGetBucket.mockReset();
    mockUpload.mockReset();
    mockGetPublicUrl.mockReset();
    mockMkdir.mockReset();
    mockWriteFile.mockReset();
    supabaseAdminMock = {
      storage: {
        getBucket: (...args: unknown[]) => mockGetBucket(...args),
        from: () => ({
          upload: (...args: unknown[]) => mockUpload(...args),
          getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
        }),
      },
    };
    mockGetBucket.mockResolvedValue({ data: { name: "test-bucket" }, error: null });
    Object.defineProperty(process.env, "NODE_ENV", { value: "test", configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(process.env, "NODE_ENV", { value: originalEnv, configurable: true });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(makeFile("a.png", "image/png")));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a disallowed file type", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(makeRequest(makeFile("a.exe", "application/x-msdownload")));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the file exceeds the max size", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    const bigFile = makeFile("big.png", "image/png", 11 * 1024 * 1024);
    const res = await POST(makeRequest(bigFile));
    expect(res.status).toBe(400);
  });

  it("uploads to Supabase and returns the public URL", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUpload.mockResolvedValue({ data: { path: "schools/s1/images/1-a.png" }, error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn/x.png" } });
    const res = await POST(makeRequest(makeFile("a.png", "image/png")));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.provider).toBe("supabase");
    expect(json.url).toBe("https://cdn/x.png");
  });

  it("allows PDF uploads for the homework folder", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockUpload.mockResolvedValue({ data: { path: "schools/s1/homework/1-a.pdf" }, error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn/x.pdf" } });
    const res = await POST(makeRequest(makeFile("a.pdf", "application/pdf"), "homework"));
    expect(res.status).toBe(200);
  });

  it("falls back to local storage in dev when Supabase isn't configured", async () => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", configurable: true });
    supabaseAdminMock = null;
    mockGetServerSession.mockResolvedValue({ user: { id: "u1", schoolId: "s1" } });
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    const res = await POST(makeRequest(makeFile("a.png", "image/png")));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.provider).toBe("local-dev");
  });

  it("returns 500 when the request throws unexpectedly", async () => {
    mockGetServerSession.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest(makeFile("a.png", "image/png")));
    expect(res.status).toBe(500);
  });
});
