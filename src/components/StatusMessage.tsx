import type { ReactNode } from "react";

export interface StatusMessageProps {
  tone?: "neutral" | "error" | "warning";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

const TONES = {
  neutral: "border-zinc-200 bg-white text-zinc-600",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
} as const;

/** Shared empty / error / notice block. */
export function StatusMessage({ tone = "neutral", title, children, action }: StatusMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`rounded-xl border px-6 py-10 text-center ${TONES[tone]}`}
    >
      <p className="font-medium text-current">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm opacity-90">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-current/20 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
    >
      Try again
    </button>
  );
}
