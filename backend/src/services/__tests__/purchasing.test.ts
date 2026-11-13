import { beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({
  findPurchasingAccount: vi.fn(), ensureSubscription: vi.fn(),
  getOrCreateCustomerCreation: vi.fn(), saveStripeCustomerId: vi.fn(),
  getOrCreateCheckoutAttempt: vi.fn(), findCheckoutAttempt: vi.fn(),
  createCheckoutAttempt: vi.fn(), saveCheckoutAttemptSession: vi.fn(),
  findCheckoutAttemptById: vi.fn(), expireCheckoutAttempt: vi.fn()
}));
const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() }, subscriptions: { list: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } }
}));
vi.mock("../../models/purchasing.model", () => model);
vi.mock("../purchasing/stripe.client", () => ({ stripe }));
vi.mock("../../config/env", () => ({ env: { FRONTEND_ORIGIN: "http://localhost:3000" } }));
import { createCheckoutSession } from "../purchasing/purchasing.service";

const input = { planId: "studio", interval: "monthly" } as const;
const subscription = { id: "sub-local", techProfileId: "tech-1", status: "FREE", stripeCustomerId: "cus-1" };
const attempt = () => ({
  id: "attempt-1", subscriptionId: "sub-local", plan: "studio", interval: "monthly", stripePriceId: "price-saved",
  state: "CREATING", sessionId: null, sessionUrl: null, createdAt: new Date(), expiresAt: null,
  stripeCustomerId: "cus-1", userId: "user-1", successUrl: "http://localhost:3000/pricing?checkout=returned", cancelUrl: "http://localhost:3000/pricing"
});
const session = () => ({ id: "cs-1", status: "open", url: "https://checkout.stripe.com/c/pay/test", expires_at: Math.floor(Date.now() / 1000) + 3600 });

beforeEach(() => {
  vi.resetAllMocks();
  model.findPurchasingAccount.mockResolvedValue({ id: "tech-1", user: { id: "user-1", email: "new@example.test" }, subscription });
  model.ensureSubscription.mockResolvedValue(subscription);
  model.getOrCreateCheckoutAttempt.mockResolvedValue(attempt());
  model.saveCheckoutAttemptSession.mockResolvedValue({ count: 1 });
  stripe.subscriptions.list.mockResolvedValue({ data: [], has_more: false });
  stripe.checkout.sessions.create.mockResolvedValue(session());
  stripe.checkout.sessions.retrieve.mockResolvedValue(session());
  stripe.checkout.sessions.expire.mockResolvedValue({ ...session(), status: "expired", url: null });
  model.expireCheckoutAttempt.mockResolvedValue({ count: 1 });
});

