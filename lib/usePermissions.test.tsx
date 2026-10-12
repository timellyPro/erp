"use client";

import { render, screen } from "@testing-library/react";
import { useHasFeature, useAllowedFeatures } from "@/lib/auth/usePermissions";
import { FEATURE_IDS } from "@/lib/features";

const mockUseSession = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

function TestHasFeature({ featureId }: { featureId: string }) {
  const has = useHasFeature(featureId as "dashboard");
  return <span data-testid="has-feature">{has ? "yes" : "no"}</span>;
}

function TestAllowedFeatures() {
  const list = useAllowedFeatures();
  return <span data-testid="allowed-list">{list.join(",")}</span>;
}

describe("usePermissions", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  describe("useHasFeature", () => {
    it("returns false when not authenticated", () => {
      mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
      render(<TestHasFeature featureId="dashboard" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("no");
    });

    it("returns false when status is loading", () => {
      mockUseSession.mockReturnValue({ data: null, status: "loading" });
      render(<TestHasFeature featureId="dashboard" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("no");
    });

    it("returns true for SUPERADMIN for any feature", () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: "SUPERADMIN" } },
        status: "authenticated",
      });
      render(<TestHasFeature featureId="homework" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("yes");
    });

    it("returns true for SCHOOLADMIN for any feature", () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: "SCHOOLADMIN" } },
        status: "authenticated",
      });
      render(<TestHasFeature featureId="certificates" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("yes");
    });

    it("returns true for TEACHER when allowedFeatures includes the feature", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            role: "TEACHER",
            allowedFeatures: ["dashboard", "homework", "marks-view"],
          },
        },
        status: "authenticated",
      });
      render(<TestHasFeature featureId="homework" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("yes");
    });

    it("returns false for TEACHER when allowedFeatures does not include the feature", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            role: "TEACHER",
            allowedFeatures: ["dashboard", "homework"],
          },
        },
        status: "authenticated",
      });
      render(<TestHasFeature featureId="certificates" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("no");
    });

    it("returns true for TEACHER when allowedFeatures is undefined (legacy allow all)", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: { role: "TEACHER", allowedFeatures: undefined },
        },
        status: "authenticated",
      });
      render(<TestHasFeature featureId="certificates" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("yes");
    });

    it("returns false for TEACHER when allowedFeatures is empty array", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: { role: "TEACHER", allowedFeatures: [] },
        },
        status: "authenticated",
      });
      render(<TestHasFeature featureId="certificates" />);
      expect(screen.getByTestId("has-feature")).toHaveTextContent("no");
    });
  });

  describe("useAllowedFeatures", () => {
    it("returns empty array when not authenticated", () => {
      mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
      render(<TestAllowedFeatures />);
      expect(screen.getByTestId("allowed-list")).toHaveTextContent("");
    });

    it("returns all FEATURE_IDS for SUPERADMIN", () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: "SUPERADMIN" } },
        status: "authenticated",
      });
      render(<TestAllowedFeatures />);
      const text = screen.getByTestId("allowed-list").textContent ?? "";
      expect(text.split(",")).toHaveLength(FEATURE_IDS.length);
      expect(text).toContain("dashboard");
      expect(text).toContain("exams");
    });

    it("returns all FEATURE_IDS for SCHOOLADMIN", () => {
      mockUseSession.mockReturnValue({
        data: { user: { role: "SCHOOLADMIN" } },
        status: "authenticated",
      });
      render(<TestAllowedFeatures />);
      const text = screen.getByTestId("allowed-list").textContent ?? "";
      expect(text.split(",").length).toBe(FEATURE_IDS.length);
    });

    it("returns teacher allowedFeatures when set", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            role: "TEACHER",
            allowedFeatures: ["dashboard", "homework", "events"],
          },
        },
        status: "authenticated",
      });
      render(<TestAllowedFeatures />);
      expect(screen.getByTestId("allowed-list")).toHaveTextContent(
        "dashboard,homework,events"
      );
    });
  });
});
