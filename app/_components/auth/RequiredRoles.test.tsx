import { render, screen } from "@testing-library/react";
import RequireRole from "@/app/_components/auth/RequiredRoles";

const mockReplace = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/app/_components/components/common/AuthLoadingFallback", () => ({
  __esModule: true,
  default: () => <div data-testid="auth-loading" />,
}));

const useSession = require("next-auth/react").useSession;

describe("RequireRole", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    useSession.mockReset();
  });

  it("shows the loading fallback while the session is loading, without redirecting", () => {
    useSession.mockReturnValue({ data: null, status: "loading" });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN"]}>
        <span>Content</span>
      </RequireRole>
    );
    expect(screen.getByTestId("auth-loading")).toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects to / when unauthenticated", () => {
    useSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN"]}>
        <span>Content</span>
      </RequireRole>
    );
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("redirects to /unauthorized when the session role isn't in allowedRoles", () => {
    useSession.mockReturnValue({
      data: { user: { role: "TEACHER" } },
      status: "authenticated",
    });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN", "SUPERADMIN"]}>
        <span>Content</span>
      </RequireRole>
    );
    expect(mockReplace).toHaveBeenCalledWith("/unauthorized");
  });

  it("does not redirect and renders children when the role is allowed", () => {
    useSession.mockReturnValue({
      data: { user: { role: "SCHOOLADMIN" } },
      status: "authenticated",
    });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN", "SUPERADMIN"]}>
        <span>Content</span>
      </RequireRole>
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("does not redirect while the role is still undefined (hydration), and doesn't render a loading fallback", () => {
    useSession.mockReturnValue({
      data: { user: {} },
      status: "authenticated",
    });
    render(
      <RequireRole allowedRoles={["SCHOOLADMIN"]}>
        <span>Content</span>
      </RequireRole>
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
