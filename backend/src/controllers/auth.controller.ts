/** HTTP adapters for account registration, session lifecycle, and account updates. */
import { prisma } from "../models/database.model";
import { hashPassword, verifyPassword } from "../services/password.service";
import { requestPasswordReset } from "../services/forgot-password.service";
import { completePasswordResetService } from "../services/reset-password.service";
import { createClearSessionCookie, createSession, createSessionCookie, getCurrentUser, parseSessionCookie, revokeOtherUserSessions, revokeSessionToken, requireCurrentUser } from "../services/session.service";
import { accountUpdateInputSchema, loginInputSchema, passwordChangeInputSchema, registerInputSchema, forgotPasswordInputSchema, resetPasswordInputSchema } from "../validations/auth.schema";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";

export async function register(request: Request, response: Response, next: NextFunction) {
  try {
    const input = registerInputSchema.parse(request.body);
    const user = await prisma.user.create({ data: { email: input.email, passwordHash: await hashPassword(input.password), role: input.role, fullName: input.fullName }, select: userSelect });
    const session = await createSession(user.id);
    response.setHeader("Set-Cookie", createSessionCookie(session.token, session.expiresAt));
    response.status(201).json({ data: { user } });
  } catch (error) { next(error); }
}

export async function login(request: Request, response: Response, next: NextFunction) {
  try {
    const input = loginInputSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, select: { ...userSelect, passwordHash: true } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError("Invalid email or password", 401, "invalid_credentials");
    const session = await createSession(user.id);
    response.setHeader("Set-Cookie", createSessionCookie(session.token, session.expiresAt));
    response.json({ data: { user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, avatarUrl: user.avatarUrl } } });
  } catch (error) { next(error); }
}

export async function logout(request: Request, response: Response, next: NextFunction) {
  try {
    await revokeSessionToken(parseSessionCookie(request.headers.cookie ?? null));
    response.setHeader("Set-Cookie", createClearSessionCookie());
    response.json({ data: { signedOut: true } });
  } catch (error) { next(error); }
}

export async function me(request: Request, response: Response, next: NextFunction) {
  try { response.json({ data: { user: await getCurrentUser(request.headers.cookie) } }); } catch (error) { next(error); }
}

export async function updateAccount(request: Request, response: Response, next: NextFunction) {
  try {
    const currentUser = await requireCurrentUser(request.headers.cookie);
    const input = accountUpdateInputSchema.parse(request.body);
    const user = await prisma.user.update({ where: { id: currentUser.id }, data: input, select: userSelect });
    response.json({ data: { user } });
  } catch (error) { next(error); }
}

export async function changePassword(request: Request, response: Response, next: NextFunction) {
  try {
    const currentUser = await requireCurrentUser(request.headers.cookie);
    const input = passwordChangeInputSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { passwordHash: true } });
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError("Current password is incorrect", 401, "invalid_current_password");
    }
    const activeToken = parseSessionCookie(request.headers.cookie ?? null);
    if (!activeToken) throw new AppError("Authentication required", 401, "unauthorized");
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { passwordHash: await hashPassword(input.newPassword) }
    });
    await revokeOtherUserSessions(currentUser.id, activeToken);
    response.json({ data: { passwordChanged: true } });
  } catch (error) { next(error); }
}

export async function forgotPassword(request: Request, response: Response, next: NextFunction) {
  try {
    const input = forgotPasswordInputSchema.parse(request.body);
    await requestPasswordReset(input.email, request.ip);
    response.json({ data: { message: "If an account with that email exists, you will receive a password reset link." } });
  } catch (error) { next(error); }
}

export async function completePasswordReset(request: Request, response: Response, next: NextFunction) {
  try {
    const input = resetPasswordInputSchema.parse(request.body);
    await completePasswordResetService(input.token, input.newPassword);
    response.json({ data: { passwordReset: true } });
  } catch (error) { next(error); }
}

const userSelect = { id: true, email: true, role: true, fullName: true, avatarUrl: true } as const;
