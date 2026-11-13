-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BookingReschedule" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "oldStartAt" TIMESTAMPTZ(3) NOT NULL,
    "oldEndAt" TIMESTAMPTZ(3) NOT NULL,
    "oldBlockedUntilAt" TIMESTAMPTZ(3) NOT NULL,
    "newStartAt" TIMESTAMPTZ(3) NOT NULL,
    "newEndAt" TIMESTAMPTZ(3) NOT NULL,
    "newBlockedUntilAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingReschedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingReschedule_bookingId_createdAt_idx" ON "BookingReschedule"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingReschedule_bookingId_requestKey_key" ON "BookingReschedule"("bookingId", "requestKey");

-- AddForeignKey
ALTER TABLE "BookingReschedule" ADD CONSTRAINT "BookingReschedule_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReschedule" ADD CONSTRAINT "BookingReschedule_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
