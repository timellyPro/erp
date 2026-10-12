import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudentTable from "./StudentTable";

const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockUseStudents = jest.fn();
jest.mock("@/app/_components/hooks/useStudents", () => ({
  useStudents: () => mockUseStudents(),
}));

const makeStudent = (i: number) => ({
  id: `s${i}`,
  admissionNumber: `ADM${i}`,
  user: { name: `Student ${i}` },
  class: i % 2 ? { name: "8", section: "A" } : null,
  phoneNo: `900000000${i}`,
  dob: "2012-01-01",
});

function setup(count: number, extra: Record<string, unknown> = {}) {
  mockUseStudents.mockReturnValue({
    students: Array.from({ length: count }, (_, i) => makeStudent(i + 1)),
    loading: false,
    error: null,
    refetch: mockRefetch,
    ...extra,
  });
  render(<StudentTable />);
}

describe("StudentTable", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders class label or dash", () => {
    setup(2);
    expect(screen.getAllByText("8 - A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Student 1").length).toBeGreaterThan(0);
  });

  it("shows the error in the empty state", () => {
    setup(0, { error: "boom" });
    expect(screen.getAllByText("Error: boom").length).toBeGreaterThan(0);
  });

  it("paginates at 10 rows per page", async () => {
    setup(12);
    expect(screen.queryAllByText("Student 11")).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Next" })[0]);
    await waitFor(() => expect(screen.queryAllByText("Student 11").length).toBeGreaterThan(0));
    expect(screen.queryAllByText("Student 1")).toHaveLength(0);
  });

  it("opens the detail panel, refreshes and closes it", async () => {
    setup(2);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "View" })[0]);
    expect(screen.getByText("Admission: ADM1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("Admission: ADM1")).not.toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: "View" })[1]);
    const panel = screen.getByText("Admission: ADM2").closest("div")!.parentElement!.parentElement!;
    await user.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Admission: ADM2")).not.toBeInTheDocument();
  });
});
