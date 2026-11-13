import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), transaction: vi.fn()
}));
vi.mock("../../models/database.model", () => ({ prisma: {
  checkoutAttempt: { findUnique: db.findUnique },
  $transaction: db.transaction
} }));
import { checkoutSessionCompleted } from "../purchasing/stripe-webhook.service";

const input = {
  checkoutAttemptId: "attempt-1", stripeSessionId: "cs_1",
  stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1"
};
const attempt = () => ({
  id: "attempt-1", sessionId: "cs_1", stripeCustomerId: "cus_1",
  subscriptionId: "local-subscription", subscription: { stripeSubscriptionId: null as string | null }
});

beforeEach(() => {
  vi.resetAllMocks();
  db.findUnique.mockResolvedValue(attempt());
  db.update.mockResolvedValue({ ...attempt(), state: "COMPLETED" });
  db.updateMany.mockResolvedValue({ count: 1 });
  db.transaction.mockImplementation(async (run) => run({
    checkoutAttempt: { update: db.update }, subscription: { updateMany: db.updateMany }
  }));
});

describe("completed checkout validation", () => {
  it.each([null, "sub_1"])("accepts an empty or matching Stripe association (%s)", async (savedId) => {
    db.findUnique.mockResolvedValue({ ...attempt(), subscription: { stripeSubscriptionId: savedId } });
    await expect(checkoutSessionCompleted(input)).resolves.toBeUndefined();
    expect(db.update).toHaveBeenCalledWith({ where: { id: "attempt-1" }, data: { state: "COMPLETED" } });
    expect(db.updateMany).toHaveBeenCalledWith({
      where: { id: "local-subscription", stripeCustomerId: "cus_1", OR: [
        { stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_1" }
      ] }, data: { stripeSubscriptionId: "sub_1" }
    });
  });

  it("rejects a missing attempt before writing", async () => {
    db.findUnique.mockResolvedValue(null);
    await expect(checkoutSessionCompleted(input)).rejects.toMatchObject({ status: 404 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["sessionId", "cs_other", "Stripe session ID does not match the checkout attempt"],
    ["stripeCustomerId", "cus_other", "Stripe customer ID does not match the checkout attempt"]
  ])("rejects a mismatched %s before writing", async (field, value, message) => {
    db.findUnique.mockResolvedValue({ ...attempt(), [field]: value });
    await expect(checkoutSessionCompleted(input)).rejects.toThrow(message);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects a different saved Stripe subscription before writing", async () => {
    db.findUnique.mockResolvedValue({ ...attempt(), subscription: { stripeSubscriptionId: "sub_other" } });
    await expect(checkoutSessionCompleted(input)).rejects.toThrow("Stripe subscription ID does not match the saved subscription");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("propagates a conflicting conditional write out of the transaction", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });
    await expect(checkoutSessionCompleted(input)).rejects.toThrow("Failed to update subscription with Stripe subscription ID");
  });

  it("propagates database failures", async () => {
    const error = new Error("Database unavailable");
    db.findUnique.mockRejectedValue(error);
    await expect(checkoutSessionCompleted(input)).rejects.toBe(error);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
