/** Normalizes expected domain and validation failures into the public API error envelope. */
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function toApiError(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      body: { error: { code: "validation_error", message: "Request validation failed", issues: error.flatten() } }
    };
  }
  if (isUserEmailConflict(error)) {
    return { status: 409, body: { error: { code: "email_taken", message: "An account with this email already exists" } } };
  }
  if (error instanceof Error && (error.name === "PrismaClientInitializationError" || error.message.includes("Can't reach database server"))) {
    return {
      status: 503,
      body: { error: { code: "database_unavailable", message: "Database is not reachable. Check DATABASE_URL and make sure the database is running." } }
    };
  }
  return { status: 500, body: { error: { code: "internal_error", message: "Something went wrong" } } };
}

function isUserEmailConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return error.meta?.modelName === "User" && Array.isArray(target) && target.includes("email");
}
