import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const databaseSuite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

databaseSuite("password reset cooldown against isolated TEST_DATABASE_URL", () => {
  let db: PrismaClient | undefined;
  let createRequest: typeof import("../models/password-reset-request.model").createPasswordResetRequest;
  const emails: string[] = [];
  const ips: string[] = [];
  let consumeIp: typeof import("../models/password-reset-ip-limit.model").consumePasswordResetIpLimit;

  function fixtureEmail() {
    const email = `cooldown-${randomUUID()}@example.com`;
    emails.push(email);
    return email;
  }

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
    ({ consumePasswordResetIpLimit: consumeIp } = await import("../models/password-reset-ip-limit.model"));
    ({ createPasswordResetRequest: createRequest } = await import("../models/password-reset-request.model"));
  });

  afterAll(async () => {
    try {
      if (db && ips.length) await db.passwordResetIpLimit.deleteMany({ where: { ip: { in: ips } } });
      if (db && emails.length) {
        await db.passwordResetRequest.deleteMany({ where: { email: { in: emails } } });
        await db.passwordResetCooldown.deleteMany({ where: { email: { in: emails } } });
      }
    } finally {
      await db?.$disconnect();
      vi.doUnmock("../models/database.model");
    }
  });

  it("queues the first request and establishes a 60-second cooldown", async () => {
    const email = fixtureEmail();
    const before = Date.now();
    await expect(createRequest(email)).resolves.toBe(true);
    const after = Date.now();

    expect(await db!.passwordResetRequest.count({ where: { email } })).toBe(1);
    const cooldown = await db!.passwordResetCooldown.findUniqueOrThrow({ where: { email } });
    expect(cooldown.nextAllowedAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(cooldown.nextAllowedAt.getTime()).toBeLessThanOrEqual(after + 60_000);
  });

  it("skips repeated requests without extending the cooldown", async () => {
    const email = fixtureEmail();
    await createRequest(email);
    const before = await db!.passwordResetCooldown.findUniqueOrThrow({ where: { email } });

    await expect(createRequest(email)).resolves.toBe(false);
    await expect(createRequest(email)).resolves.toBe(false);

    const after = await db!.passwordResetCooldown.findUniqueOrThrow({ where: { email } });
    expect(after.nextAllowedAt).toEqual(before.nextAllowedAt);
    expect(await db!.passwordResetRequest.count({ where: { email } })).toBe(1);
  });

  it("allows another request after the cooldown expires", async () => {
    const email = fixtureEmail();
    await createRequest(email);
    await db!.passwordResetCooldown.update({
      where: { email }, data: { nextAllowedAt: new Date(Date.now() - 1_000) }
    });

    await expect(createRequest(email)).resolves.toBe(true);
    expect(await db!.passwordResetRequest.count({ where: { email } })).toBe(2);
    await expect(createRequest(email)).resolves.toBe(false);
  });

  it.each(["new", "expired"])("allows one winner for concurrent requests with a %s cooldown", async (state) => {
    const email = fixtureEmail();
    if (state === "expired") {
      await db!.passwordResetCooldown.create({
        data: { email, nextAllowedAt: new Date(Date.now() - 1_000) }
      });
    }

    // Settle every request before cleanup, including if one unexpectedly fails.
    const results = await Promise.allSettled([
      createRequest(email), createRequest(email), createRequest(email), createRequest(email)
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const values = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    expect(values.filter(Boolean)).toHaveLength(1);
    expect(values.filter((value) => !value)).toHaveLength(3);
    expect(await db!.passwordResetRequest.count({ where: { email } })).toBe(1);
    expect(await db!.passwordResetCooldown.count({ where: { email } })).toBe(1);
  });

  it("rolls back a cooldown change when PostgreSQL rejects the job insertion", async () => {
    const email = fixtureEmail();
    const expiredAt = new Date(Date.now() - 1_000);
    await db!.passwordResetCooldown.create({ data: { email, nextAllowedAt: expiredAt } });
    const constraint = `cooldown_reject_${randomUUID().replaceAll("-", "")}`;

    // Both interpolated values are generated here from UUIDs, never user input.
    // Reject only this fixture's email, and remove the fault even on assertion failure.
    await db!.$executeRawUnsafe(
      `ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "${constraint}" CHECK ("email" <> '${email}')`
    );
    try {
      await expect(createRequest(email)).rejects.toThrow(constraint);
      expect(await db!.passwordResetRequest.count({ where: { email } })).toBe(0);
      const cooldown = await db!.passwordResetCooldown.findUniqueOrThrow({ where: { email } });
      expect(cooldown.nextAllowedAt).toEqual(expiredAt);
    } finally {
      await db!.$executeRawUnsafe(`ALTER TABLE "PasswordResetRequest" DROP CONSTRAINT "${constraint}"`);
    }

    // The rolled-back cooldown does not prevent a later successful request.
    await expect(createRequest(email)).resolves.toBe(true);
    expect(await db!.passwordResetRequest.count({ where: { email } })).toBe(1);
  });
  it("allows five requests, blocks the sixth without extending the window, and isolates IPs", async () => {
    const ip = "192.0.2.101";
    ips.push(ip, "192.0.2.102");
    for (let i = 0; i < 5; i++) expect(await consumeIp(ip)).toBe(0);
    const before = await db!.passwordResetIpLimit.findUniqueOrThrow({ where: { ip } });
    expect(await consumeIp(ip)).toBeGreaterThan(0);
    expect(await consumeIp(ip)).toBeLessThanOrEqual(900);
    expect(await consumeIp("192.0.2.102")).toBe(0);
    const after = await db!.passwordResetIpLimit.findUniqueOrThrow({ where: { ip } });
    expect(after.windowStartedAt).toEqual(before.windowStartedAt);
  });

  it.each(["new", "expired"])("admits exactly five concurrent requests for a %s IP window", async (state) => {
    const ip = state === "new" ? "192.0.2.103" : "192.0.2.104";
    ips.push(ip);
    if (state === "expired") await db!.passwordResetIpLimit.create({
      data: { ip, requestCount: 6, windowStartedAt: new Date(Date.now() - 901_000) }
    });
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => consumeIp(ip)));
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    const values = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    expect(values.filter(value => value === 0)).toHaveLength(5);
    expect(values.filter(value => value > 0)).toHaveLength(7);
  });

});
