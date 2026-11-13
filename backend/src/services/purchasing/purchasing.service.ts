/** Coordinates billing identity, persisted checkout attempts, and Stripe calls. */
export { createBillingPortalSession } from "./billing-portal.service";
import type { CheckoutAttempt } from "@prisma/client";
import type { CheckoutInput } from "../../validations/purchasing.schema";
import { stripe } from "./stripe.client";
import {
  findPurchasingAccount, ensureSubscription, getOrCreateCustomerCreation,
  saveStripeCustomerId, getOrCreateCheckoutAttempt, saveCheckoutAttemptSession,
  findCheckoutAttemptById, expireCheckoutAttempt
} from "../../models/purchasing.model";
import { AppError } from "../../utils/errors";
import { stripePrices } from "../../config/stripe-prices";
import { env } from "../../config/env";

// Stripe may prune creation keys after 24 hours. Stop before that boundary.
const CREATION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const blockedStatuses = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);
function existingSubscription() {
  return new AppError("Manage your existing subscription before starting another", 409, "existing_subscription");
}
function reconciliationRequired() {
  return new AppError("Your previous checkout needs to be checked before starting another. Please contact support.", 409, "checkout_reconciliation_required");
}
function assertRecent(createdAt: Date) {
  if (Date.now() - createdAt.getTime() >= CREATION_RETRY_WINDOW_MS) throw reconciliationRequired();
}

async function reuseSession(attempt: CheckoutAttempt): Promise<string> {
  if (attempt.state !== "OPEN" || !attempt.sessionId) throw reconciliationRequired();
  const session = await stripe.checkout.sessions.retrieve(attempt.sessionId);
  if (session.status === "expired") {
    await expireCheckoutAttempt(attempt.id, attempt.sessionId);
    throw new AppError("Your checkout expired. Please choose your plan again.", 409, "checkout_expired");
  }
  // Keep completed attempts blocking new checkout until billing is reconciled.
  if (session.status !== "open" || !session.url) throw reconciliationRequired();
  return session.url;
}

async function expireSessionForReplacement(attempt: CheckoutAttempt): Promise<void> {
  if (attempt.state !== "OPEN" || !attempt.sessionId) throw reconciliationRequired();
  let session = await stripe.checkout.sessions.retrieve(attempt.sessionId);
  if (session.status === "open") {
    // Stripe arbitrates a race with payment completion. Never release the local
    // attempt on an error or timeout: a later request can retrieve its outcome.
    session = await stripe.checkout.sessions.expire(attempt.sessionId);
  }
  if (session.status !== "expired") throw reconciliationRequired();
  const expired = await expireCheckoutAttempt(attempt.id, attempt.sessionId);
  if (expired.count === 0) {
    const current = await findCheckoutAttemptById(attempt.id);
    // The expiration webhook or another request may have won this write.
    if (current?.state !== "EXPIRED" || current.sessionId !== attempt.sessionId) throw reconciliationRequired();
  }
}

export async function createCheckoutSession(userId: string, input: CheckoutInput): Promise<string> {
  const account = await findPurchasingAccount(userId);
  if (!account) throw new AppError("Create your tech profile before subscribing", 409, "missing_tech_profile");
  if (account.subscription && blockedStatuses.has(account.subscription.status)) throw existingSubscription();

  let subscription = await ensureSubscription(account.id);
  if (blockedStatuses.has(subscription.status)) throw existingSubscription();
  let stripeCustomerId = subscription.stripeCustomerId;
  if (!stripeCustomerId) {
    const operation = await getOrCreateCustomerCreation({
      subscriptionId: subscription.id, email: account.user.email, userId, techProfileId: account.id
    });
    assertRecent(operation.createdAt);
    const customer = await stripe.customers.create({
      email: operation.email,
      metadata: { userId: operation.userId, techProfileId: operation.techProfileId }
    }, { idempotencyKey: `customer:${operation.id}` });
    subscription = await saveStripeCustomerId(subscription.id, customer.id);
    if (subscription.stripeCustomerId !== customer.id) throw reconciliationRequired();
    stripeCustomerId = subscription.stripeCustomerId;
  }

  // Local status can lag a completed checkout while its webhook is pending.
  const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 100 });
  if (subscriptions.has_more || subscriptions.data.some(({ status }) => status !== "canceled" && status !== "incomplete_expired")) {
    throw existingSubscription();
  }

  const appUrl = env.APP_PUBLIC_URL ?? env.FRONTEND_ORIGIN;
  const attemptInput = {
    subscriptionId: subscription.id, plan: input.planId, interval: input.interval,
    stripePriceId: stripePrices[input.planId][input.interval], stripeCustomerId, userId,
    successUrl: new URL("/pricing?checkout=returned", appUrl).href,
    cancelUrl: new URL("/pricing", appUrl).href
  };
  let attempt = await getOrCreateCheckoutAttempt(attemptInput);
  if ((attempt.plan !== input.planId || attempt.interval !== input.interval) && attempt.state === "OPEN") {
    await expireSessionForReplacement(attempt);
    attempt = await getOrCreateCheckoutAttempt(attemptInput);
  }
  // Compare after conflict recovery, since the winning request may have chosen a different plan.
  // Replace at most one attempt; do not expire a competing replacement in a loop.
  if (attempt.plan !== input.planId || attempt.interval !== input.interval) {
    throw new AppError("You already have an open checkout for a different plan or interval", 409, "checkout_attempt_conflict");
  }
  if (attempt.state === "OPEN") return reuseSession(attempt);
  if (attempt.state !== "CREATING") throw reconciliationRequired();
  assertRecent(attempt.createdAt);
  // Existing pre-migration attempts lack an immutable request snapshot. Do not guess it.
  if (!attempt.stripeCustomerId || !attempt.userId || !attempt.successUrl || !attempt.cancelUrl ||
      attempt.stripeCustomerId !== stripeCustomerId || attempt.userId !== userId) throw reconciliationRequired();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription", customer: attempt.stripeCustomerId,
    line_items: [{ price: attempt.stripePriceId, quantity: 1 }],
    success_url: attempt.successUrl, cancel_url: attempt.cancelUrl,
    client_reference_id: attempt.id,
    metadata: { checkoutAttemptId: attempt.id },
    subscription_data: { metadata: { userId: attempt.userId, subscriptionId: attempt.subscriptionId, planId: attempt.plan } }
  }, { idempotencyKey: `checkout:${attempt.id}` });

  if (session.status !== "open" || !session.url) throw reconciliationRequired();
  const saved = await saveCheckoutAttemptSession(attempt.id, {
    sessionId: session.id, sessionUrl: session.url, expiresAt: new Date(session.expires_at * 1000)
  });
  if (saved.count === 0) {
    const current = await findCheckoutAttemptById(attempt.id);
    if (!current || current.sessionId !== session.id) throw reconciliationRequired();
    return reuseSession(current);
  }
  return session.url;
}
