/** Creates hosted billing sessions for the account resolved from the app session. */
import { env } from "../../config/env";
import { findPurchasingAccount } from "../../models/purchasing.model";
import { AppError } from "../../utils/errors";
import { stripe } from "./stripe.client";

export async function createBillingPortalSession(userId: string): Promise<string> {
  const account = await findPurchasingAccount(userId);
  const customer = account?.subscription?.stripeCustomerId;
  if (!customer) {
    throw new AppError("Choose a plan first to set up your billing account", 409, "missing_billing_account");
  }

  // Do not gate on local status: customers may need to recover overdue payments
  // or manage billing while subscription webhooks are still in flight.
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: new URL("/pricing", env.APP_PUBLIC_URL ?? env.FRONTEND_ORIGIN).href,
    ...(env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: env.STRIPE_PORTAL_CONFIGURATION_ID } : {})
  });
  return session.url;
}
