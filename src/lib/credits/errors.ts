import { AppError } from "@/lib/errors";
import type { CreditUsage } from "./types";

/** The user has spent all their credits; the upstream call was not made. */
export class CreditLimitError extends AppError {
  readonly code = "CREDIT_LIMIT_REACHED";

  constructor(
    readonly userId: string,
    readonly usage: CreditUsage,
  ) {
    super(`User has used ${usage.used} of ${usage.limit} credits`);
  }
}
