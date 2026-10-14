"use client";

/// <reference types="@testing-library/jest-dom" />
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchInput from "@/app/_components/components/common/SearchInput";

// Mock lucide-react to avoid icon rendering issues
jest.mock("lucide-react", () => ({
  Eye: () => <span data-testid="eye-icon" />,
  EyeOff: () => <span data-testid="eyeoff-icon" />,
}));

describe("SearchInput", () => {
  it("renders with placeholder and value", () => {
    render(<SearchInput value="hello" onChange={() => {}} placeholder="Search..." />);
    const input = screen.getByPlaceholderText("Search...");
    expect(input).toHaveValue("hello");
  });

  it("calls onChange when typing", async () => {
    const onChange = jest.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Search..." />);
    const input = screen.getByPlaceholderText("Search...");
    await userEvent.type(input, "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders label when provided", () => {
    render(<SearchInput label="Email" value="" onChange={() => {}} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders error message when provided", () => {
    render(<SearchInput value="" onChange={() => {}} error="Required field" />);
    expect(screen.getByText("Required field")).toBeInTheDocument();
  });

  it("input has aria-invalid when error is set", () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Search" error="Error" />);
    const input = screen.getByPlaceholderText("Search");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("respects disabled", () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Search" disabled />);
    const input = screen.getByPlaceholderText("Search");
    expect(input).toBeDisabled();
  });
});
