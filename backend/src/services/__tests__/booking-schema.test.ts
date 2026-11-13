import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../../prisma/migrations/20260720_add_direct_booking/migration.sql", import.meta.url),
  "utf8"
);

describe("booking database contract", () => {
  it("defines durable booking and scheduling records", () => {
    expect(schema).toContain("model TechScheduleSettings");
    expect(schema).toContain("model WeeklyAvailabilityWindow");
    expect(schema).toContain("model AvailabilityOverride");
    expect(schema).toContain("model Booking");
    expect(schema).toContain("model NotificationOutbox");
    expect(schema).toContain("@@unique([customerId, requestKey])");
  });

  it("enforces non-overlap in PostgreSQL rather than application code alone", () => {
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS "btree_gist"');
    expect(migration).toContain('CONSTRAINT "Booking_no_confirmed_overlap"');
    expect(schema).toMatch(/\bstartAt\s+DateTime\s+@db\.Timestamptz\(3\)/);
    expect(schema).toMatch(/\bendAt\s+DateTime\s+@db\.Timestamptz\(3\)/);
    expect(schema).toMatch(/\bblockedUntilAt\s+DateTime\s+@db\.Timestamptz\(3\)/);
    expect(migration).toContain('"startAt" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"endAt" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('"blockedUntilAt" TIMESTAMPTZ(3) NOT NULL');
    expect(migration).toContain('tstzrange("startAt", "blockedUntilAt", \'[)\') WITH &&');
    expect(migration).toContain('WHERE ("status" = \'CONFIRMED\')');
  });
});
