import { fetchFeeRecords } from "@/lib/fees/loadSchoolFeesPage";

const rec = (id: string) => ({ id, studentId: id });

function mockPages(pages: Array<{ fees: unknown[]; nextCursor: string | null }>) {
  let call = 0;
  const calls: string[] = [];
  global.fetch = jest.fn(async (url: string) => {
    calls.push(String(url));
    const body = pages[Math.min(call++, pages.length - 1)];
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

describe("fetchFeeRecords", () => {
  it("returns a single page when there is no nextCursor", async () => {
    const calls = mockPages([{ fees: [rec("a"), rec("b")], nextCursor: null }]);
    const out = await fetchFeeRecords();
    expect(out).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("follows nextCursor so records beyond the first 5,000 are not dropped", async () => {
    const calls = mockPages([
      { fees: [rec("a")], nextCursor: "a" },
      { fees: [rec("b")], nextCursor: "b" },
      { fees: [rec("c")], nextCursor: null },
    ]);
    const out = await fetchFeeRecords();
    expect(out.map((r) => (r as { id: string }).id)).toEqual(["a", "b", "c"]);
    expect(calls[1]).toContain("cursor=a");
    expect(calls[2]).toContain("cursor=b");
  });

  it("fails loudly instead of silently truncating when the page limit is exceeded", async () => {
    mockPages([{ fees: [rec("x")], nextCursor: "again" }]);
    await expect(fetchFeeRecords()).rejects.toThrow(/Too many fee records/);
  });

  it("throws the server message on an error response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ message: "nope" }) }) as Response) as unknown as typeof fetch;
    await expect(fetchFeeRecords()).rejects.toThrow("nope");
  });
});
