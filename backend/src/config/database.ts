/** Creates the process-wide Prisma client using the backend environment policy. */
import { PrismaClient } from "@prisma/client";
import { loadLocalEnv } from "./load-local-env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

loadLocalEnv();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
