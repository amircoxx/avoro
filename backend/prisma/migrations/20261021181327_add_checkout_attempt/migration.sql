-- CreateEnum
CREATE TYPE "CheckoutAttemptState" AS ENUM ('CREATING', 'OPEN', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CheckoutAttempt" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "state" "CheckoutAttemptState" NOT NULL DEFAULT 'CREATING',
    "sessionId" TEXT,
    "sessionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "CheckoutAttempt_one_active_per_subscription"
ON "CheckoutAttempt" ("subscriptionId")
WHERE "state" IN ('CREATING', 'OPEN');

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAttempt_sessionId_key" ON "CheckoutAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "CheckoutAttempt_subscriptionId_idx" ON "CheckoutAttempt"("subscriptionId");

-- AddForeignKey
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
