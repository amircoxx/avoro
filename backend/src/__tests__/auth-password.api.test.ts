import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/errors";

const session = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
  parseSessionCookie: vi.fn(),
  revokeOtherUserSessions: vi.fn()
}));
const password = vi.hoisted(() => ({ hashPassword: vi.fn(), verifyPassword: vi.fn() }));
const database = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } }
}));

vi.mock("../services/session.service", () => session);
vi.mock("../services/password.service", () => password);
vi.mock("../models/database.model", () => database);

import { app } from "../app";

type PasswordRequest = {
  set(name: string, value: string): PasswordRequest;
  send(body: unknown): Promise<{ status: number; body: unknown }>;
};

function passwordRequest(): PasswordRequest {
  return request(app).put("/api/auth/password") as unknown as PasswordRequest;
}

const user = {
  id: "user-1",
  email: "user@example.com",
  role: "CUSTOMER",
  fullName: "Avery",
  avatarUrl: null
};
const body = { currentPassword: "current password", newPassword: "new password 12345" };

describe("PUT /api/auth/password", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    session.requireCurrentUser.mockRejectedValue(
      new AppError("Authentication required", 401, "unauthorized")
    );

    const response = await passwordRequest().send(body);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "unauthorized", message: "Authentication required" }
    });
  });

  it("rejects an incorrect current password", async () => {
    session.requireCurrentUser.mockResolvedValue(user);
    database.prisma.user.findUnique.mockResolvedValue({ passwordHash: "stored-hash" });
    password.verifyPassword.mockResolvedValue(false);

    const response = await passwordRequest().send(body);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "invalid_current_password", message: "Current password is incorrect" }
    });
    expect(database.prisma.user.update).not.toHaveBeenCalled();
  });

  it("validates the new password length", async () => {
    session.requireCurrentUser.mockResolvedValue(user);

    const response = await passwordRequest().send({ ...body, newPassword: "short" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "validation_error" } });
    expect(database.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("stores a new hash, preserves the active session, and returns success", async () => {
    session.requireCurrentUser.mockResolvedValue(user);
    session.parseSessionCookie.mockReturnValue("active-token");
    database.prisma.user.findUnique.mockResolvedValue({ passwordHash: "stored-hash" });
    password.verifyPassword.mockResolvedValue(true);
    password.hashPassword.mockResolvedValue("new-hash");
    database.prisma.user.update.mockResolvedValue({ id: user.id });

    const response = await passwordRequest()
      .set("Cookie", "find_my_tech_session=active-token")
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { passwordChanged: true } });
    expect(password.verifyPassword).toHaveBeenCalledWith(body.currentPassword, "stored-hash");
    expect(database.prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { passwordHash: "new-hash" }
    });
    expect(session.revokeOtherUserSessions).toHaveBeenCalledWith(user.id, "active-token");
  });
});
