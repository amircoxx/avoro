ALTER TABLE "ConversationParticipant"
ADD COLUMN "emailAlertReservationDeliveryId" TEXT,
ADD COLUMN "emailAlertReservedAt" TIMESTAMP(3);

ALTER TABLE "ConversationParticipant"
ADD CONSTRAINT "ConversationParticipant_email_alert_reservation_pair_check"
CHECK (("emailAlertReservationDeliveryId" IS NULL) = ("emailAlertReservedAt" IS NULL));

CREATE INDEX "ConversationParticipant_userId_conversationId_lastReadSequence_idx"
ON "ConversationParticipant"("userId", "conversationId", "lastReadSequence");

CREATE INDEX "ConversationParticipant_emailAlertReservationDeliveryId_idx"
ON "ConversationParticipant"("emailAlertReservationDeliveryId");
