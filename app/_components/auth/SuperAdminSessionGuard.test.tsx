import { render } from "@testing-library/react";
import SuperAdminSessionGuard from "@/app/_components/auth/SuperAdminSessionGuard";

const mockSignOut = jest.fn();
const mockClearSuperAdminBrowserSession = jest.fn();
const mockShouldForceSuperAdminRelogin = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock("@/lib/auth/superAdminBrowserSession", () => ({
  clearSuperAdminBrowserSession: (...args: unknown[]) => mockClearSuperAdminBrowserSession(...args),
  shouldForceSuperAdminRelogin: (...args: unknown[]) => mockShouldForceSuperAdminRelogin(...args),
}));

const useSession = require("next-auth/react").useSession;

describe("SuperAdminSessionGuard", () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockClearSuperAdminBrowserSession.mockClear();
    mockShouldForceSuperAdminRelogin.mockReset().mockReturnValue(false);
    useSession.mockReset();
  });

  it("renders nothing", () => {
    useSession.mockReturnValue({ data: null, status: "loading" });
    const { container } = render(<SuperAdminSessionGuard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("clears the browser session marker when unauthenticated", () => {
    useSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<SuperAdminSessionGuard />);
    expect(mockClearSuperAdminBrowserSession).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does not sign out a non-SUPERADMIN, even with a stale marker", () => {
    mockShouldForceSuperAdminRelogin.mockReturnValue(true);
    useSession.mockReturnValue({
      data: { user: { role: "SCHOOLADMIN" } },
      status: "authenticated",
    });
    render(<SuperAdminSessionGuard />);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does not sign out a SUPERADMIN with a valid same-browser-session marker", () => {
    mockShouldForceSuperAdminRelogin.mockReturnValue(false);
    useSession.mockReturnValue({
      data: { user: { role: "SUPERADMIN" } },
      status: "authenticated",
    });
    render(<SuperAdminSessionGuard />);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("forces sign-out for a SUPERADMIN with a stale cookie (no browser-session marker)", () => {
    mockShouldForceSuperAdminRelogin.mockReturnValue(true);
    useSession.mockReturnValue({
      data: { user: { role: "SUPERADMIN" } },
      status: "authenticated",
    });
    render(<SuperAdminSessionGuard />);
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/admin/login" });
  });
});
