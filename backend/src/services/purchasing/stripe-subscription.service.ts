import type Stripe from "stripe";
import { stripe } from "./stripe.client";
import { stripePrices } from "../../config/stripe-prices";
import {
    findWebhookSubscription, saveSubscriptionBillingState, type SubscriptionBillingState
} from "../../models/stripe-webhook.model";
import { AppError } from "../../utils/errors";
import type { subscriptionLifecycleData } from "./stripe-webhook.types";

function idOf(value: string | { id: string } | null | undefined) {
    return typeof value === "string" ? value : value?.id;
}

function conflict(message: string) {
    return new AppError(message, 409, "billing_reconciliation_required");
}

function assertStripeIdentity(subscription: Stripe.Subscription, data: subscriptionLifecycleData) {
    if (subscription.id !== data.stripeSubscriptionId ||
        idOf(subscription.customer) !== data.stripeCustomerId ||
        !subscription.metadata.subscriptionId ||
        (data.subscriptionId && subscription.metadata.subscriptionId !== data.subscriptionId)) {
        throw conflict("Stripe subscription identity does not match the webhook");
    }
}

function invoiceMatches(invoice: Stripe.Invoice, data: subscriptionLifecycleData) {
    return idOf(invoice.customer) === data.stripeCustomerId &&
        idOf(invoice.parent?.subscription_details?.subscription) === data.stripeSubscriptionId;
}

function timestamp(value: number | null | undefined): Date | null {
    if (!value || !Number.isFinite(value)) return null;
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
}

async function billingState(subscription: Stripe.Subscription, data: subscriptionLifecycleData): Promise<SubscriptionBillingState> {
    const item = !subscription.items.has_more && subscription.items.data.length === 1
        ? subscription.items.data[0] : undefined;
    let plan: string | null = null;
    let interval: string | null = null;
    if (item?.quantity === 1) {
        for (const [planId, prices] of Object.entries(stripePrices)) {
            for (const [billingInterval, priceId] of Object.entries(prices)) {
                if (item.price.id === priceId) {
                    plan = planId;
                    interval = billingInterval;
                }
            }
        }
    }
    const currentPeriodEnd = timestamp(item?.current_period_end);
    const supportedPeriod = Boolean(plan && currentPeriodEnd && currentPeriodEnd.getTime() > Date.now());
    let status: SubscriptionBillingState["status"] = "FREE";
    switch (subscription.status) {
    case "active": {
        if (!supportedPeriod) break;
        const latestInvoice = typeof subscription.latest_invoice === "string"
            ? await stripe.invoices.retrieve(subscription.latest_invoice)
            : subscription.latest_invoice;
        if (latestInvoice && !invoiceMatches(latestInvoice, data)) {
            throw conflict("Latest invoice does not match the Stripe subscription");
        }
        if (latestInvoice?.status === "paid") status = "ACTIVE";
        break;
    }
    case "trialing":
        if (supportedPeriod) status = "TRIALING";
        break;
    case "past_due":
        status = "PAST_DUE";
        break;
    case "canceled":
    case "incomplete_expired":
        status = "CANCELED";
        break;
    }
    return {
        stripeStatus: subscription.status, status, plan, interval,
        stripePriceId: item?.price.id ?? null, currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelAt: timestamp(subscription.cancel_at)
    };
}

export async function invoicePaid(data: subscriptionLifecycleData, invoiceId: string) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.id !== invoiceId || invoice.status !== "paid" || !invoiceMatches(invoice, data)) {
        throw conflict("Invoice is not a verified paid invoice for this subscription");
    }
    await synchronizeSubscription(data);
}

export async function invoicePaymentFailed(data: subscriptionLifecycleData, invoiceId: string) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.id !== invoiceId || !invoiceMatches(invoice, data)) {
        throw conflict("Failed invoice does not match the Stripe subscription");
    }
    // The invoice may already be paid when a delayed failure event arrives.
    // Reconcile current Stripe state instead of forcing the subscription past due.
    await synchronizeSubscription(data);
}

export async function synchronizeSubscription(data: subscriptionLifecycleData, deleted = false) {
    let subscriptionId = data.subscriptionId;
    if (!subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(data.stripeSubscriptionId, { expand: ["latest_invoice"] });
        assertStripeIdentity(subscription, data);
        subscriptionId = subscription.metadata.subscriptionId;
    }
    const identity = { ...data, subscriptionId };

    for (let attempt = 0; attempt < 3; attempt++) {
        // Read the version before fetching Stripe so a competing commit invalidates this snapshot.
        const saved = await findWebhookSubscription(subscriptionId);
        if (!saved) throw new AppError("Subscription not found", 404);
        if (saved.stripeCustomerId !== data.stripeCustomerId ||
            (saved.stripeSubscriptionId !== null && saved.stripeSubscriptionId !== data.stripeSubscriptionId)) {
            throw conflict("Stripe customer or subscription does not match the local subscription");
        }
        // These Stripe states are terminal for this subscription ID.
        const terminal = saved.stripeStatus === "canceled" || saved.stripeStatus === "incomplete_expired";
        if (terminal && saved.status === "CANCELED") return;

        let state: SubscriptionBillingState;
        if (deleted || terminal) {
            state = {
                stripeStatus: deleted ? "canceled" : saved.stripeStatus!, status: "CANCELED", currentPeriodEnd: null,
                cancelAtPeriodEnd: false, cancelAt: null
            };
        } else {
            const subscription = await stripe.subscriptions.retrieve(data.stripeSubscriptionId, { expand: ["latest_invoice"] });
            assertStripeIdentity(subscription, identity);
            state = await billingState(subscription, identity);
        }
        const updated = await saveSubscriptionBillingState(identity, saved.billingVersion, state);
        if (updated.count === 1) return;
    }
    throw conflict("Subscription changed while reconciling billing; retry the webhook");
}
