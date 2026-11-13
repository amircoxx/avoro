import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../services/password.service";
import { BrevoEmailClient } from "../services/email/brevo.client";

const databaseSuite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
databaseSuite("password reset HTTP and worker flow against isolated TEST_DATABASE_URL", () => {
  let db: PrismaClient | undefined;
  let app: express.Express;
  let processNext: typeof import("../services/email/password-reset-worker").processNextPasswordResetRequest;
  const email = `reset-flow-${randomUUID()}@example.com`;
  const send = vi.spyOn(BrevoEmailClient.prototype, "send").mockResolvedValue({ messageId: "test-only" });
  let userId: string;

  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error("RUN_DB_TESTS=1 requires a dedicated TEST_DATABASE_URL");
    const target = new URL(testUrl);
    if (!/(?:^|[_-])test(?:$|[_-])/.test(target.pathname.slice(1))) {
      throw new Error("The cooldown suite requires a database name containing a test marker");
    }
    if (process.env.DATABASE_URL) {
      const normal = new URL(process.env.DATABASE_URL);
      if (normal.hostname === target.hostname && normal.port === target.port &&
          normal.pathname === target.pathname &&
          normal.searchParams.get("host") === target.searchParams.get("host")) {
        throw new Error("TEST_DATABASE_URL must not point to the normal database");
      }
    }

    db = new PrismaClient({ datasourceUrl: testUrl });
    await db.$connect();
    // Substitute only the connection: queries and transactions remain real.
    // This avoids importing the app's normal database configuration entirely.
    vi.doMock("../models/database.model", () => ({ prisma: db }));

    vi.doMock("../config/env", () => ({ env: {
      BREVO_API_KEY: "test-only", BOOKING_EMAIL_FROM: "sender@example.com",
      APP_PUBLIC_URL: "https://example.com", FRONTEND_ORIGIN: "https://example.com"
    } }));
    const { authRouter } = await import("../routes/auth.routes");
    const { errorHandler } = await import("../middleware/error.middleware");
    ({ processNextPasswordResetRequest: processNext } = await import("../services/email/password-reset-worker"));
    app = express();
    app.use(express.json());
    // Trusted only within this private test app; production retains its real settings.
    app.set("trust proxy", "loopback");
    app.use("/auth", authRouter);
    app.use(errorHandler);
    const user = await db.user.create({ data: { email, passwordHash: await hashPassword("old-password-12345") } });
    userId = user.id;
  });

  afterAll(async () => {
    try {
      if (db) {
        await db.passwordResetRequest.deleteMany({ where: { email } });
        await db.passwordResetCooldown.deleteMany({ where: { email } });
        await db.passwordResetIpLimit.deleteMany({ where: { ip: "192.0.2.210" } });
        if (userId) await db.user.delete({ where: { id: userId } });
      }
    } finally {
      await db?.$disconnect();
      vi.restoreAllMocks();
      vi.doUnmock("../models/database.model");
      vi.doUnmock("../config/env");
    }
  });

  it("queues an email, consumes its link once, changes login credentials and revokes sessions", async () => {
    const login = await request(app).post("/auth/login").send({ email, password: "old-password-12345" });
    expect(login.status).toBe(200);
    const post = request(app).post("/auth/forgot-password") as unknown as {
      set(name: string, value: string): { send(body: unknown): Promise<{ status: number }> }
    };
    const queued = await post.set("X-Forwarded-For", "192.0.2.210").send({ email });
    expect(queued.status).toBe(200);
    await expect(processNext()).resolves.toBe("completed");
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0];
    expect(message.to).toEqual([{ email }]);
    const link = new URL(message.textContent.match(/https:\/\/\S+/)![0]);
    expect(link.pathname).toBe("/reset-password");
    const token = link.searchParams.get("token")!;
    const stored = await db!.passwordResetToken.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.tokenHash).not.toBe(token);
    const payload = { token, newPassword: "new-password-12345" };
    const reset = await request(app).post("/auth/reset-password").send(payload);
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ data: { passwordReset: true } });
    expect(await db!.passwordResetToken.count({ where: { userId } })).toBe(0);
    expect(await db!.userSession.count({ where: { userId, revokedAt: null } })).toBe(0);
    expect((await request(app).post("/auth/reset-password").send(payload)).status).toBe(400);
    expect((await request(app).post("/auth/login").send({ email, password: "old-password-12345" })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email, password: payload.newPassword })).status).toBe(200);
  });

  it("rejects expired links and only permits one concurrent use of a valid token", async () => {
    const expired = randomBytes(32).toString("hex");
    const live = randomBytes(32).toString("hex");
    await db!.passwordResetToken.createMany({ data: [
      { userId, tokenHash: createHash("sha256").update(expired).digest("hex"), expiresAt: new Date(Date.now() - 1000) },
      { userId, tokenHash: createHash("sha256").update(live).digest("hex"), expiresAt: new Date(Date.now() + 60000) }
    ] });
    expect((await request(app).post("/auth/reset-password").send({ token: expired, newPassword: "expired-password-12345" })).status).toBe(400);
    const results = await Promise.all([
      request(app).post("/auth/reset-password").send({ token: live, newPassword: "winner-password-12345" }),
      request(app).post("/auth/reset-password").send({ token: live, newPassword: "winner-password-12345" })
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
    const user = await db!.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword("winner-password-12345", user.passwordHash)).toBe(true);
    expect(await db!.passwordResetToken.count({ where: { userId } })).toBe(0);
  });
});
