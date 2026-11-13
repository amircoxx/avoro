import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../prisma/migrations/20260814_add_customer_tech_messaging/migration.sql", import.meta.url), "utf8");
const hardeningMigration = readFileSync(new URL("../../../prisma/migrations/20260821000000_harden_messaging_delivery/migration.sql", import.meta.url), "utf8");

describe("messaging schema", () => {
  it("keeps one conversation per customer and tech with ordered idempotent messages", () => {
    expect(schema).toContain("@@unique([customerId, techProfileId])");
    expect(schema).toContain("sequence        BigInt");
    expect(schema).toContain("@@unique([senderUserId, clientRequestId])");
    expect(schema).toContain("@@index([conversationId, sequence])");
  });

  it("adds database checks Prisma cannot express", () => {
    expect(migration).toContain('CHECK ("blockerUserId" <> "blockedUserId")');
    expect(migration).toContain('CHECK ("lastReadSequence" >= 0)');
    expect(migration).toContain('CREATE UNIQUE INDEX "Conversation_customerId_techProfileId_key"');
  });

  it("adds an atomic email reservation pair and indexed unread aggregate inputs", () => {
    expect(schema).toContain("emailAlertReservationDeliveryId String?");
    expect(schema).toMatch(/\bemailAlertReservedAt\s+DateTime\?/);
    expect(schema).toContain("@@index([userId, conversationId, lastReadSequence])");
    expect(hardeningMigration).toContain('"ConversationParticipant_email_alert_reservation_pair_check"');
    expect(hardeningMigration).toContain('CHECK (("emailAlertReservationDeliveryId" IS NULL) = ("emailAlertReservedAt" IS NULL))');
  });
});
