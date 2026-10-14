import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdmissionTabState } from "./useAdmissionTabState";

const mockPush = jest.fn();
let mockParams = new URLSearchParams("view=all");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/teacher",
  useSearchParams: () => mockParams,
}));

const mockSetReloadKey = jest.fn();
jest.mock("./useAdmissionListState", () => ({
  useAdmissionListState: () => ({
    rows: [],
    setRows: jest.fn(),
    loading: false,
    page: 1,
    setPage: jest.fn(),
    totalPages: 1,
    paidApplicationsCount: 0,
    search: "",
    setSearch: jest.fn(),
    filters: {},
    setFilters: jest.fn(),
    listPhase: "all",
    setListPhase: jest.fn(),
    showExportMenu: false,
    setShowExportMenu: jest.fn(),
    setReloadKey: mockSetReloadKey,
    exportAdmissions: jest.fn(),
  }),
}));
jest.mock("./useAdmissionPaymentDialog", () => ({
  useAdmissionPaymentDialog: () => ({
    paymentDialog: null,
    setPaymentDialog: jest.fn(),
    paying: false,
    paymentError: null,
    paymentForm: {},
    setPaymentForm: jest.fn(),
    openPaymentDialog: jest.fn(),
    markFeePaid: jest.fn(),
  }),
}));
jest.mock("./useAdmissionFeeAssign", () => ({
  useAdmissionFeeAssign: () => ({ warmAssignCatalog: jest.fn(), openAssignFeesDialog: jest.fn() }),
}));
jest.mock("./useAdmissionReceiptPrinting", () => ({
  useAdmissionReceiptPrinting: () => ({ receiptData: null, receiptRef: { current: null }, printFeeReceipt: jest.fn() }),
}));
jest.mock("./useAdmissionTableColumns", () => ({ useAdmissionTableColumns: () => ({ tableColumns: [] }) }));
jest.mock("./useAdmissionFormEditLoad", () => ({ useAdmissionFormEditLoad: jest.fn() }));

const jsonRes = (body: unknown, ok = true) => ({ ok, json: async () => body });
const classes = [
  { id: "c10", name: "Class 10", section: "B" },
  { id: "c2", name: "Class 2", section: null },
  { id: "c1", name: "Class 1", section: "A" },
];

function mockFetch(handlers: Record<string, (init?: RequestInit) => unknown> = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/class/list")) return jsonRes({ classes });
    const key = Object.keys(handlers).find((k) => url.startsWith(k));
    return key ? handlers[key](init) : jsonRes({}, false);
  }) as unknown as typeof fetch;
}

type Hook = { current: ReturnType<typeof useAdmissionTabState> };

