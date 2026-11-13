import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripePrices } from "../../config/stripe-prices";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(), retrieveSubscription: vi.fn(), retrieveInvoice: vi.fn(),
  findUnique: vi.fn(), updateMany: vi.fn()
}));
vi.mock("../purchasing/stripe.client", () => ({ stripe: {
  webhooks: { constructEvent: mocks.constructEvent },
  subscriptions: { retrieve: mocks.retrieveSubscription },
  invoices: { retrieve: mocks.retrieveInvoice }
} }));
vi.mock("../../models/database.model", () => ({ prisma: {
  subscription: { findUnique: mocks.findUnique, updateMany: mocks.updateMany }
} }));
import { stripeWebhookHandler } from "../../controllers/stripe-webhook.controller";

const periodEnd = 2000000000;
const invoice = () => ({
  id: "in_1", customer: "cus_1", status: "paid", amount_paid: 0,
  parent: { type: "subscription_details", subscription_details: {
    subscription: "sub_1", metadata: { subscriptionId: "local-1" }
  } }
});
const subscription = () => ({
  id: "sub_1", customer: "cus_1", metadata: { subscriptionId: "local-1" },
  status: "active", cancel_at_period_end: false, cancel_at: null,
  latest_invoice: invoice(),
  items: { has_more: false, data: [{
    quantity: 1, price: { id: stripePrices.studio.monthly }, current_period_end: periodEnd
  }] }
});
const saved = () => ({
  id: "local-1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
  stripeStatus: "incomplete", status: "FREE", billingVersion: 0,
  plan: null, interval: null, stripePriceId: null, cancelAt: null,
  cancelAtPeriodEnd: false, currentPeriodEnd: null
});

function handle(type = "customer.subscription.updated", object: object = subscription()) {
  mocks.constructEvent.mockReturnValue({ type, data: { object } });
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
  mocks.findUnique.mockResolvedValue(saved());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.retrieveSubscription.mockResolvedValue(subscription());
  mocks.retrieveInvoice.mockResolvedValue(invoice());
});
afterEach(() => vi.unstubAllEnvs());

describe("failed invoice webhook", () => {
  const failedInvoice = () => ({ ...invoice(), status: "open" });

  beforeEach(() => {
    mocks.retrieveInvoice.mockResolvedValue(failedInvoice());
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), status: "past_due", latest_invoice: failedInvoice() });
  });

  it("verifies the invoice and records the current overdue status before acknowledging", async () => {
    const { result, response } = handle("invoice.payment_failed", failedInvoice());
    await result;
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith("in_1");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "local-1", billingVersion: 0 }),
      data: expect.objectContaining({ status: "PAST_DUE", stripeStatus: "past_due" })
    }));
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("does not revoke recovered access when an old failure arrives after payment", async () => {
    mocks.retrieveInvoice.mockResolvedValue(invoice());
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    await handle("invoice.payment_failed", failedInvoice()).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }));
  });

  it("keeps an incomplete initial subscription free rather than forcing past due", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), status: "incomplete", latest_invoice: failedInvoice() });
    await handle("invoice.payment_failed", failedInvoice()).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FREE", stripeStatus: "incomplete" }) }));
  });

  it("acknowledges one-off invoice failures without subscription work", async () => {
    const { result, response } = handle("invoice.payment_failed", { ...failedInvoice(), parent: null });
    await result;
    expect(response.sendStatus).toHaveBeenCalledWith(200);
    expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("accepts expanded references and resolves missing metadata from Stripe", async () => {
    const expanded = { ...failedInvoice(), customer: { id: "cus_1" }, parent: { subscription_details: {
      subscription: { id: "sub_1" }, metadata: null
    } } };
    mocks.retrieveInvoice.mockResolvedValue(expanded);
    await handle("invoice.payment_failed", expanded).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "local-1" }) }));
  });

  it.each([{ id: "" }, { customer: null }, { parent: { subscription_details: { subscription: null } } }])(
    "rejects missing identifiers", async (overrides) => {
      const { result, response } = handle("invoice.payment_failed", { ...failedInvoice(), ...overrides });
      await result;
      expect(response.status).toHaveBeenCalledWith(400);
      expect(mocks.retrieveInvoice).not.toHaveBeenCalled();
    }
  );

  it.each([{ id: "in_other" }, { customer: "cus_other" }, { parent: null }])(
    "rejects a mismatched retrieved invoice", async (overrides) => {
      mocks.retrieveInvoice.mockResolvedValue({ ...failedInvoice(), ...overrides });
      const { result, response } = handle("invoice.payment_failed", failedInvoice());
      await expect(result).rejects.toMatchObject({ status: 409 });
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(response.sendStatus).not.toHaveBeenCalled();
    }
  );

  it("acknowledges repeated failures after cancellation without reactivating", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved(), status: "CANCELED", stripeStatus: "canceled" });
    for (let delivery = 0; delivery < 2; delivery++) {
      const { result, response } = handle("invoice.payment_failed", failedInvoice());
      await result;
      expect(response.sendStatus).toHaveBeenCalledWith(200);
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["retrieveInvoice", "retrieveSubscription", "updateMany"] as const)(
    "propagates %s failures without acknowledging", async (method) => {
      const error = new Error("Temporary failure");
      mocks[method].mockRejectedValue(error);
      const { result, response } = handle("invoice.payment_failed", failedInvoice());
      await expect(result).rejects.toBe(error);
      expect(response.sendStatus).not.toHaveBeenCalled();
    }
  );
});

