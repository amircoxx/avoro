-- CreateTable
CREATE TABLE "PasswordResetCooldown" (
    "email" TEXT NOT NULL,
    "nextAllowedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetCooldown_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "PasswordResetCooldown_nextAllowedAt_idx" ON "PasswordResetCooldown"("nextAllowedAt");
