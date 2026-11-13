import type Stripe from "stripe";

export type checkoutCompletedData = {
    checkoutAttemptId: string;
    stripeSessionId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
};

export type checkoutExpiredData = {
    checkoutAttemptId: string;
    stripeSessionId: string;
};

export type subscriptionCreatedData = {
    subscriptionId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripeStatus: Stripe.Subscription.Status;
};

export type subscriptionLifecycleData = {
    subscriptionId?: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
};
