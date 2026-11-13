import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn()
}));
vi.mock("../purchasing/stripe.client", () => ({
  stripe: { webhooks: { constructEvent: mocks.constructEvent } }
}));
vi.mock("../../models/database.model", () => ({ prisma: {
  subscription: { findUnique: mocks.findUnique, updateMany: mocks.updateMany }
} }));
import { stripeWebhookHandler } from "../../controllers/stripe-webhook.controller";

const subscription = {
  id: "sub_1", customer: "cus_1", status: "incomplete",
  metadata: { subscriptionId: "local-subscription" }
};
const saved = {
  id: "local-subscription", stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1", stripeStatus: "active", status: "FREE"
};

function handle(overrides: object = {}) {
  mocks.constructEvent.mockReturnValue({
    type: "customer.subscription.created", data: { object: { ...subscription, ...overrides } }
  });
  const response = { status: vi.fn().mockReturnThis(), send: vi.fn(), sendStatus: vi.fn() };
  const result = stripeWebhookHandler(
    { get: () => "signature", body: Buffer.from("payload") } as unknown as Request,
    response as unknown as Response, vi.fn()
  );
  return { result, response };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-secret");
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findUnique.mockResolvedValue(saved);
});
afterEach(() => vi.unstubAllEnvs());

describe("created subscription webhook", () => {
  it.each(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"])(
    "records %s without changing application access", async (status) => {
      const { result, response } = handle({ status });
      await result;
      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: {
          id: "local-subscription", stripeCustomerId: "cus_1", stripeStatus: null,
          OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_1" }]
        },
        data: { stripeSubscriptionId: "sub_1", stripeStatus: status }
      });
      expect(response.sendStatus).toHaveBeenCalledWith(200);
    }
  );

  it("extracts an expanded customer ID", async () => {
    const { result, response } = handle({ customer: { id: "cus_1" } });
    await result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ stripeCustomerId: "cus_1" })
    }));
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it.each([{ metadata: {} }, { id: "" }, { customer: null }, { status: undefined }])(
    "rejects missing required event data", async (overrides) => {
      const { result, response } = handle(overrides);
      await result;
      expect(response.status).toHaveBeenCalledWith(400);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    }
  );

  it.each(["incomplete", "active", "canceled"])(
    "acknowledges an initialized %s record without overwriting it", async (stripeStatus) => {
      mocks.updateMany.mockResolvedValue({ count: 0 });
      mocks.findUnique.mockResolvedValue({ ...saved, stripeStatus });
      const { result, response } = handle();
      await result;
      expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "local-subscription" } });
      expect(mocks.updateMany).toHaveBeenCalledTimes(1);
      expect(response.sendStatus).toHaveBeenCalledWith(200);
    }
  );

  it("rejects an unknown local subscription", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue(null);
    await expect(handle().result).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    { stripeCustomerId: "cus_other" },
    { stripeSubscriptionId: "sub_other" },
    { stripeSubscriptionId: null },
    { stripeStatus: null }
  ])("rejects conflicting or uninitialized records after a failed write", async (overrides) => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ ...saved, ...overrides });
    const { result, response } = handle();
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(response.sendStatus).not.toHaveBeenCalled();
  });

  it("propagates database errors without acknowledging success", async () => {
    const error = new Error("Database unavailable");
    mocks.updateMany.mockRejectedValue(error);
    const { result, response } = handle();
    await expect(result).rejects.toBe(error);
    expect(response.sendStatus).not.toHaveBeenCalled();
  });
});
