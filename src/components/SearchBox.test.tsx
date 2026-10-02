import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./SearchBox";

describe("SearchBox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (props: Partial<React.ComponentProps<typeof SearchBox>> = {}) => {
    const onSearch = vi.fn();
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const utils = render(<SearchBox onSearch={onSearch} debounceMs={400} {...props} />);
    return { ...utils, onSearch, user, input: screen.getByRole("searchbox") };
  };

  it("debounces typing into a single search once input pauses", async () => {
    const { user, input, onSearch } = setup();

    await user.type(input, "react hooks");
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(399));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith("react hooks");
  });

  it("trims the query and ignores changes that only add whitespace", async () => {
    const { user, input, onSearch } = setup();

    await user.type(input, "  cats ");
    act(() => vi.advanceTimersByTime(400));
    await user.type(input, "  ");
    act(() => vi.advanceTimersByTime(400));

    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith("cats");
  });

  it("searches immediately on Enter without firing again when the debounce elapses", async () => {
    const { user, input, onSearch } = setup();

    await user.type(input, "cats{Enter}");
    expect(onSearch).toHaveBeenCalledWith("cats");

    act(() => vi.advanceTimersByTime(1_000));
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("shows a loading indicator and marks the input busy while loading", () => {
    const { rerender, input } = setup({ isLoading: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-busy", "false");

    rerender(<SearchBox onSearch={vi.fn()} isLoading />);

    expect(screen.getByRole("status")).toHaveTextContent("Searching…");
    expect(input).toHaveAttribute("aria-busy", "true");
  });
});
