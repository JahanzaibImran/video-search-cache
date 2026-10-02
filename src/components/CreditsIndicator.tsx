import type { CreditUsage } from "@/lib/api/types";

export interface CreditsIndicatorProps {
  credits: CreditUsage | null;
}

export function CreditsIndicator({ credits }: CreditsIndicatorProps) {
  if (!credits) {
    return <div className="h-9 w-40 animate-pulse rounded-lg bg-zinc-100" aria-hidden="true" />;
  }

  const { used, limit, remaining } = credits;
  const exhausted = remaining === 0;
  const low = !exhausted && remaining <= Math.max(1, Math.ceil(limit * 0.15));
  const percent = limit === 0 ? 100 : Math.min(100, (used / limit) * 100);
  const barColor = exhausted ? "bg-rose-500" : low ? "bg-amber-500" : "bg-zinc-800";

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <p className="text-sm font-medium text-zinc-700 tabular-nums" aria-live="polite">
        {used} of {limit} credits used
      </p>
      <div
        role="progressbar"
        aria-label="Credits used"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200"
      >
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {exhausted && (
        <p className="max-w-56 text-xs text-rose-600">
          You&apos;re out of credits. Anything already cached is still free to browse.
        </p>
      )}
    </div>
  );
}
