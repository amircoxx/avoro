-- CreateEnum
CREATE TYPE "AvailabilityOverrideKind" AS ENUM ('UNAVAILABLE', 'CUSTOM_HOURS');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELED');

-- AlterTable
ALTER TABLE "TechService"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "TechScheduleSettings" (
  "id" TEXT NOT NULL,
  "techProfileId" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "minimumNoticeMinutes" INTEGER NOT NULL,
  "maximumAdvanceDays" INTEGER NOT NULL,
  "bufferMinutes" INTEGER NOT NULL,
  "cancellationCutoffMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TechScheduleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAvailabilityWindow" (
  "id" TEXT NOT NULL,
  "techProfileId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeeklyAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityOverride" (
  "id" TEXT NOT NULL,
  "techProfileId" TEXT NOT NULL,
  "localDate" DATE NOT NULL,
  "kind" "AvailabilityOverrideKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityOverrideWindow" (
  "id" TEXT NOT NULL,
  "availabilityOverrideId" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AvailabilityOverrideWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "techProfileId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "techServiceId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "serviceNameSnapshot" TEXT NOT NULL,
  "durationMinutesSnapshot" INTEGER NOT NULL,
  "startingPriceCentsSnapshot" INTEGER NOT NULL,
  "timeZoneSnapshot" TEXT NOT NULL,
  "cancellationCutoffMinutesSnapshot" INTEGER NOT NULL,
  "startAt" TIMESTAMPTZ(3) NOT NULL,
  "endAt" TIMESTAMPTZ(3) NOT NULL,
  "blockedUntilAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "canceledAt" TIMESTAMP(3),
  "canceledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "messageKind" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "leasedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "brevoMessageId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechScheduleSettings_techProfileId_key" ON "TechScheduleSettings"("techProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAvailabilityWindow_techProfileId_weekday_startMinute__key" ON "WeeklyAvailabilityWindow"("techProfileId", "weekday", "startMinute", "endMinute");

-- CreateIndex
CREATE INDEX "WeeklyAvailabilityWindow_techProfileId_weekday_idx" ON "WeeklyAvailabilityWindow"("techProfileId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityOverride_techProfileId_localDate_key" ON "AvailabilityOverride"("techProfileId", "localDate");

-- CreateIndex
CREATE INDEX "AvailabilityOverride_techProfileId_localDate_idx" ON "AvailabilityOverride"("techProfileId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityOverrideWindow_availabilityOverrideId_startMinu_key" ON "AvailabilityOverrideWindow"("availabilityOverrideId", "startMinute", "endMinute");

-- CreateIndex
CREATE INDEX "AvailabilityOverrideWindow_availabilityOverrideId_idx" ON "AvailabilityOverrideWindow"("availabilityOverrideId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_customerId_requestKey_key" ON "Booking"("customerId", "requestKey");

-- CreateIndex
CREATE INDEX "Booking_techProfileId_startAt_idx" ON "Booking"("techProfileId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_customerId_startAt_idx" ON "Booking"("customerId", "startAt");

-- CreateIndex
CREATE INDEX "Booking_status_startAt_idx" ON "Booking"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_eventKey_key" ON "NotificationOutbox"("eventKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_nextAttemptAt_idx" ON "NotificationOutbox"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "TechScheduleSettings" ADD CONSTRAINT "TechScheduleSettings_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAvailabilityWindow" ADD CONSTRAINT "WeeklyAvailabilityWindow_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "TechProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityOverrideWindow" ADD CONSTRAINT "AvailabilityOverrideWindow_availabilityOverrideId_fkey" FOREIGN KEY ("availabilityOverrideId") REFERENCES "AvailabilityOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_techProfileId_fkey" FOREIGN KEY ("techProfileId") REFERENCES "TechProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_techServiceId_fkey" FOREIGN KEY ("techServiceId") REFERENCES "TechService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add database invariants Prisma cannot express.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE "WeeklyAvailabilityWindow"
  ADD CONSTRAINT "WeeklyAvailabilityWindow_valid_weekday"
    CHECK ("weekday" >= 0 AND "weekday" <= 6),
  ADD CONSTRAINT "WeeklyAvailabilityWindow_valid_minute_range"
    CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

ALTER TABLE "AvailabilityOverrideWindow"
  ADD CONSTRAINT "AvailabilityOverrideWindow_valid_minute_range"
    CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_valid_range"
  CHECK ("startAt" < "endAt" AND "endAt" <= "blockedUntilAt"),
  ADD CONSTRAINT "Booking_no_confirmed_overlap"
  EXCLUDE USING gist (
    "techProfileId" WITH =,
    tstzrange("startAt", "blockedUntilAt", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');
