"use client";

import { render, screen } from "@testing-library/react";
import RequireFeature from "@/app/_components/auth/RequireFeature";

const mockReplace = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const useSession = require("next-auth/react").useSession;

jest.mock("@/lib/auth/usePermissions", () => ({
  useAllowedFeatures: jest.fn(),
}));

const useAllowedFeatures = require("@/lib/auth/usePermissions").useAllowedFeatures;

describe("RequireFeature (frontend)", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    useSession.mockReset();
    useAllowedFeatures.mockReset();
  });

  it("shows loading when status is loading", () => {
    useSession.mockReturnValue({ data: null, status: "loading" });
    useAllowedFeatures.mockReturnValue([]);
    render(
      <RequireFeature requiredFeature="homework">
        <span>Content</span>
      </RequireFeature>
    );
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("allows SCHOOLADMIN to see any feature", () => {
    useSession.mockReturnValue({
      data: { user: { role: "SCHOOLADMIN" } },
      status: "authenticated",
    });
    useAllowedFeatures.mockReturnValue([]);
    render(
      <RequireFeature requiredFeature="certificates">
        <span>Content</span>
      </RequireFeature>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("allows SUPERADMIN to see any feature", () => {
    useSession.mockReturnValue({
      data: { user: { role: "SUPERADMIN" } },
      status: "authenticated",
    });
    useAllowedFeatures.mockReturnValue([]);
    render(
      <RequireFeature requiredFeature="payments">
        <span>Content</span>
      </RequireFeature>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("allows TEACHER with dashboard to see dashboard tab", () => {
    useSession.mockReturnValue({
      data: { user: { role: "TEACHER" } },
      status: "authenticated",
    });
    useAllowedFeatures.mockReturnValue(["dashboard", "homework"]);
    render(
      <RequireFeature requiredFeature="dashboard">
        <span>Content</span>
      </RequireFeature>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("allows TEACHER with events to see workshops tab (workshops -> events)", () => {
    useSession.mockReturnValue({
      data: { user: { role: "TEACHER" } },
      status: "authenticated",
    });
    useAllowedFeatures.mockReturnValue(["events"]);
    render(
      <RequireFeature requiredFeature="workshops">
        <span>Content</span>
      </RequireFeature>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("shows Access Denied for TEACHER without required feature", () => {
    useSession.mockReturnValue({
      data: { user: { role: "TEACHER" } },
      status: "authenticated",
    });
    useAllowedFeatures.mockReturnValue(["dashboard", "homework"]);
    render(
      <RequireFeature requiredFeature="certificates">
        <span>Content</span>
      </RequireFeature>
    );
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to Dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });
});