describe("billing lifecycle", () => {
  it("saves the current paid plan, period, cancellation, and version atomically", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), cancel_at_period_end: true, cancel_at: periodEnd });
    const { result, response } = handle();
    await result;
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_1", { expand: ["latest_invoice"] });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "local-1", stripeCustomerId: "cus_1", billingVersion: 0,
        OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: "sub_1" }] },
      data: {
        stripeSubscriptionId: "sub_1", stripeStatus: "active", status: "ACTIVE",
        plan: "studio", interval: "monthly", stripePriceId: stripePrices.studio.monthly,
        currentPeriodEnd: new Date(periodEnd * 1000), cancelAtPeriodEnd: true,
        cancelAt: new Date(periodEnd * 1000), billingVersion: { increment: 1 }
      }
    });
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it.each([
    ["trialing", "TRIALING"], ["past_due", "PAST_DUE"], ["canceled", "CANCELED"],
    ["unpaid", "FREE"], ["paused", "FREE"], ["incomplete", "FREE"], ["incomplete_expired", "CANCELED"]
  ])("maps current %s to %s", async (stripeStatus, status) => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), status: stripeStatus });
    await handle().result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeStatus, status }) }));
  });

  it("uses current Stripe state instead of an older event snapshot", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), status: "past_due" });
    await handle().result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }));
  });

  it.each([null, { ...invoice(), status: "open" }])("does not activate without a paid latest invoice", async (latest_invoice) => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), latest_invoice });
    await handle().result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FREE" }) }));
  });

  it("fetches a latest invoice when Stripe does not expand it", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), latest_invoice: "in_1" });
    await handle().result;
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith("in_1");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }));
  });

  it("synchronizes plan changes using the price rather than metadata", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), items: { has_more: false, data: [
      { quantity: 1, price: { id: stripePrices.signature.yearly }, current_period_end: periodEnd }
    ] } });
    await handle().result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: "signature", interval: "yearly" }) }));
  });

  it.each([
    { has_more: false, data: [{ quantity: 1, price: { id: "price_unknown" }, current_period_end: periodEnd }] },
    { has_more: false, data: [] },
    { has_more: true, data: subscription().items.data },
    { has_more: false, data: [{ ...subscription().items.data[0], current_period_end: 1 }] },
    { has_more: false, data: [{ ...subscription().items.data[0], quantity: 2 }] }
  ])("does not grant active access for unsupported or expired items", async (items) => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), items });
    await handle().result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FREE" }) }));
  });

  it.each([{ customer: "cus_other" }, { metadata: { subscriptionId: "other" } }, { id: "sub_other" }])(
    "rejects a mismatched retrieved subscription", async (overrides) => {
      mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), ...overrides });
      await expect(handle().result).rejects.toMatchObject({ status: 409 });
      expect(mocks.updateMany).not.toHaveBeenCalled();
    }
  );

  it.each([{ stripeCustomerId: "cus_other" }, { stripeSubscriptionId: "sub_other" }])(
    "rejects an association belonging to another customer or subscription", async (overrides) => {
      mocks.findUnique.mockResolvedValue({ ...saved(), ...overrides });
      await expect(handle().result).rejects.toMatchObject({ status: 409 });
      expect(mocks.updateMany).not.toHaveBeenCalled();
    }
  );

  it("rejects an unknown local subscription", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(handle().result).rejects.toMatchObject({ status: 404 });
  });

  it("re-fetches current state after a competing update", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(saved()).mockResolvedValue({ ...saved(), billingVersion: 1 });
    mocks.retrieveSubscription.mockResolvedValueOnce(subscription()).mockResolvedValue({ ...subscription(), status: "past_due" });
    await handle().result;
    expect(mocks.retrieveSubscription).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ billingVersion: 1 }), data: expect.objectContaining({ status: "PAST_DUE" })
    }));
  });

  it("bounds retries when concurrent writes continue", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(handle().result).rejects.toMatchObject({ status: 409 });
    expect(mocks.updateMany).toHaveBeenCalledTimes(3);
  });

  it("does not resurrect a subscription canceled during an update", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.findUnique.mockResolvedValueOnce(saved()).mockResolvedValue({ ...saved(), stripeStatus: "canceled", status: "CANCELED", billingVersion: 1 });
    const { result, response } = handle();
    await result;
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("normalizes a terminal status first recorded by the creation handler", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved(), stripeStatus: "canceled", status: "FREE" });
    await handle("customer.subscription.deleted", { ...subscription(), status: "canceled" }).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED" }) }));
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("acknowledges a late payment after cancellation without reactivating", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved(), stripeStatus: "canceled", status: "CANCELED" });
    const { result, response } = handle("invoice.paid", invoice());
    await result;
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("extends the saved period for a paid renewal", async () => {
    const renewal = { ...invoice(), id: "in_renewal" };
    mocks.retrieveInvoice.mockResolvedValue(renewal);
    mocks.findUnique.mockResolvedValue({ ...saved(), status: "ACTIVE", stripeStatus: "active", billingVersion: 4 });
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), latest_invoice: renewal, items: {
      has_more: false, data: [{ ...subscription().items.data[0], current_period_end: periodEnd + 2592000 }]
    } });
    await handle("invoice.paid", renewal).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "ACTIVE", currentPeriodEnd: new Date((periodEnd + 2592000) * 1000)
    }) }));
  });

  it("accepts expanded invoice subscription and customer references", async () => {
    const expanded = { ...invoice(), customer: { id: "cus_1" }, parent: { subscription_details: {
      subscription: { id: "sub_1" }, metadata: { subscriptionId: "local-1" }
    } } };
    mocks.retrieveInvoice.mockResolvedValue(expanded);
    await handle("invoice.paid", expanded).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }));
  });

  it("rejects a latest invoice for a different subscription", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), latest_invoice: {
      ...invoice(), parent: { subscription_details: { subscription: "sub_other" } }
    } });
    await expect(handle().result).rejects.toMatchObject({ status: 409 });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("cancels without requiring a Stripe API call", async () => {
    const { result, response } = handle("customer.subscription.deleted", { ...subscription(), status: "canceled" });
    await result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "CANCELED", stripeStatus: "canceled", currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelAt: null
    }) }));
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("handles payment before checkout completion has saved the Stripe ID", async () => {
    mocks.findUnique.mockResolvedValue({ ...saved(), stripeSubscriptionId: null });
    const { result, response } = handle("invoice.paid", invoice());
    await result;
    expect(mocks.retrieveInvoice).toHaveBeenCalledWith("in_1");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeSubscriptionId: "sub_1", status: "ACTIVE" }) }));
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("resolves invoice metadata from the live subscription when absent", async () => {
    const eventInvoice = { ...invoice(), parent: { subscription_details: { subscription: "sub_1", metadata: null } } };
    await handle("invoice.paid", eventInvoice).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "local-1" }) }));
  });

  it("ignores paid invoices unrelated to subscriptions", async () => {
    const { result, response } = handle("invoice.paid", { ...invoice(), parent: null });
    await result;
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it("does not treat an older paid invoice as proof the current invoice is paid", async () => {
    mocks.retrieveSubscription.mockResolvedValue({ ...subscription(), latest_invoice: { ...invoice(), id: "in_new", status: "open" } });
    await handle("invoice.paid", invoice()).result;
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FREE" }) }));
  });

  it.each([{ status: "open" }, { customer: "cus_other" }, { parent: null }])(
    "rejects an unverified paid invoice", async (overrides) => {
      mocks.retrieveInvoice.mockResolvedValue({ ...invoice(), ...overrides });
      await expect(handle("invoice.paid", invoice()).result).rejects.toMatchObject({ status: 409 });
      expect(mocks.updateMany).not.toHaveBeenCalled();
    }
  );

  it("acknowledges duplicate payments without duplicating credits", async () => {
    await handle("invoice.paid", invoice()).result;
    await handle("invoice.paid", invoice()).result;
    for (const [query] of mocks.updateMany.mock.calls) expect(query.data).not.toHaveProperty("freeMonthCredits");
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["customer.subscription.updated", { ...subscription(), customer: null }],
    ["customer.subscription.deleted", { ...subscription(), status: "active" }],
    ["invoice.paid", { ...invoice(), status: "open" }]
  ])("rejects malformed %s events", async (type, object) => {
    const { result, response } = handle(type as string, object as object);
    await result;
    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["retrieveSubscription", "updateMany"] as const)("propagates %s failures for retry", async (method) => {
    const error = new Error("Temporary failure");
    mocks[method].mockRejectedValue(error);
    const { result, response } = handle();
    await expect(result).rejects.toBe(error);
    expect(response.sendStatus).not.toHaveBeenCalled();
  });
});
