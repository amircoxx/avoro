import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const prisma = vi.hoisted(() => ({
  checkoutAttempt: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  stripeCustomerCreation: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
  subscription: { upsert: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() }
}));
vi.mock("../database.model", () => ({ prisma }));
import { getOrCreateCheckoutAttempt, getOrCreateCustomerCreation, saveStripeCustomerId, saveCheckoutAttemptSession } from "../purchasing.model";
const data = {
  subscriptionId: "sub-local", plan: "studio", interval: "monthly", stripePriceId: "price-1",
  stripeCustomerId: "cus-1", userId: "user-1", successUrl: "https://app.test/return", cancelUrl: "https://app.test/pricing"
};
function conflict(target: unknown) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "6.19.3", meta: { target } });
}
beforeEach(() => vi.resetAllMocks());
describe("checkout model conflict recovery", () => {
  it.each([["subscriptionId"], "CheckoutAttempt_one_active_per_subscription"])("reloads the winner for target %j", async (target) => {
    prisma.checkoutAttempt.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner", ...data });
    prisma.checkoutAttempt.create.mockRejectedValue(conflict(target));
    await expect(getOrCreateCheckoutAttempt(data)).resolves.toMatchObject({ id: "winner" });
    expect(prisma.checkoutAttempt.create).toHaveBeenCalledTimes(1);
  });
  it("does not swallow an unrelated uniqueness error", async () => {
    const error = conflict(["sessionId"]);
    prisma.checkoutAttempt.findFirst.mockResolvedValue(null);
    prisma.checkoutAttempt.create.mockRejectedValue(error);
    await expect(getOrCreateCheckoutAttempt(data)).rejects.toBe(error);
  });
  it("preserves database outages", async () => {
    const error = new Error("database unavailable");
    prisma.checkoutAttempt.findFirst.mockResolvedValue(null);
    prisma.checkoutAttempt.create.mockRejectedValue(error);
    await expect(getOrCreateCheckoutAttempt(data)).rejects.toBe(error);
  });
  it("bounds retries when the winning attempt repeatedly becomes terminal", async () => {
    prisma.checkoutAttempt.findFirst.mockResolvedValue(null);
    prisma.checkoutAttempt.create.mockRejectedValue(conflict(["subscriptionId"]));
    await expect(getOrCreateCheckoutAttempt(data)).rejects.toMatchObject({ code: "P2002" });
    expect(prisma.checkoutAttempt.create).toHaveBeenCalledTimes(3);
  });
  it("recovers the same persisted customer operation from a competing insert", async () => {
    const operation = { id: "op-1", email: "original@example.test" };
    prisma.stripeCustomerCreation.findUnique.mockResolvedValue(null);
    prisma.stripeCustomerCreation.create.mockRejectedValue(conflict(["subscriptionId"]));
    prisma.stripeCustomerCreation.findUniqueOrThrow.mockResolvedValue(operation);
    await expect(getOrCreateCustomerCreation({ subscriptionId: "sub-local", email: "new@example.test", userId: "u", techProfileId: "t" })).resolves.toBe(operation);
  });
  it("never overwrites an existing customer", async () => {
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    prisma.subscription.findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: "cus-winner" });
    await expect(saveStripeCustomerId("sub-local", "cus-loser")).resolves.toMatchObject({ stripeCustomerId: "cus-winner" });
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({ where: { id: "sub-local", stripeCustomerId: null }, data: { stripeCustomerId: "cus-loser" } });
  });
  it("does not reopen a terminal attempt", async () => {
    prisma.checkoutAttempt.updateMany.mockResolvedValue({ count: 0 });
    await expect(saveCheckoutAttemptSession("attempt-1", { sessionId: "cs-1", sessionUrl: "https://checkout.stripe.com/test", expiresAt: new Date() })).resolves.toEqual({ count: 0 });
    expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "attempt-1", state: "CREATING", sessionId: null } }));
  });
});
