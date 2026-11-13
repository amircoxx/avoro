import { prisma } from "./database.model";
import type { SubscriptionStatus } from "@prisma/client";

export type SubscriptionBillingState = {
    stripeStatus: string;
    status: SubscriptionStatus;
    plan?: string | null;
    interval?: string | null;
    stripePriceId?: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: Date | null;
};

export function saveSubscriptionBillingState(
    identity: { subscriptionId: string; stripeCustomerId: string; stripeSubscriptionId: string },
    billingVersion: number,
    state: SubscriptionBillingState
) {
    return prisma.subscription.updateMany({
        where: {
            id: identity.subscriptionId,
            stripeCustomerId: identity.stripeCustomerId,
            billingVersion,
            OR: [{ stripeSubscriptionId: null }, { stripeSubscriptionId: identity.stripeSubscriptionId }]
        },
        data: {
            ...state,
            stripeSubscriptionId: identity.stripeSubscriptionId,
            billingVersion: { increment: 1 }
        }
    });
}

export function findWebhookSubscription(id: string) {
    return prisma.subscription.findUnique({ where: { id } });
}

type InitializeSubscriptionInput = {
    subscriptionId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripeStatus: string;
};

export function initializeStripeSubscription(data: InitializeSubscriptionInput) {
    return prisma.subscription.updateMany({
        where: {
            id: data.subscriptionId,
            stripeCustomerId: data.stripeCustomerId,
            stripeStatus: null,
            OR: [
                { stripeSubscriptionId: null },
                { stripeSubscriptionId: data.stripeSubscriptionId }
            ]
        },
        data: {
            stripeSubscriptionId: data.stripeSubscriptionId,
            stripeStatus: data.stripeStatus
        }
    });
}

export function findCheckoutAttemptWithSubscription(id: string) {
    return prisma.checkoutAttempt.findUnique({
        where: { id },
        include: { subscription: true }
    });
}

type CompleteCheckoutAttemptInput = {
    checkoutAttemptId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
};

export async function updateCheckoutAttemptCompleted(data: CompleteCheckoutAttemptInput) {
    await prisma.$transaction(async (prisma) => {
        const updatedAttempt = await prisma.checkoutAttempt.update({
            where: { id: data.checkoutAttemptId },
            data: { state: "COMPLETED" }
        });
        const updatedSubscription = await prisma.subscription.updateMany({
            where: { 
                id: updatedAttempt.subscriptionId,
                stripeCustomerId: data.stripeCustomerId,
                OR: [
                    { stripeSubscriptionId: null },
                    { stripeSubscriptionId: data.stripeSubscriptionId }
                ]
             },
            data: { stripeSubscriptionId: data.stripeSubscriptionId }
        });

        if (updatedSubscription.count !== 1) {
            throw new Error("Failed to update subscription with Stripe subscription ID");
        }
        if (updatedAttempt.state !== "COMPLETED") {
            throw new Error("Failed to mark checkout attempt as completed");
        }
    });
}
