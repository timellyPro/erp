import { act, renderHook, waitFor } from "@testing-library/react";
import { useWorkshopsAndEventsState } from "./useWorkshopsAndEventsState";

const mockPeekPage = jest.fn();
const mockLoadPage = jest.fn();
const mockSetCache = jest.fn();
const mockPeekDetails = jest.fn();
const mockLoadDetails = jest.fn();
jest.mock("@/lib/school/loadSchoolAdminFastTabs", () => ({
  peekEventsPage: () => mockPeekPage(),
  loadEventsPage: (...a: unknown[]) => mockLoadPage(...a),
  setEventsPageCache: (...a: unknown[]) => mockSetCache(...a),
  peekEventDetails: (...a: unknown[]) => mockPeekDetails(...a),
  loadEventDetails: (...a: unknown[]) => mockLoadDetails(...a),
}));

const mockDelete = jest.fn();
jest.mock("@/lib/api/events", () => ({ deleteEvent: (...a: unknown[]) => mockDelete(...a) }));

const future = new Date(Date.now() + 86_400_000 * 5).toISOString();
const past = new Date(Date.now() - 86_400_000 * 5).toISOString();

const events = [
  { id: "e1", title: "A", eventDate: future, _count: { registrations: 3 } },
  { id: "e2", title: "B", eventDate: past, _count: { registrations: 2 } },
  { id: "e3", title: "C", eventDate: null },
  { id: "e4", title: "D", eventDate: future },
];

describe("useWorkshopsAndEventsState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPeekPage.mockReturnValue(undefined);
    mockPeekDetails.mockReturnValue(undefined);
    mockLoadPage.mockResolvedValue(events);
  });

  it("loads events and computes stats and pagination", async () => {
    const { result } = renderHook(() => useWorkshopsAndEventsState());
    await waitFor(() => expect(result.current.stats.total).toBe(4));
    expect(result.current.stats).toEqual({ total: 4, upcoming: 2, completed: 1, participants: 5 });
    expect(result.current.totalPages).toBe(2);
    expect(result.current.pagedEventsWithStatus.map((x) => x.status)).toEqual(["upcoming", "completed", "upcoming"]);
  });

  it("sets an error message when loading fails", async () => {
    mockLoadPage.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useWorkshopsAndEventsState());
    await waitFor(() => expect(result.current.eventsError).toBe("down"));
  });

  it("upserts a new event into the list and cache", async () => {
    const { result } = renderHook(() => useWorkshopsAndEventsState());
    await waitFor(() => expect(result.current.stats.total).toBe(4));
    mockLoadPage.mockResolvedValue([...events, { id: "e5", title: "E" }]);
    act(() => result.current.handleEventUpsert({ id: "e5" }));
    expect(mockSetCache).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "e5" })]));
    await waitFor(() => expect(result.current.stats.total).toBe(5));
  });

  it("removes the event optimistically on delete", async () => {
    mockDelete.mockResolvedValue({ ok: true, data: {} });
    const { result } = renderHook(() => useWorkshopsAndEventsState());
    await waitFor(() => expect(result.current.stats.total).toBe(4));
    mockLoadPage.mockResolvedValue(events.filter((e) => e.id !== "e1"));
    act(() => result.current.setDeleteTarget(result.current.pagedEventsWithStatus[0].event));
    await act(async () => {
      await result.current.handleDeleteConfirm();
    });
    expect(mockDelete).toHaveBeenCalledWith("e1");
    await waitFor(() => expect(result.current.stats.total).toBe(3));
    expect(result.current.deleteTarget).toBeNull();
  });

  it("restores the list when delete fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockDelete.mockResolvedValue({ ok: false, data: { message: "no" } });
    const { result } = renderHook(() => useWorkshopsAndEventsState());
    await waitFor(() => expect(result.current.stats.total).toBe(4));
    act(() => result.current.setDeleteTarget(result.current.pagedEventsWithStatus[0].event));
    await act(async () => {
      await result.current.handleDeleteConfirm();
    });
    expect(result.current.stats.total).toBe(4);
    expect(mockSetCache).toHaveBeenLastCalledWith(events);
  });

  it("loads details when the drawer opens", async () => {
    mockLoadDetails.mockResolvedValue({ id: "e1", title: "A" });
    const { result } = renderHook(() => useWorkshopsAndEventsState());
    await waitFor(() => expect(result.current.stats.total).toBe(4));
    act(() => {
      result.current.setSelectedEventId("e1");
      result.current.setDetailsOpen(true);
    });
    await waitFor(() => expect(result.current.eventDetails).toEqual({ id: "e1", title: "A" }));
  });
});
