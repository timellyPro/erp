"use client";

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "@/app/_components/auth/LoginForm";

const mockSignIn = jest.fn();
const mockUseSearchParams = jest.fn();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockUseSearchParams.mockReset();
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
  });

  it("renders logo, heading and form fields", () => {
    render(<LoginForm />);
    expect(screen.getByAltText("Timelly")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Welcome Back/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/school email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign In/i })).toBeInTheDocument();
  });

  it("shows error when signIn returns error", async () => {
    mockSignIn.mockResolvedValue({ error: "Invalid email or password" });
    render(<LoginForm />);
    await userEvent.type(screen.getByPlaceholderText(/school email/i), "test@school.com");
    await userEvent.type(screen.getByPlaceholderText(/••••••••/), "pass");
    fireEvent.submit(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("shows deactivated message when error includes deactivated", async () => {
    mockSignIn.mockResolvedValue({
      error: "Account is deactivated or password not set. Please contact your administrator.",
    });
    render(<LoginForm />);
    await userEvent.type(screen.getByPlaceholderText(/school email/i), "u@x.com");
    await userEvent.type(screen.getByPlaceholderText(/••••••••/), "p");
    fireEvent.submit(screen.getByRole("button", { name: /Sign In/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/deactivated or has no password set/i)
      ).toBeInTheDocument();
    });
  });

  it("keeps admin signup link disabled", () => {
    render(<LoginForm />);
    const link = screen.getByRole("link", { name: /School Administrator/i });
    expect(link).toHaveAttribute("href", "#");
  });
});
