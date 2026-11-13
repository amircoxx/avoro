CREATE TABLE "PasswordResetIpLimit" (
    "ip" INET NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PasswordResetIpLimit_pkey" PRIMARY KEY ("ip")
);
CREATE INDEX "PasswordResetIpLimit_windowStartedAt_idx" ON "PasswordResetIpLimit"("windowStartedAt");
