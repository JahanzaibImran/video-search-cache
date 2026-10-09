import { AppError } from "@/lib/errors";
import type { CreditAction, CreditUsage } from "./types";

/** The user can't afford this call; the upstream call was not made. */
export class CreditLimitError extends AppError {
  readonly code = "CREDIT_LIMIT_REACHED";

  constructor(
    readonly userId: string,
    readonly usage: CreditUsage,
    /** What was being bought, so the message can say "needs 3, you have 2". */
    readonly attempted?: { action: CreditAction; cost: number },
  ) {
    super(
      attempted
        ? `${attempted.action} costs ${attempted.cost} credits; user has ${usage.remaining} left`
        : `User has used ${usage.used} of ${usage.limit} credits`,
    );
  }
}
