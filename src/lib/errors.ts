/**
 * Base class for errors the app knows how to handle. `code` is a stable,
 * machine-readable identifier that is safe to send to clients.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A required setting (e.g. YOUTUBE_API_KEY) is missing or invalid. */
export class ConfigError extends AppError {
  readonly code = "NOT_CONFIGURED";
}
