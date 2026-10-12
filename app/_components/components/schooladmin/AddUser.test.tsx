import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddUser from "./AddUser";

const mockPush = jest.fn();
let mockParams = new URLSearchParams("tab=add-user&view=all");
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { schoolId: "sch1" } } }),
}));
jest.mock("@/app/_components/hooks/useDebounce", () => ({ useDebounce: (v: string) => v }));
jest.mock("./schooladmincomponents/PageHeaderTabs", () => () => null);
jest.mock("./schooladmincomponents/UserForm", () => ({
  __esModule: true,
  default: (p: { mode: string; onSuccess: () => void }) => (
    <button onClick={p.onSuccess}>form-{p.mode}</button>
  ),
}));

const mockFetchPage = jest.fn();
const mockInvalidate = jest.fn();
jest.mock("@/lib/school/fetchAddUserPage", () => ({
  fetchUserListPage: (...a: unknown[]) => mockFetchPage(...a),
  invalidateAddUserPageCache: (...a: unknown[]) => mockInvalidate(...a),
  listCacheKey: (...a: unknown[]) => a.join("|"),
  peekUserListPage: () => undefined,
  warmAddUserPage: jest.fn(),
}));

const mockDeleteUser = jest.fn();
jest.mock("@/lib/api/user", () => ({ deleteUser: (...a: unknown[]) => mockDeleteUser(...a) }));

const users = [
  { id: "u1", name: "Teacher One", email: "t1@x.com", role: "TEACHER", createdAt: new Date().toISOString() },
  { id: "u2", name: "Admin Two", email: "a2@x.com", role: "SCHOOLADMIN", createdAt: new Date().toISOString() },
];

describe("AddUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams("tab=add-user&view=all");
    mockFetchPage.mockResolvedValue({ users, total: 2 });
  });

  it("fetches the teacher list for the school and shows the total", async () => {
    render(<AddUser />);
    await waitFor(() => expect(screen.getAllByText("Teacher One").length).toBeGreaterThan(0));
    expect(mockFetchPage).toHaveBeenCalledWith(
      "sch1",
      expect.objectContaining({ page: 1, pageSize: 10, role: "TEACHER", search: "" })
    );
    expect(screen.getByText("2 total")).toBeInTheDocument();
  });

  it("only allows editing teachers", async () => {
    render(<AddUser />);
    await waitFor(() => expect(screen.getAllByText("Admin Two").length).toBeGreaterThan(0));
    const edit = screen.getAllByTitle("Edit user");
    const del = screen.getAllByTitle("Delete user");
    // Every row (desktop + mobile lists) can be deleted, but only the teacher row can be edited.
    expect(del.length).toBe(edit.length * 2);
    await userEvent.setup().click(edit[0]);
    expect(mockPush).toHaveBeenCalledWith("?tab=add-user&view=add&userId=u1");
  });

  it("deletes a user, invalidates the cache and closes the dialog", async () => {
    mockDeleteUser.mockResolvedValue({ ok: true, data: {} });
    render(<AddUser />);
    await waitFor(() => expect(screen.getAllByText("Teacher One").length).toBeGreaterThan(0));
    const user = userEvent.setup();
    await user.click(screen.getAllByTitle("Delete user")[0]);
    await user.click(await screen.findByRole("button", { name: "Delete User" }));
    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledWith("sch1"));
    await waitFor(() => expect(screen.queryAllByText("Teacher One")).toHaveLength(0));
  });

  it("renders the form in create mode and returns to the list on success", async () => {
    mockParams = new URLSearchParams("tab=add-user&view=add");
    render(<AddUser />);
    await userEvent.setup().click(screen.getByRole("button", { name: "form-create" }));
    expect(mockInvalidate).toHaveBeenCalledWith("sch1");
    expect(mockPush).toHaveBeenCalledWith("?tab=add-user&view=all");
  });

  it("uses edit mode when userId is present", () => {
    mockParams = new URLSearchParams("tab=add-user&view=add&userId=u1");
    render(<AddUser />);
    expect(screen.getByRole("button", { name: "form-edit" })).toBeInTheDocument();
  });
});
