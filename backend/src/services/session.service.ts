/** Creates, validates, and revokes opaque HTTP-only session cookies. */
import { createHash, randomBytes } from "node:crypto";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "../models/database.model";
import { AppError } from "../utils/errors";

export type AuthUser = Pick<User, "id" | "email" | "role" | "fullName" | "avatarUrl">;

const sessionCookieName = "find_my_tech_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

export function getSessionCookieName() {
  return sessionCookieName;
}

export function createSessionCookie(token: string, expiresAt?: Date) {
  const parts = [
    `${sessionCookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionMaxAgeSeconds}`
  ];

  if (expiresAt) {
    parts.push(`Expires=${expiresAt.toUTCString()}`);
  }

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createClearSessionCookie() {
  return [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : [])
  ].join("; ");
}

export function parseSessionCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${sessionCookieName}=`));
  if (!match) return null;

  const token = match.slice(sessionCookieName.length + 1);
  return token ? decodeURIComponent(token) : null;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });

  return { token, expiresAt };
}

export async function revokeSessionToken(token: string | null) {
  if (!token) return;

  await prisma.userSession.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export async function revokeOtherUserSessions(userId: string, activeToken: string) {
  await prisma.userSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      tokenHash: { not: hashSessionToken(activeToken) }
    },
    data: { revokedAt: new Date() }
  });
}

export async function getCurrentUser(cookieHeader?: string): Promise<AuthUser | null> {
  const token = parseSessionCookie(cookieHeader ?? null);
  if (!token) return null;

  const session = await prisma.userSession.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          avatarUrl: true
        }
      }
    }
  });

  return session?.user ?? null;
}

export async function requireCurrentUser(cookieHeader?: string) {
  const user = await getCurrentUser(cookieHeader);
  if (!user) {
    throw new AppError("Authentication required", 401, "unauthorized");
  }

  return user;
}

export function assertRole(user: Pick<AuthUser, "role">, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new AppError("Insufficient permissions", 403, "forbidden");
  }
}

export async function requireRole(cookieHeader: string | undefined, allowedRoles: UserRole[]) {
  const user = await requireCurrentUser(cookieHeader);
  assertRole(user, allowedRoles);
  return user;
}
