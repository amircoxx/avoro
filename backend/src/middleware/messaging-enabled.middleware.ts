/** Hides messaging operations until the server-owned feature flag is enabled. */
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

export function requireMessagingEnabled(_request: Request, _response: Response, next: NextFunction) {
  if (!env.MESSAGING_ENABLED) {
    next(new AppError("Route not found", 404, "not_found"));
    return;
  }
  next();
}
