import { describe, expect, it } from "vitest";
import { rescheduleBookingSchema } from "../../validations/booking.schema";

const input = {
  startAt: "2026-07-22T09:00:00-04:00",
  version: 0,
  requestKey: "32e724ab-1f46-43f8-868c-b46a924fb534"
};

describe("reschedule request validation", () => {
  it("accepts an offset date, version zero, and an omitted reason", () => {
    expect(rescheduleBookingSchema.parse(input)).toEqual(input);
  });

  it("trims the reason and accepts the 500-character boundary", () => {
    expect(rescheduleBookingSchema.parse({ ...input, reason: `  ${"a".repeat(500)}  ` }).reason)
      .toBe("a".repeat(500));
  });

  it.each([
    { version: -1 }, { version: 1.5 }, { version: "0" }, { version: undefined },
    { requestKey: "invalid" }, { requestKey: undefined },
    { startAt: "not-a-date" }, { startAt: "2026-07-22T09:00:00" },
    { reason: "a".repeat(501) }, { reason: null },
    { customerId: "cannot-change-owner" }, { durationMinutes: 15 }
  ])("rejects invalid or unsupported request fields %j", (fields) => {
    expect(rescheduleBookingSchema.safeParse({ ...input, ...fields }).success).toBe(false);
  });
});
