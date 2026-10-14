import { act, renderHook, waitFor } from "@testing-library/react";
import { useSubscriptionsState } from "./useSubscriptionsState";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock("@/app/_components/hooks/useDebounce", () => ({ useDebounce: (v: string) => v }));

const mockFetchSchools = jest.fn();
const mockUpdate = jest.fn();
jest.mock("@/lib/api/superadminSchools", () => ({
  fetchSuperadminSchools: (...a: unknown[]) => mockFetchSchools(...a),
  updateSchoolSubscription: (...a: unknown[]) => mockUpdate(...a),
}));

describe("useSubscriptionsState", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads schools and applies defaults for missing fields", async () => {
    mockFetchSchools.mockResolvedValue({
      ok: true,
      data: { schools: [{ id: "s1", name: "A", location: "X", createdAt: "2026-01-01" }] },
    });
    const { result } = renderHook(() => useSubscriptionsState());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([
      expect.objectContaining({
        id: "s1",
        billingMode: "PARENT_SUBSCRIPTION",
        parentSubscriptionAmount: null,
        parentSubscriptionTrialDays: 0,
        isActive: true,
      }),
    ]);
  });

  it("sets error and clears rows when load fails", async () => {
    mockFetchSchools.mockResolvedValue({ ok: false, data: { message: "nope" } });
    const { result } = renderHook(() => useSubscriptionsState());
    await waitFor(() => expect(result.current.error).toBe("nope"));
    expect(result.current.rows).toEqual([]);
  });

  it("saves the edited row, refetches and refreshes the router", async () => {
    mockFetchSchools.mockResolvedValue({
      ok: true,
      data: { schools: [{ id: "s1", name: "A", location: "X", createdAt: "d", isActive: true }] },
    });
    mockUpdate.mockResolvedValue({
      ok: true,
      data: { school: { name: "B", billingMode: "SCHOOL_PAID", parentSubscriptionAmount: 99, isActive: false } },
    });
    const { result } = renderHook(() => useSubscriptionsState());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => result.current.setEditing(result.current.rows[0]));
    await act(async () => {
      await result.current.handleModalSave();
    });

    expect(mockUpdate).toHaveBeenCalledWith("s1", expect.objectContaining({ name: "A", isActive: true }));
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.current.editing).toBeNull();
    expect(mockFetchSchools).toHaveBeenCalledTimes(2);
  });
});
