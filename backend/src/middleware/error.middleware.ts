/** Converts missing routes and domain errors into the API's stable JSON response shape. */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { toApiError } from "../utils/api-response";

export function notFoundHandler(_request: Request, response: Response) {
  response.status(404).json({
    error: { code: "not_found", message: "Route not found" }
  });
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction
) {
  const mapped = toApiError(error);
  if (mapped.status === 500) console.error("request.failed", safeErrorFields(error, request));
  const retryAfterSeconds = error instanceof Error && "details" in error &&
    typeof error.details === "object" && error.details !== null &&
    "retryAfterSeconds" in error.details && typeof error.details.retryAfterSeconds === "number"
    ? error.details.retryAfterSeconds
    : undefined;
  if (retryAfterSeconds !== undefined && Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0) {
    response.setHeader("Retry-After", String(retryAfterSeconds));
  }
  response.status(mapped.status).json(mapped.body);
}

function safeErrorFields(error: unknown, request: Request) {
  const requestId = randomUUID();
  const method = /^[A-Z]{3,10}$/.test(request.method) ? request.method : "UNKNOWN";
  const configuredRoute = typeof request.route?.path === "string" ? request.route.path : "unmatched";
  const route = /^[A-Za-z0-9_/:.*?()-]{1,256}$/.test(configuredRoute) ? configuredRoute : "unmatched";
  const allowedErrorClasses = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "AppError",
    "PrismaClientKnownRequestError",
    "PrismaClientUnknownRequestError",
    "PrismaClientInitializationError"
  ]);
  const errorClass = error instanceof Error && allowedErrorClasses.has(error.name) ? error.name : "UnknownError";
  const rawCode = error instanceof Error && "code" in error ? error.code : undefined;
  const code = typeof rawCode === "string" && /^(?:P\d{4}|[a-z][a-z0-9_]{0,63})$/.test(rawCode)
    ? rawCode
    : "internal_error";
  return { requestId, route: `${method} ${route}`, errorClass, code };
}
