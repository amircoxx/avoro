/** Defines the expected operational error type and a safe unknown-value guard. */
export type AppErrorDetails = Record<string, string | number>;

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = "bad_request",
    public readonly details?: AppErrorDetails
  ) {
    super(message);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
