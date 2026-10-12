import { act, renderHook, waitFor } from "@testing-library/react";
import { useAttendanceState } from "./useAttendanceState";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const mockToast = { show: jest.fn() };
jest.mock("../../../../context/ToastContext", () => ({ useToastContext: () => mockToast }));

const mockPeek = jest.fn();
const mockLoad = jest.fn();
jest.mock("@/lib/teacher/loadTeacherFastTabs", () => ({
  peekTeacherAttendanceClasses: () => mockPeek(),
  loadTeacherAttendanceClasses: (...a: unknown[]) => mockLoad(...a),
}));

const jsonRes = (body: unknown, ok = true) => ({ ok, json: async () => body });

function mockFetch(routes: Record<string, unknown>) {
  (global.fetch as jest.Mock) = jest.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return jsonRes({}, false);
    const value = routes[key];
    return typeof value === "function" ? value(url, init) : jsonRes(value);
  });
}

const classPayload = {
  class: {
    students: [
      { id: "st1", rollNo: "1", user: { name: "Asha", photoUrl: "a.png" } },
      { id: "st2", name: "Ravi" },
    ],
  },
};

describe("useAttendanceState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPeek.mockReturnValue([{ id: "c1", name: "8", section: "A" }]);
    mockLoad.mockResolvedValue([{ id: "c1", name: "8", section: "A" }]);
  });

  it("selects first class and maps students with saved statuses", async () => {
    mockFetch({
      "/api/class/c1": classPayload,
      "/api/attendance/view": { attendances: [{ studentId: "st1", status: "ABSENT" }] },
    });
    const { result } = renderHook(() => useAttendanceState());
    await waitFor(() => expect(result.current.students).toHaveLength(2));

    expect(result.current.selectedClass).toBe("c1");
    expect(result.current.selectedClassLabel).toBe("8-A");
    expect(result.current.students[0]).toMatchObject({ id: "st1", roll: "1", name: "Asha", status: "absent" });
    expect(result.current.students[1]).toMatchObject({ id: "st2", roll: "02", name: "Ravi", status: "present" });
    expect(result.current.stats).toMatchObject({ present: 1, absent: 1, total: 2, rate: 50 });
  });

  it("toasts and clears students when the class fetch fails", async () => {
    mockFetch({ "/api/class/c1": () => jsonRes({ message: "boom" }, false) });
    const { result } = renderHook(() => useAttendanceState());
    await waitFor(() => expect(mockToast.show).toHaveBeenCalledWith("boom", "error"));
    expect(result.current.students).toEqual([]);
  });

  it("posts uppercase statuses on save and shows success", async () => {
    const mark = jest.fn(() => jsonRes({ ok: true }));
    mockFetch({
      "/api/class/c1": classPayload,
      "/api/attendance/view": { attendances: [] },
      "/api/attendance/mark": mark,
    });
    const { result } = renderHook(() => useAttendanceState());
    await waitFor(() => expect(result.current.students).toHaveLength(2));

    await act(async () => {
      await result.current.handleSaveAttendance();
    });

    const body = JSON.parse((mark.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.classId).toBe("c1");
    expect(body.attendances).toEqual([
      { studentId: "st1", status: "PRESENT" },
      { studentId: "st2", status: "PRESENT" },
    ]);
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.current.showSuccess).toBe(true);
  });

  it("refuses to save when there are no students", async () => {
    mockPeek.mockReturnValue([]);
    mockLoad.mockResolvedValue([]);
    mockFetch({});
    const { result } = renderHook(() => useAttendanceState());
    await waitFor(() => expect(result.current.loadingClasses).toBe(false));
    await act(async () => {
      await result.current.handleSaveAttendance();
    });
    expect(mockToast.show).toHaveBeenCalledWith("Please select a class first", "warning");
  });

  it("warns when exporting with no data", async () => {
    mockPeek.mockReturnValue([]);
    mockLoad.mockResolvedValue([]);
    mockFetch({});
    const { result } = renderHook(() => useAttendanceState());
    await waitFor(() => expect(result.current.loadingClasses).toBe(false));
    act(() => result.current.handleExportReport());
    expect(mockToast.show).toHaveBeenCalledWith("No attendance data to export", "warning");
  });
});
