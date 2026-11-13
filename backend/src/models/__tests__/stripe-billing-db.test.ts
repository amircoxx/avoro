/** Opt-in concurrency checks; never use the application's normal database. */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
suite("billing version updates on an isolated test database", () => {
  let db: PrismaClient;
  let model: typeof import("../stripe-webhook.model");
  let userId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("A dedicated TEST_DATABASE_URL is required");
    const target = new URL(url);
    if (!/(?:^|[_-])test(?:$|[_-])/.test(target.pathname.slice(1))) {
      throw new Error("Use an isolated database with a test marker in its name");
    }
    if (process.env.DATABASE_URL) {
      const normal = new URL(process.env.DATABASE_URL);
      if (normal.hostname === target.hostname && normal.port === target.port && normal.pathname === target.pathname) {
        throw new Error("TEST_DATABASE_URL must not point to the normal database");
      }
    }
    db = new PrismaClient({ datasourceUrl: url });
    vi.doMock("../database.model", () => ({ prisma: db }));
    model = await import("../stripe-webhook.model");
    userId = randomUUID();
    await db.user.create({ data: { id: userId, email: `${userId}@billing.test`, role: "TECH" } });
    const profile = await db.techProfile.create({ data: {
      userId, businessName: "Billing test", displayName: "Billing test", referralCode: randomUUID()
    } });
    const subscription = await db.subscription.create({ data: {
      techProfileId: profile.id, stripeCustomerId: "cus_billing_test", stripeSubscriptionId: "sub_billing_test"
    } });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (userId) await db.user.deleteMany({ where: { id: userId } });
    } finally { await db.$disconnect(); }
  });

  it("allows one writer per version and rejects a late activation after cancellation", async () => {
    const identity = { subscriptionId, stripeCustomerId: "cus_billing_test", stripeSubscriptionId: "sub_billing_test" };
    const active = {
      stripeStatus: "active", status: "ACTIVE" as const, currentPeriodEnd: new Date("2033-01-01"),
      cancelAtPeriodEnd: false, cancelAt: null
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => model.saveSubscriptionBillingState(identity, 0, active)));
    expect(results.reduce((total, result) => total + result.count, 0)).toBe(1);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } })).billingVersion).toBe(1);

    await expect(model.saveSubscriptionBillingState(identity, 1, {
      ...active, stripeStatus: "canceled", status: "CANCELED", currentPeriodEnd: null
    })).resolves.toEqual({ count: 1 });
    await expect(model.saveSubscriptionBillingState(identity, 1, active)).resolves.toEqual({ count: 0 });
    await expect(model.saveSubscriptionBillingState({ ...identity, stripeCustomerId: "cus_other" }, 2, active)).resolves.toEqual({ count: 0 });
    const final = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    expect(final).toMatchObject({ status: "CANCELED", billingVersion: 2, freeMonthCredits: 0 });
  });
});
