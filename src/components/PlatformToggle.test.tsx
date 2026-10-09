import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlatformToggle } from "./PlatformToggle";

describe("PlatformToggle", () => {
  it("lets the user switch platform", async () => {
    const onChange = vi.fn();
    render(
      <PlatformToggle platforms={["youtube", "tiktok"]} value="youtube" onChange={onChange} />,
    );

    expect(screen.getByRole("radio", { name: "YouTube" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "TikTok" }));

    expect(onChange).toHaveBeenCalledWith("tiktok");
  });

  it("is hidden when the provider can only search one platform", () => {
    const { container } = render(
      <PlatformToggle platforms={["youtube"]} value="youtube" onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
