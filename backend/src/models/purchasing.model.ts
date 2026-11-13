/** Owns checkout persistence and database conflict recovery; never calls Stripe. */
import { Prisma } from "@prisma/client";
import { prisma } from "./database.model";

function isUniqueConflict(error: unknown, field: string, index: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return target === index || target === field ||
    (Array.isArray(target) && target.length === 1 && (target[0] === field || target[0] === index));
}

export function findPurchasingAccount(userId: string) {
  return prisma.techProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      user: { select: { id: true, email: true } },
      subscription: { select: { id: true, status: true, stripeCustomerId: true, stripeSubscriptionId: true } }
    }
  });
}

export async function ensureSubscription(techProfileId: string) {
  try {
    return await prisma.subscription.upsert({ where: { techProfileId }, create: { techProfileId }, update: {} });
  } catch (error) {
    if (!isUniqueConflict(error, "techProfileId", "Subscription_techProfileId_key")) throw error;
    return prisma.subscription.findUniqueOrThrow({ where: { techProfileId } });
  }
}

type CustomerCreationInput = { subscriptionId: string; email: string; userId: string; techProfileId: string };
export async function getOrCreateCustomerCreation(data: CustomerCreationInput) {
  const where = { subscriptionId: data.subscriptionId };
  const existing = await prisma.stripeCustomerCreation.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.stripeCustomerCreation.create({ data });
  } catch (error) {
    if (!isUniqueConflict(error, "subscriptionId", "StripeCustomerCreation_subscriptionId_key")) throw error;
    return prisma.stripeCustomerCreation.findUniqueOrThrow({ where });
  }
}

// Never overwrite a customer association saved by a competing request.
export async function saveStripeCustomerId(subscriptionId: string, stripeCustomerId: string) {
  await prisma.subscription.updateMany({
    where: { id: subscriptionId, stripeCustomerId: null }, data: { stripeCustomerId }
  });
  return prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
}

export function findCheckoutAttempt(subscriptionId: string) {
  return prisma.checkoutAttempt.findFirst({
    where: { subscriptionId, state: { in: ["CREATING", "OPEN"] } }
  });
}
export function findCheckoutAttemptById(id: string) {
  return prisma.checkoutAttempt.findUnique({ where: { id } });
}

type CreateCheckoutAttemptInput = {
  subscriptionId: string; plan: string; interval: string; stripePriceId: string;
  stripeCustomerId: string; userId: string; successUrl: string; cancelUrl: string;
};
export async function getOrCreateCheckoutAttempt(data: CreateCheckoutAttemptInput) {
  // Each statement is committed separately. A failed insert must not poison a
  // transaction before the winning request's row can be reloaded.
  for (let retry = 0; retry < 3; retry++) {
    const existing = await findCheckoutAttempt(data.subscriptionId);
    if (existing) return existing;
    try {
      return await prisma.checkoutAttempt.create({ data });
    } catch (error) {
      if (!isUniqueConflict(error, "subscriptionId", "CheckoutAttempt_one_active_per_subscription")) throw error;
      const winner = await findCheckoutAttempt(data.subscriptionId);
      if (winner) return winner;
      // Winner may already have become terminal; retry within a bounded loop.
      if (retry === 2) throw error;
    }
  }
  throw new Error("Checkout attempt could not be acquired");
}

type CheckoutSessionData = { sessionId: string; sessionUrl: string; expiresAt: Date };
export function saveCheckoutAttemptSession(attemptId: string, data: CheckoutSessionData) {
  return prisma.checkoutAttempt.updateMany({
    where: { id: attemptId, state: "CREATING", sessionId: null },
    data: { ...data, state: "OPEN" }
  });
}
export function expireCheckoutAttempt(id: string, sessionId: string) {
  return prisma.checkoutAttempt.updateMany({
    where: { id, sessionId, state: "OPEN" }, data: { state: "EXPIRED" }
  });
}
