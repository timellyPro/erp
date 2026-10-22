/**
 * @jest-environment jsdom
 */
import { ensureFeeVersionFresh, onFeeVersionChange, resetFeeVersionClientForTests } from "@/lib/fees/feeVersionClient";

const fetchMock = jest.fn();
const answer = (version: number | null, ok = true) =>
  fetchMock.mockResolvedValueOnce({ ok, json: async () => ({ version }) });

describe("browser fee-version check", () => {
  beforeEach(() => {
    resetFeeVersionClientForTests();
    sessionStorage.clear();
    fetchMock.mockReset();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  it("drops every saved copy when the school's version differs from the one this tab saw", async () => {
    sessionStorage.setItem("erp:fee-data-version:v1", "4");
    const flush = jest.fn();
    onFeeVersionChange(flush);
    answer(5);
    await ensureFeeVersionFresh();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("erp:fee-data-version:v1")).toBe("5");
  });

  it("keeps the copies when the version is the same", async () => {
    sessionStorage.setItem("erp:fee-data-version:v1", "5");
    const flush = jest.fn();
    onFeeVersionChange(flush);
    answer(5);
    await ensureFeeVersionFresh();
    expect(flush).not.toHaveBeenCalled();
  });

  it("drops copies of unknown age once (no stored version, e.g. saved before this check existed)", async () => {
    const flush = jest.fn();
    onFeeVersionChange(flush);
    answer(3);
    await ensureFeeVersionFresh();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("erp:fee-data-version:v1")).toBe("3");
  });

  it("asks the server at most once every few seconds", async () => {
    sessionStorage.setItem("erp:fee-data-version:v1", "5");
    answer(5);
    await ensureFeeVersionFresh();
    await ensureFeeVersionFresh();
    await Promise.all([ensureFeeVersionFresh(), ensureFeeVersionFresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves everything alone when the server errors, returns no number, or is unreachable", async () => {
    const flush = jest.fn();
    onFeeVersionChange(flush);
    answer(null);
    await ensureFeeVersionFresh();
    resetFeeVersionClientForTests();
    onFeeVersionChange(flush);
    answer(7, false);
    await ensureFeeVersionFresh();
    resetFeeVersionClientForTests();
    onFeeVersionChange(flush);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await ensureFeeVersionFresh();
    expect(flush).not.toHaveBeenCalled();
  });

  it("one failing flusher does not stop the others", async () => {
    const good = jest.fn();
    onFeeVersionChange(() => {
      throw new Error("boom");
    });
    onFeeVersionChange(good);
    answer(9);
    await ensureFeeVersionFresh();
    expect(good).toHaveBeenCalled();
  });
});
