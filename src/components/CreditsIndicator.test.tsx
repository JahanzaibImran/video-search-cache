import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreditsIndicator } from "./CreditsIndicator";

describe("CreditsIndicator", () => {
  it('shows "X of N credits used" with a progress bar', () => {
    render(<CreditsIndicator credits={{ used: 3, limit: 20, remaining: 17 }} />);

    expect(screen.getByText("3 of 20 credits used")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
    expect(screen.queryByText(/out of credits/)).not.toBeInTheDocument();
  });

  it("shows a friendly message when the limit is reached", () => {
    render(<CreditsIndicator credits={{ used: 20, limit: 20, remaining: 0 }} />);

    expect(screen.getByText("20 of 20 credits used")).toBeInTheDocument();
    expect(screen.getByText(/out of credits.*cached is still free/i)).toBeInTheDocument();
  });
});