describe("switching an unpaid checkout selection", () => {
  function openPrevious() {
    model.getOrCreateCheckoutAttempt.mockResolvedValueOnce({
      ...attempt(), id: "old-attempt", plan: "signature", state: "OPEN", sessionId: "cs-1"
    });
  }

  it.each([
    { plan: "signature", interval: "monthly" },
    { plan: "studio", interval: "yearly" }
  ])("replaces an open checkout for %j only after expiration", async (selection) => {
    model.getOrCreateCheckoutAttempt.mockResolvedValueOnce({
      ...attempt(), ...selection, id: "old-attempt", state: "OPEN", sessionId: "cs-1"
    });
    let confirmExpiration!: (value: unknown) => void;
    stripe.checkout.sessions.expire.mockImplementationOnce(() => new Promise(resolve => { confirmExpiration = resolve; }));
    const result = createCheckoutSession("user-1", input).then(
      url => ({ url, error: undefined }), error => ({ url: undefined, error })
    );
    await vi.waitFor(() => expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs-1"));
    expect(model.expireCheckoutAttempt).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    confirmExpiration({ ...session(), status: "expired" });
    await expect(result).resolves.toEqual({ url: session().url, error: undefined });
    expect(model.expireCheckoutAttempt).toHaveBeenCalledWith("old-attempt", "cs-1");
    expect(model.getOrCreateCheckoutAttempt).toHaveBeenLastCalledWith(expect.objectContaining({ plan: "studio", interval: "monthly" }));
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price-saved", quantity: 1 }]
    }), { idempotencyKey: "checkout:attempt-1" });
  });

  it("replaces an already-expired Stripe session without expiring it again", async () => {
    openPrevious();
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...session(), status: "expired" });
    await expect(createCheckoutSession("user-1", input)).resolves.toBe(session().url);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(model.expireCheckoutAttempt).toHaveBeenCalledWith("old-attempt", "cs-1");
  });

  it.each(["retrieve", "expire"] as const)("preserves the old attempt when Stripe %s fails", async (operation) => {
    openPrevious();
    stripe.checkout.sessions[operation].mockRejectedValue(new Error("Stripe unavailable"));
    await expect(createCheckoutSession("user-1", input)).rejects.toThrow("Stripe unavailable");
    expect(model.expireCheckoutAttempt).not.toHaveBeenCalled();
    expect(model.getOrCreateCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it.each(["complete", null])("does not replace a session with status %s", async (status) => {
    openPrevious();
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...session(), status });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(model.expireCheckoutAttempt).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("requires the expiration response to confirm expiration", async () => {
    openPrevious();
    stripe.checkout.sessions.expire.mockResolvedValue(session());
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
    expect(model.expireCheckoutAttempt).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("accepts an expiration webhook that wins the local write", async () => {
    openPrevious();
    model.expireCheckoutAttempt.mockResolvedValue({ count: 0 });
    model.findCheckoutAttemptById.mockResolvedValue({ ...attempt(), state: "EXPIRED", sessionId: "cs-1" });
    await expect(createCheckoutSession("user-1", input)).resolves.toBe(session().url);
  });

  it.each([
    null, { state: "COMPLETED", sessionId: "cs-1" }, { state: "OPEN", sessionId: "cs-1" },
    { state: "EXPIRED", sessionId: "different-session" }
  ])("blocks replacement when the local expiration cannot be confirmed: %j", async (current) => {
    openPrevious();
    model.expireCheckoutAttempt.mockResolvedValue({ count: 0 });
    model.findCheckoutAttemptById.mockResolvedValue(current);
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("does not expire another selection that wins the replacement race", async () => {
    openPrevious();
    model.getOrCreateCheckoutAttempt.mockResolvedValueOnce({ ...attempt(), plan: "starter", state: "OPEN", sessionId: "cs-winner" });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_attempt_conflict" });
    expect(model.getOrCreateCheckoutAttempt).toHaveBeenCalledTimes(2);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("checkout creation and recovery", () => {
  it.each(["ACTIVE", "TRIALING", "PAST_DUE"])("blocks local %s subscriptions", async (status) => {
    model.findPurchasingAccount.mockResolvedValue({ id: "tech-1", user: {}, subscription: { ...subscription, status } });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "existing_subscription" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("uses saved attempt parameters and key, then saves session details", async () => {
    await expect(createCheckoutSession("user-1", input)).resolves.toBe(session().url);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus-1", line_items: [{ price: "price-saved", quantity: 1 }]
    }), { idempotencyKey: "checkout:attempt-1" });
    expect(model.saveCheckoutAttemptSession).toHaveBeenCalledWith("attempt-1", expect.objectContaining({ sessionId: "cs-1", expiresAt: expect.any(Date) }));
  });
  it("checks the selection after recovering a competing attempt", async () => {
    model.getOrCreateCheckoutAttempt.mockResolvedValue({ ...attempt(), plan: "signature" });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_attempt_conflict" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("retrieves and reuses an OPEN session without creating it again", async () => {
    model.getOrCreateCheckoutAttempt.mockResolvedValue({ ...attempt(), state: "OPEN", sessionId: "cs-1" });
    await expect(createCheckoutSession("user-1", input)).resolves.toBe(session().url);
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs-1");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("blocks completed checkout pending reconciliation", async () => {
    model.getOrCreateCheckoutAttempt.mockResolvedValue({ ...attempt(), state: "OPEN", sessionId: "cs-1" });
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...session(), status: "complete", url: null });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
    expect(model.expireCheckoutAttempt).not.toHaveBeenCalled();
  });
  it("releases only a Stripe-confirmed expired session", async () => {
    model.getOrCreateCheckoutAttempt.mockResolvedValue({ ...attempt(), state: "OPEN", sessionId: "cs-1" });
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...session(), status: "expired", url: null });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_expired" });
    expect(model.expireCheckoutAttempt).toHaveBeenCalledWith("attempt-1", "cs-1");
  });
  it("does not recreate an unresolved attempt outside the retry window", async () => {
    model.getOrCreateCheckoutAttempt.mockResolvedValue({ ...attempt(), createdAt: new Date(Date.now() - 24 * 3600_000) });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("does not recreate a legacy attempt lacking its snapshot", async () => {
    model.getOrCreateCheckoutAttempt.mockResolvedValue({ ...attempt(), successUrl: null });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
  });
  it("uses the persisted customer request, not a changed account email", async () => {
    model.ensureSubscription.mockResolvedValue({ ...subscription, stripeCustomerId: null });
    model.findPurchasingAccount.mockResolvedValue({ id: "tech-1", user: { id: "user-1", email: "new@example.test" }, subscription: null });
    model.getOrCreateCustomerCreation.mockResolvedValue({ id: "operation-1", email: "original@example.test", userId: "user-1", techProfileId: "tech-1", createdAt: new Date() });
    stripe.customers.create.mockResolvedValue({ id: "cus-1" });
    model.saveStripeCustomerId.mockResolvedValue(subscription);
    await createCheckoutSession("user-1", input);
    expect(stripe.customers.create).toHaveBeenCalledWith({ email: "original@example.test", metadata: { userId: "user-1", techProfileId: "tech-1" } }, { idempotencyKey: "customer:operation-1" });
  });
  it("stops stale customer creation without calling Stripe", async () => {
    model.ensureSubscription.mockResolvedValue({ ...subscription, stripeCustomerId: null });
    model.getOrCreateCustomerCreation.mockResolvedValue({ id: "old", createdAt: new Date(Date.now() - 24 * 3600_000) });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "checkout_reconciliation_required" });
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });
  it("blocks Stripe subscriptions before local webhook state catches up", async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [{ status: "incomplete" }], has_more: false });
    await expect(createCheckoutSession("user-1", input)).rejects.toMatchObject({ code: "existing_subscription" });
  });
  it("recovers when a competing request already saved the same session", async () => {
    model.saveCheckoutAttemptSession.mockResolvedValue({ count: 0 });
    model.findCheckoutAttemptById.mockResolvedValue({ ...attempt(), state: "OPEN", sessionId: "cs-1" });
    await expect(createCheckoutSession("user-1", input)).resolves.toBe(session().url);
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs-1");
  });
  it("keeps an uncertain creation attempt available for recovery", async () => {
    stripe.checkout.sessions.create.mockRejectedValue(new Error("timeout"));
    await expect(createCheckoutSession("user-1", input)).rejects.toThrow("timeout");
    expect(model.expireCheckoutAttempt).not.toHaveBeenCalled();
  });
});
