import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// React Testing Library only advances fake timers inside its async act() wrapper
// when it detects *Jest* fake timers. This shim lets it recognise Vitest's, so
// tests using vi.useFakeTimers() + userEvent don't hang.
Object.assign(globalThis, {
  jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
});

afterEach(() => cleanup());
