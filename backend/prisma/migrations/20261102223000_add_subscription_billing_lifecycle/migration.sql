ALTER TABLE "Subscription"
  ADD COLUMN "plan" TEXT,
  ADD COLUMN "interval" TEXT,
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelAt" TIMESTAMP(3),
  ADD COLUMN "billingVersion" INTEGER NOT NULL DEFAULT 0;
