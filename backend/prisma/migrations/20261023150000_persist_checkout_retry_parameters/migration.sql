-- Keep existing attempts intact; missing snapshots require reconciliation, not recreation.
ALTER TABLE "CheckoutAttempt"
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "userId" TEXT,
ADD COLUMN "successUrl" TEXT,
ADD COLUMN "cancelUrl" TEXT;

CREATE TABLE "StripeCustomerCreation" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeCustomerCreation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StripeCustomerCreation_subscriptionId_key" ON "StripeCustomerCreation"("subscriptionId");
ALTER TABLE "StripeCustomerCreation" ADD CONSTRAINT "StripeCustomerCreation_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
