import { describe, expect, it } from "vitest";
import { formatAppointmentEnd, formatCancellationCutoff } from "../booking-summary";

describe("booking summary policy and timezone labels", () => {
  it("formats the real ending instant across the spring DST gap", () => {
    expect(formatAppointmentEnd("2026-03-08T06:30:00.000Z", 60, "America/New_York")).toBe("3:30 AM");
  });

  it("formats the real ending instant across the fall DST fold", () => {
    expect(formatAppointmentEnd("2026-11-01T05:30:00.000Z", 60, "America/New_York")).toBe("1:30 AM");
  });

  it("states the exact current cancellation cutoff in plain language", () => {
    expect(formatCancellationCutoff(1440)).toBe("Cancel at least 1 day before the appointment.");
    expect(formatCancellationCutoff(90)).toBe("Cancel at least 1 hour 30 minutes before the appointment.");
  });
});
