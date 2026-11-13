/** Runs only against an explicitly supplied disposable purchasing-test database. */
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
const enabled = Boolean(testUrl);
describe.skipIf(!enabled)("checkout PostgreSQL concurrency", () => {
  let db: PrismaClient;
  const userIds: string[] = [];
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });
  it("converges competing requests and enforces the partial unique index", async () => {
    const url = new URL(testUrl!);
    if (!url.pathname.startsWith("/checkout_test")) throw new Error("Use a dedicated checkout_test database");
    // Prevent the regular database loader from discovering .env.local.
    process.env.DATABASE_URL = testUrl;
    const { prisma } = await import("../database.model");
    db = prisma;
    const model = await import("../purchasing.model");
    const user = await db.user.create({ data: { email: `${randomUUID()}@checkout.test`, role: "TECH" } });
    userIds.push(user.id);
    const profile = await db.techProfile.create({ data: {
      userId: user.id, businessName: "Checkout test", displayName: "Checkout test", referralCode: randomUUID()
    } });
    const subs = await Promise.all(Array.from({ length: 8 }, () => model.ensureSubscription(profile.id)));
    expect(new Set(subs.map(s => s.id)).size).toBe(1);
    const sub = subs[0];
    const operations = await Promise.all(Array.from({ length: 8 }, (_, i) => model.getOrCreateCustomerCreation({
      subscriptionId: sub.id, email: `${i}@checkout.test`, userId: user.id, techProfileId: profile.id
    })));
    expect(new Set(operations.map(o => o.id)).size).toBe(1);
    expect(new Set(operations.map(o => o.email)).size).toBe(1);
    const customers = await Promise.all(Array.from({ length: 8 }, (_, i) => model.saveStripeCustomerId(sub.id, `cus_${i}`)));
    expect(new Set(customers.map(s => s.stripeCustomerId)).size).toBe(1);
    const data = {
      subscriptionId: sub.id, plan: "studio", interval: "monthly", stripePriceId: "price_test",
      stripeCustomerId: customers[0].stripeCustomerId!, userId: user.id,
      successUrl: "https://example.test/pricing", cancelUrl: "https://example.test/pricing"
    };
    const attempts = await Promise.all(Array.from({ length: 12 }, () => model.getOrCreateCheckoutAttempt(data)));
    expect(new Set(attempts.map(a => a.id)).size).toBe(1);
    expect(await db.checkoutAttempt.count({ where: { subscriptionId: sub.id } })).toBe(1);
    await expect(db.checkoutAttempt.create({ data })).rejects.toMatchObject({ code: "P2002", meta: { target: ["subscriptionId"] } });
    const saved = await Promise.all(Array.from({ length: 8 }, () => model.saveCheckoutAttemptSession(attempts[0].id, {
      sessionId: `cs_${randomUUID()}`, sessionUrl: "https://checkout.stripe.com/test", expiresAt: new Date()
    })));
    expect(saved.reduce((sum, s) => sum + s.count, 0)).toBe(1);
    const open = await model.findCheckoutAttemptById(attempts[0].id);
    await model.expireCheckoutAttempt(open!.id, open!.sessionId!);
    const next = await model.getOrCreateCheckoutAttempt(data);
    expect(next.id).not.toBe(open!.id);
    expect(await db.checkoutAttempt.count({ where: { subscriptionId: sub.id } })).toBe(2);
    await db.checkoutAttempt.update({ where: { id: next.id }, data: { state: "COMPLETED" } });
    expect(await model.saveCheckoutAttemptSession(next.id, { sessionId: "cs_late", sessionUrl: "https://checkout.stripe.com/test", expiresAt: new Date() })).toEqual({ count: 0 });
  });
});
