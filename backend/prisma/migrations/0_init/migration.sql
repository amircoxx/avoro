-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."LocationVisibility" AS ENUM ('RADIUS_ONLY', 'CITY_ONLY', 'EXACT_BUSINESS_ADDRESS');

-- CreateEnum
CREATE TYPE "public"."ProfileMediaRole" AS ENUM ('PROFILE', 'BACKGROUND', 'GALLERY');

-- CreateEnum
CREATE TYPE "public"."ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'CREDITED');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('CUSTOMER', 'TECH', 'ADMIN');

-- CreateTable
CREATE TABLE "public"."PortfolioImage" (
    "id" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageDataUrl" TEXT,
    "role" "public"."ProfileMediaRole" NOT NULL DEFAULT 'GALLERY',

    CONSTRAINT "PortfolioImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "referrerTechProfileId" TEXT NOT NULL,
    "referredTechProfileId" TEXT NOT NULL,
    "referralCodeUsed" TEXT NOT NULL,
    "status" "public"."ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardType" TEXT NOT NULL DEFAULT 'free_month',
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "reportedTechProfileId" TEXT,
    "reportedReviewId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavedTech" (
    "customerId" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedTech_pkey" PRIMARY KEY ("customerId","techProfileId")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "freeMonthCredits" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TechLocation" (
    "id" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "privateAddressLine1" TEXT,
    "privateAddressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "publicLocationLabel" TEXT NOT NULL,
    "locationVisibility" "public"."LocationVisibility" NOT NULL DEFAULT 'RADIUS_ONLY',
    "publicRadiusMiles" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TechProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "bookingUrl" TEXT,
    "profileImageUrl" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT NOT NULL,
    "referredByCode" TEXT,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TechService" (
    "id" TEXT NOT NULL,
    "techProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startingPriceCents" INTEGER,
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "passwordHash" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioImage_storagePath_key" ON "public"."PortfolioImage"("storagePath" ASC);

-- CreateIndex
CREATE INDEX "PortfolioImage_techProfileId_role_sortOrder_idx" ON "public"."PortfolioImage"("techProfileId" ASC, "role" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredTechProfileId_key" ON "public"."Referral"("referredTechProfileId" ASC);

-- CreateIndex
CREATE INDEX "Referral_referrerTechProfileId_idx" ON "public"."Referral"("referrerTechProfileId" ASC);

-- CreateIndex
CREATE INDEX "Review_techProfileId_createdAt_idx" ON "public"."Review"("techProfileId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Review_techProfileId_reviewerId_key" ON "public"."Review"("techProfileId" ASC, "reviewerId" ASC);

-- CreateIndex
CREATE INDEX "SavedTech_customerId_createdAt_idx" ON "public"."SavedTech"("customerId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_techProfileId_key" ON "public"."Subscription"("techProfileId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TechLocation_techProfileId_key" ON "public"."TechLocation"("techProfileId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TechProfile_referralCode_key" ON "public"."TechProfile"("referralCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TechProfile_userId_key" ON "public"."TechProfile"("userId" ASC);

-- CreateIndex
CREATE INDEX "TechService_techProfileId_idx" ON "public"."TechService"("techProfileId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "public"."UserSession"("expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "public"."UserSession"("tokenHash" ASC);

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "public"."UserSession"("userId" ASC);

-- AddForeignKey
ALTER TABLE "public"."PortfolioImage" ADD CONSTRAINT "PortfolioImage_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_referredTechProfileId_fkey" FOREIGN KEY ("referredTechProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_referrerTechProfileId_fkey" FOREIGN KEY ("referrerTechProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reportedTechProfileId_fkey" FOREIGN KEY ("reportedTechProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedTech" ADD CONSTRAINT "SavedTech_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedTech" ADD CONSTRAINT "SavedTech_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TechLocation" ADD CONSTRAINT "TechLocation_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TechProfile" ADD CONSTRAINT "TechProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TechService" ADD CONSTRAINT "TechService_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "public"."TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
