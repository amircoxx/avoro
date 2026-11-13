import { Request, Response, NextFunction } from "express";
import { stripe } from "../services/purchasing/stripe.client";
import { checkoutSessionCompleted, checkoutSessionExpired, customerSubscriptionCreated } from "../services/purchasing/stripe-webhook.service";
import { Stripe } from "stripe";
import { invoicePaid, invoicePaymentFailed, synchronizeSubscription } from "../services/purchasing/stripe-subscription.service";

export async function stripeWebhookHandler(request: Request, response: Response, next: NextFunction) {

    const signature = request.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
        response.status(500).send("Stripe webhook secret is not configured");
        return;
    }

    if (!signature) {
        response.status(400).send("Missing Stripe signature");
        return;
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(request.body, signature, secret);
    } catch (err) {
        response.status(400).send("Invalid Stripe webhook signature or payload");
        return;
    }

    switch (event.type) {
    case "checkout.session.completed": {
        const session = event.data.object;

        const checkoutAttemptId = session.metadata?.checkoutAttemptId;
        const stripeSessionId = session.id;

        const stripeCustomerId =
            typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        const stripeSubscriptionId =
            typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!checkoutAttemptId || !stripeSessionId || !stripeCustomerId || !stripeSubscriptionId) {
            response.status(400).send("Missing required session metadata");
            return;
        }

        const eventData = {
            checkoutAttemptId,
            stripeSessionId,
            stripeCustomerId,
            stripeSubscriptionId
        };

        await checkoutSessionCompleted(eventData);
        response.sendStatus(200);
        break;
    }

    case "checkout.session.expired": {
        // Mark the checkout attempt expired, unless already completed.
        const session = event.data.object;
        const checkoutAttemptId = session.metadata?.checkoutAttemptId;
        const stripeSessionId = session.id;

        if (!checkoutAttemptId || !stripeSessionId) {
            response.status(400).send("Missing required session metadata");
            return;
        }

        await checkoutSessionExpired({ checkoutAttemptId, stripeSessionId });
        response.sendStatus(200);
        break;
    }

    case "customer.subscription.created": {
        // Save the subscription ID and initial status.
        // Creation alone does not mean payment succeeded.
        const subscription = event.data.object;
        const subscriptionId = subscription.metadata?.subscriptionId;
        const stripeSubscriptionId = subscription.id;
        const stripeCustomerId = typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        const stripeStatus = subscription.status;

        if (!subscriptionId || !stripeSubscriptionId || !stripeCustomerId || !stripeStatus) {
            response.status(400).send("Missing required subscription metadata");
            return;
        }

        await customerSubscriptionCreated({
            subscriptionId, stripeSubscriptionId, stripeCustomerId, stripeStatus
        });
        response.sendStatus(200);
        break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = subscription.metadata?.subscriptionId;
        const stripeCustomerId = typeof subscription.customer === "string"
            ? subscription.customer : subscription.customer?.id;
        const deleted = event.type === "customer.subscription.deleted";
        if (!subscriptionId || !subscription.id || !stripeCustomerId ||
            (deleted && subscription.status !== "canceled")) {
            response.status(400).send("Missing or invalid subscription data");
            return;
        }
        await synchronizeSubscription({
            subscriptionId, stripeCustomerId, stripeSubscriptionId: subscription.id
        }, deleted);
        response.sendStatus(200);
        break;
    }

    case "invoice.paid": {
        const invoice = event.data.object;
        const details = invoice.parent?.subscription_details;
        // One-off invoices have no subscription to reconcile.
        if (!details) {
            response.sendStatus(200);
            return;
        }
        const stripeSubscriptionId = typeof details.subscription === "string"
            ? details.subscription : details.subscription?.id;
        const stripeCustomerId = typeof invoice.customer === "string"
            ? invoice.customer : invoice.customer?.id;
        if (!invoice.id || !stripeSubscriptionId || !stripeCustomerId || invoice.status !== "paid") {
            response.status(400).send("Missing or invalid paid invoice data");
            return;
        }
        await invoicePaid({
            subscriptionId: details.metadata?.subscriptionId,
            stripeCustomerId, stripeSubscriptionId
        }, invoice.id);
        response.sendStatus(200);
        break;
    }

    case "invoice.payment_failed": {
        const invoice = event.data.object;
        const details = invoice.parent?.subscription_details;
        if (!details) {
            response.sendStatus(200);
            return;
        }
        const stripeSubscriptionId = typeof details.subscription === "string"
            ? details.subscription : details.subscription?.id;
        const stripeCustomerId = typeof invoice.customer === "string"
            ? invoice.customer : invoice.customer?.id;
        if (!invoice.id || !stripeSubscriptionId || !stripeCustomerId) {
            response.status(400).send("Missing required failed invoice data");
            return;
        }
        await invoicePaymentFailed({
            subscriptionId: details.metadata?.subscriptionId,
            stripeCustomerId, stripeSubscriptionId
        }, invoice.id);
        response.sendStatus(200);
        break;
    }

    default: {
        // Ignore event types your app does not handle.
        break;
    }
    }
}
