import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
import { authRouter } from "../routes/auth.routes";
import { errorHandler } from "../middleware/error.middleware";
import { consumePasswordResetIpLimit } from "../models/password-reset-ip-limit.model";
import { createPasswordResetRequest } from "../models/password-reset-request.model";

vi.mock("../models/database.model", () => ({ prisma: {} }));
vi.mock("../services/session.service", () => ({}));
vi.mock("../services/reset-password.service", () => ({}));
vi.mock("../models/password-reset-ip-limit.model", () => ({ consumePasswordResetIpLimit: vi.fn() }));
vi.mock("../models/password-reset-request.model", () => ({ createPasswordResetRequest: vi.fn() }));

// The repository's minimal Supertest declaration omits headers and .set().
type HttpResult = { status: number; headers: Record<string, string>; body: { error: { code: string }; data: { message: string } } };
type HttpRequest = { set(name: string, value: string): HttpRequest; send(body: unknown): Promise<HttpResult> };
const http = request as unknown as (app: express.Express) => { post(path: string): HttpRequest };

const app = express();
app.use(express.json());
app.use("/auth", authRouter);
app.use(errorHandler);
beforeEach(() => vi.resetAllMocks());

it("returns 429 and Retry-After without queuing a reset", async () => {
  vi.mocked(consumePasswordResetIpLimit).mockResolvedValue(120);
  const response = await http(app).post("/auth/forgot-password").send({ email: "user@example.com" });
  expect(response.status).toBe(429);
  expect(response.headers["retry-after"]).toBe("120");
  expect(response.body.error.code).toBe("rate_limited");
  expect(createPasswordResetRequest).not.toHaveBeenCalled();
});

it("ignores a spoofed forwarded IP and preserves the neutral response", async () => {
  vi.mocked(consumePasswordResetIpLimit).mockResolvedValue(0);
  vi.mocked(createPasswordResetRequest).mockResolvedValue(false);
  const response = await http(app).post("/auth/forgot-password")
    .set("X-Forwarded-For", "192.0.2.55").send({ email: "user@example.com" });
  expect(response.status).toBe(200);
  expect(response.body.data.message).toBe("If an account with that email exists, you will receive a password reset link.");
  expect(consumePasswordResetIpLimit).toHaveBeenCalledTimes(1);
  expect(vi.mocked(consumePasswordResetIpLimit).mock.calls[0][0]).not.toBe("192.0.2.55");
});