describe("useAdmissionTabState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams("view=all");
  });

  it("derives view and editId from the query string", async () => {
    mockFetch();
    mockParams = new URLSearchParams("editId=a1");
    const { result } = renderHook(() => useAdmissionTabState());
    expect(result.current.view).toBe("add");
    expect(result.current.editId).toBe("a1");
    await waitFor(() => expect(result.current.classes).toHaveLength(3));
  });

  it("builds naturally-sorted class options with an Unassigned entry", async () => {
    mockFetch();
    const { result } = renderHook(() => useAdmissionTabState());
    await waitFor(() => expect(result.current.classOptions).toHaveLength(4));
    expect(result.current.classOptions.map((o) => o.value)).toEqual(["", "c1", "c2", "c10"]);
    expect(result.current.classOptions[1].label).toBe("Class 1 · A");
  });

  it("falls back to no classes when the list request fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("net")) as unknown as typeof fetch;
    const { result } = renderHook(() => useAdmissionTabState());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current.classOptions).toEqual([{ label: "Unassigned", value: "" }]);
  });

  it("onClassIdChange sets the class and derived grade, and clears on empty", async () => {
    mockFetch();
    const { result } = renderHook(() => useAdmissionTabState());
    await waitFor(() => expect(result.current.classes).toHaveLength(3));
    act(() => result.current.onClassIdChange("c2"));
    expect(result.current.form.classId).toBe("c2");
    expect(result.current.form.gradeSought).toBe("GRADE_2");
    act(() => result.current.onClassIdChange(""));
    expect(result.current.form.classId).toBe("");
  });

  describe("handleSaveClick", () => {
    const fill = async (result: Hook) => {
      await waitFor(() => expect(result.current.classes).toHaveLength(3));
      act(() =>
        result.current.setForm((p) => ({
          ...p,
          studentName: "Asha Devi Rao",
          applicationNo: " APP1 ",
          aadharNo: "123456789012",
        }))
      );
    };

    it("POSTs a normalised payload, resets the form and navigates to the list", async () => {
      const create = jest.fn((_init?: RequestInit) => jsonRes({ application: { applicationNo: "APP9" } }));
      mockFetch({ "/api/admissions/create": create });
      const { result } = renderHook(() => useAdmissionTabState());
      await fill(result);

      await act(async () => {
        await result.current.handleSaveClick();
      });

      const init = create.mock.calls[0][0] as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        firstName: "Asha",
        middleName: "Devi",
        lastName: "Rao",
        applicationNo: "APP1",
        parentAadharNo: "123456780000",
        previousSchoolName: "-",
        emergencyFatherNo: "-",
        admissionNo: null,
      });
      expect(result.current.message).toBe("Saved. Application No: APP9");
      expect(result.current.messageTone).toBe("success");
      expect(result.current.form.studentName).toBe("");
      expect(mockPush).toHaveBeenCalledWith("?tab=admission&view=all");
    });

    it("PUTs to the edit endpoint when editing", async () => {
      mockParams = new URLSearchParams("view=add&editId=a1");
      const update = jest.fn((_init?: RequestInit) => jsonRes({}));
      mockFetch({ "/api/admissions/a1": update });
      const { result } = renderHook(() => useAdmissionTabState());
      await fill(result);
      await act(async () => {
        await result.current.handleSaveClick();
      });
      expect((update.mock.calls[0][0] as RequestInit).method).toBe("PUT");
      expect(result.current.message).toBe("Admission updated successfully.");
    });

    it("stays on the page and shows the error when save fails", async () => {
      mockFetch({ "/api/admissions/create": () => jsonRes({ message: "Duplicate" }, false) });
      const { result } = renderHook(() => useAdmissionTabState());
      await fill(result);
      await act(async () => {
        await result.current.handleSaveClick();
      });
      expect(result.current.message).toBe("Duplicate");
      expect(result.current.messageTone).toBe("error");
      expect(result.current.submitting).toBe(false);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("delete and workflow actions", () => {
    it("deletes the row, clears state and triggers a reload", async () => {
      const del = jest.fn((init?: RequestInit) => {
        expect(init?.method).toBe("DELETE");
        return jsonRes({});
      });
      mockFetch({ "/api/admissions/r1": del });
      const { result } = renderHook(() => useAdmissionTabState());
      await waitFor(() => expect(result.current.classes).toHaveLength(3));
      act(() => result.current.setDeleteRow({ id: "r1" } as never));
      await act(async () => {
        await result.current.confirmDelete();
      });
      expect(del).toHaveBeenCalled();
      expect(result.current.deleteRow).toBeNull();
      expect(result.current.message).toBe("Admission deleted successfully.");
      expect(mockSetReloadKey).toHaveBeenCalled();
    });

    it("keeps the row and reports the API error when delete fails", async () => {
      mockFetch({ "/api/admissions/r1": () => jsonRes({ message: "Locked" }, false) });
      const { result } = renderHook(() => useAdmissionTabState());
      await waitFor(() => expect(result.current.classes).toHaveLength(3));
      act(() => result.current.setDeleteRow({ id: "r1" } as never));
      await act(async () => {
        await result.current.confirmDelete();
      });
      expect(result.current.deleteRow).not.toBeNull();
      expect(result.current.message).toBe("Locked");
      expect(result.current.messageTone).toBe("error");
    });

    it("goToStudentDetails errors when the application is not enrolled", async () => {
      mockFetch();
      const { result } = renderHook(() => useAdmissionTabState());
      await waitFor(() => expect(result.current.classes).toHaveLength(3));
      act(() => result.current.goToStudentDetails({ id: "r1", studentId: null } as never));
      expect(result.current.messageTone).toBe("error");
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("patchWorkflow PATCHes and reloads the list", async () => {
      const patch = jest.fn((_init?: RequestInit) => jsonRes({ message: "Moved" }));
      mockFetch({ "/api/admissions/r1/workflow": patch });
      const { result } = renderHook(() => useAdmissionTabState());
      await waitFor(() => expect(result.current.classes).toHaveLength(3));
      await act(async () => {
        await result.current.patchWorkflow({ id: "r1" } as never, "UPCOMING");
      });
      expect(JSON.parse((patch.mock.calls[0][0] as RequestInit).body as string)).toEqual({
        workflowStatus: "UPCOMING",
      });
      expect(result.current.message).toBe("Moved");
      expect(mockSetReloadKey).toHaveBeenCalled();
      expect(result.current.workflowBusyId).toBeNull();
    });
  });
});
