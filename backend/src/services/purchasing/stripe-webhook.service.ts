import { findCheckoutAttemptWithSubscription, updateCheckoutAttemptCompleted, findWebhookSubscription, initializeStripeSubscription } from "../../models/stripe-webhook.model";
import { expireCheckoutAttempt, findCheckoutAttemptById } from "../../models/purchasing.model";
import { AppError } from "../../utils/errors";
import type { checkoutCompletedData, checkoutExpiredData, subscriptionCreatedData } from "./stripe-webhook.types";

export async function customerSubscriptionCreated(eventData: subscriptionCreatedData) {
    // Initialize atomically; repeated or late creation events must not overwrite billing state.
    const updated = await initializeStripeSubscription(eventData);
    if (updated.count === 1) return;

    const subscription = await findWebhookSubscription(eventData.subscriptionId);
    if (!subscription) {
        throw new AppError("Subscription not found", 404);
    }

    if (
        subscription.stripeCustomerId !== eventData.stripeCustomerId ||
        subscription.stripeSubscriptionId !== eventData.stripeSubscriptionId ||
        subscription.stripeStatus === null
    ) {
        throw new AppError("Stripe subscription does not match an initialized local subscription", 409);
    }
    // Matching initialized records are safe to acknowledge, regardless of their current status.
}

export async function checkoutSessionExpired(eventData: checkoutExpiredData) {
    const checkoutAttempt = await findCheckoutAttemptById(eventData.checkoutAttemptId);

    if (!checkoutAttempt) {
        throw new AppError("Checkout attempt not found", 404);
    }

    if (checkoutAttempt.sessionId !== eventData.stripeSessionId) {
        throw new Error("Stripe session ID does not match the checkout attempt");
    }

    // Check state in the write itself so a concurrent completion cannot be overwritten.
    await expireCheckoutAttempt(checkoutAttempt.id, eventData.stripeSessionId);
}

export async function checkoutSessionCompleted(eventData: checkoutCompletedData) {
    const checkoutAttempt = await findCheckoutAttemptWithSubscription(eventData.checkoutAttemptId);

    if (!checkoutAttempt) {
        throw new AppError("Checkout attempt not found", 404);
    }

    if (checkoutAttempt.sessionId !== eventData.stripeSessionId) {
        throw new Error("Stripe session ID does not match the checkout attempt");
    }

    if (checkoutAttempt.stripeCustomerId !== eventData.stripeCustomerId) {
        throw new Error("Stripe customer ID does not match the checkout attempt");
    }

    const savedStripeSubscriptionId =
        checkoutAttempt.subscription.stripeSubscriptionId;

    if (
        savedStripeSubscriptionId !== null &&
        savedStripeSubscriptionId !== eventData.stripeSubscriptionId
    ) {
        throw new Error("Stripe subscription ID does not match the saved subscription");
    }

    await updateCheckoutAttemptCompleted({
        checkoutAttemptId: checkoutAttempt.id,
        stripeCustomerId: eventData.stripeCustomerId,
        stripeSubscriptionId: eventData.stripeSubscriptionId
    });
}
