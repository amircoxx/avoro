import { describe, expect, it } from "vitest";
import { generateAvailableSlots } from "../scheduling/availability-engine";
import { strictLocalToUtc } from "../scheduling/time-zone";

function input(overrides: Partial<Parameters<typeof generateAvailableSlots>[0]> = {}) {
  return {
    month: "2026-07",
    timeZone: "America/New_York",
    durationMinutes: 45,
    bufferMinutes: 0,
    minimumStartAt: new Date("2026-07-21T00:00:00.000Z"),
    maximumStartAt: new Date("2026-07-21T23:59:59.999Z"),
    weekly: [{ weekday: 2, startMinute: 9 * 60, endMinute: 12 * 60 }],
    overrides: [],
    blocked: [],
    ...overrides
  };
}

describe("timezone-safe availability engine", () => {
  it("generates hour and half-hour starts across separate local windows", () => {
    expect(generateAvailableSlots(input({
      weekly: [
        { weekday: 2, startMinute: 9 * 60, endMinute: 10 * 60 },
        { weekday: 2, startMinute: 11 * 60, endMinute: 12 * 60 }
      ]
    }))).toEqual([
      { startAt: "2026-07-21T13:00:00.000Z", localDate: "2026-07-21", localTime: "9:00 AM", timeZone: "America/New_York" },
      { startAt: "2026-07-21T15:00:00.000Z", localDate: "2026-07-21", localTime: "11:00 AM", timeZone: "America/New_York" }
    ]);
  });

  it.each([
    [45, 0, 9 * 60, 10 * 60, ["2026-07-21T13:00:00.000Z"]],
    [60, 0, 9 * 60, 10 * 60, ["2026-07-21T13:00:00.000Z"]],
    [90, 30, 9 * 60, 11 * 60, ["2026-07-21T13:00:00.000Z"]]
  ])("requires the service duration and buffer to fit the window (%i minutes)", (durationMinutes, bufferMinutes, startMinute, endMinute, starts) => {
    expect(generateAvailableSlots(input({
      durationMinutes,
      bufferMinutes,
      weekly: [{ weekday: 2, startMinute, endMinute }]
    })).map((slot) => slot.startAt)).toEqual(starts);
  });

  it("uses half-open blocked ranges so back-to-back availability remains bookable", () => {
    expect(generateAvailableSlots(input({
      durationMinutes: 60,
      bufferMinutes: 30,
      weekly: [{ weekday: 2, startMinute: 9 * 60, endMinute: 12 * 60 }],
      blocked: [{ startAt: new Date("2026-07-21T13:00:00.000Z"), blockedUntilAt: new Date("2026-07-21T14:30:00.000Z") }]
    })).map((slot) => slot.startAt)).toEqual([
      "2026-07-21T14:30:00.000Z"
    ]);
  });

  it("clips starts to minimum notice and the inclusive horizon", () => {
    expect(generateAvailableSlots(input({
      durationMinutes: 30,
      minimumStartAt: new Date("2026-07-21T13:30:00.000Z"),
      maximumStartAt: new Date("2026-07-21T14:30:00.000Z"),
      weekly: [{ weekday: 2, startMinute: 9 * 60, endMinute: 11 * 60 }]
    })).map((slot) => slot.startAt)).toEqual([
      "2026-07-21T13:30:00.000Z",
      "2026-07-21T14:00:00.000Z",
      "2026-07-21T14:30:00.000Z"
    ]);
  });

  it("replaces recurring windows with date overrides and closes unavailable dates", () => {
    expect(generateAvailableSlots(input({
      durationMinutes: 60,
      overrides: [{ localDate: "2026-07-21", unavailable: false, windows: [{ startMinute: 13 * 60, endMinute: 14 * 60 }] }]
    }))).toEqual([
      { startAt: "2026-07-21T17:00:00.000Z", localDate: "2026-07-21", localTime: "1:00 PM", timeZone: "America/New_York" }
    ]);

    expect(generateAvailableSlots(input({
      overrides: [{ localDate: "2026-07-21", unavailable: true, windows: [] }]
    }))).toEqual([]);
  });

  it("fails closed for nonexistent, ambiguous, and invalid local timezone values", () => {
    expect(strictLocalToUtc("2026-03-08", 2 * 60, "America/New_York")).toBeNull();
    expect(strictLocalToUtc("2026-11-01", 1 * 60, "America/New_York")).toBeNull();
    expect(strictLocalToUtc("2026-07-21", 9 * 60, "not/a-zone")).toBeNull();
    expect(generateAvailableSlots(input({
      month: "2026-03",
      minimumStartAt: new Date("2026-03-08T00:00:00.000Z"),
      maximumStartAt: new Date("2026-03-08T23:59:59.999Z"),
      weekly: [{ weekday: 0, startMinute: 2 * 60, endMinute: 3 * 60 }]
    }))).toEqual([]);
    expect(generateAvailableSlots(input({ timeZone: "not/a-zone" }))).toEqual([]);
  });

  it("rejects a spring-forward start whose elapsed end escapes the local window", () => {
    expect(generateAvailableSlots(input({
      month: "2026-03",
      durationMinutes: 60,
      minimumStartAt: new Date("2026-03-08T00:00:00.000Z"),
      maximumStartAt: new Date("2026-03-08T23:59:59.999Z"),
      weekly: [{ weekday: 0, startMinute: 60, endMinute: 3 * 60 }]
    }))).toEqual([
      { startAt: "2026-03-08T06:00:00.000Z", localDate: "2026-03-08", localTime: "1:00 AM", timeZone: "America/New_York" }
    ]);
  });

  it("labels post-gap and post-fall-back slots using their UTC instant in the tech timezone", () => {
    expect(generateAvailableSlots(input({
      month: "2026-03",
      durationMinutes: 30,
      minimumStartAt: new Date("2026-03-08T00:00:00.000Z"),
      maximumStartAt: new Date("2026-03-08T23:59:59.999Z"),
      weekly: [{ weekday: 0, startMinute: 3 * 60, endMinute: 4 * 60 }]
    }))).toEqual([
      { startAt: "2026-03-08T07:00:00.000Z", localDate: "2026-03-08", localTime: "3:00 AM", timeZone: "America/New_York" },
      { startAt: "2026-03-08T07:30:00.000Z", localDate: "2026-03-08", localTime: "3:30 AM", timeZone: "America/New_York" }
    ]);

    expect(generateAvailableSlots(input({
      month: "2026-11",
      durationMinutes: 30,
      minimumStartAt: new Date("2026-11-01T00:00:00.000Z"),
      maximumStartAt: new Date("2026-11-01T23:59:59.999Z"),
      weekly: [{ weekday: 0, startMinute: 2 * 60, endMinute: 3 * 60 }]
    }))).toEqual([
      { startAt: "2026-11-01T07:00:00.000Z", localDate: "2026-11-01", localTime: "2:00 AM", timeZone: "America/New_York" },
      { startAt: "2026-11-01T07:30:00.000Z", localDate: "2026-11-01", localTime: "2:30 AM", timeZone: "America/New_York" }
    ]);
  });
});
