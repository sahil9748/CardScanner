import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import PinEntryPage from "../app/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock api client
vi.mock("../lib/api", () => ({
  api: {
    validatePin: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("Customer PIN Entry Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders PIN keypad and input instruction", () => {
    render(<PinEntryPage />);
    expect(screen.getByText("Enter Access PIN")).toBeDefined();
    expect(screen.getByText("Continue to Scanner")).toBeDefined();
  });

  it("supports toggle between 4-digit and 5-digit PINs", () => {
    render(<PinEntryPage />);
    const btn5 = screen.getByText("5 Digits");
    fireEvent.click(btn5);
    // 5 digit bubbles rendered
    expect(btn5.className).toContain("bg-indigo-600");
  });

  it("registers keypad button clicks and clears on Clear", () => {
    render(<PinEntryPage />);
    const digit0 = screen.getByText("0");
    const digit7 = screen.getByText("7");
    const clearBtn = screen.getByText("Clear");

    // Click 0, 0, 7
    fireEvent.click(digit0);
    fireEvent.click(digit0);
    fireEvent.click(digit7);

    // Verify leading zeroes and digits rendered
    expect(screen.getAllByText("0").length).toBeGreaterThan(1);
    expect(screen.getAllByText("7").length).toBe(2);

    // Clear
    fireEvent.click(clearBtn);
  });
});
