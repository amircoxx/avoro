import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const databaseSuite = runDatabaseTests ? describe : describe.skip;

databaseSuite("booking concurrency against TEST_DATABASE_URL (skipped unless RUN_DB_TESTS=1)", () => {
  let fixtureClient: PrismaClient;
  let createBooking: typeof import("../services/booking.service").createBooking;
  let cancelBooking: typeof import("../services/booking.service").cancelBooking;
  let replaceOwnWeeklyAvailability: typeof import("../services/schedule.service").replaceOwnWeeklyAvailability;
  let sharedPrisma: typeof import("../models/database.model").prisma;
  const customerIds = [randomUUID(), randomUUID()];
  const techProfileIds = [randomUUID(), randomUUID(), randomUUID()];
  const serviceIds = [randomUUID(), randomUUID(), randomUUID()];

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) throw new Error("RUN_DB_TESTS=1 requires a dedicated TEST_DATABASE_URL");

    process.env.DATABASE_URL = testDatabaseUrl;
    fixtureClient = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    ({ prisma: sharedPrisma } = await import("../models/database.model"));
    ({ createBooking, cancelBooking } = await import("../services/booking.service"));
    ({ replaceOwnWeeklyAvailability } = await import("../services/schedule.service"));
    await createFixtures();
  });

  afterAll(async () => {
    if (!fixtureClient) return;
    await fixtureClient.notificationOutbox.deleteMany({
      where: { booking: { OR: [{ customerId: { in: customerIds } }, { techProfileId: { in: techProfileIds } }] } }
    });
    await fixtureClient.booking.deleteMany({
      where: { OR: [{ customerId: { in: customerIds } }, { techProfileId: { in: techProfileIds } }] }
    });
    await fixtureClient.weeklyAvailabilityWindow.deleteMany({ where: { techProfileId: { in: techProfileIds } } });
    await fixtureClient.techScheduleSettings.deleteMany({ where: { techProfileId: { in: techProfileIds } } });
    await fixtureClient.techService.deleteMany({ where: { id: { in: serviceIds } } });
    await fixtureClient.techProfile.deleteMany({ where: { id: { in: techProfileIds } } });
    await fixtureClient.user.deleteMany({ where: { id: { in: [...customerIds, ...techProfileIds] } } });
    await Promise.all([fixtureClient.$disconnect(), sharedPrisma?.$disconnect()]);
  });

  it("returns one booking and one outbox pair for simultaneous uses of the same request key", async () => {
    const sameRequestKey = randomUUID();
    const sameRequest = {
      techProfileId: techProfileIds[2],
      serviceId: serviceIds[2],
      startAt: "2026-07-21T13:00:00.000Z",
      requestKey: sameRequestKey
    };
    const sameKeyWrites = await Promise.allSettled([
      createBooking(customerIds[0], sameRequest, new Date("2026-07-20T12:00:00.000Z")),
      createBooking(customerIds[0], sameRequest, new Date("2026-07-20T12:00:00.000Z"))
    ]);

    expect(sameKeyWrites.every((result) => result.status === "fulfilled")).toBe(true);
    const bookingIds = sameKeyWrites.flatMap((result) => result.status === "fulfilled" ? [result.value.booking.id] : []);
    expect(new Set(bookingIds).size).toBe(1);
    const persisted = await fixtureClient.booking.findMany({
      where: { customerId: customerIds[0], requestKey: sameRequestKey },
      select: { id: true }
    });
    expect(persisted).toEqual([{ id: bookingIds[0] }]);
    await expect(fixtureClient.notificationOutbox.count({
      where: { bookingId: bookingIds[0], messageKind: "BOOKING_CONFIRMED" }
    })).resolves.toBe(2);
  });

  it("allows one winner for simultaneous overlapping requests with different keys", async () => {
    const overlapWrites = await Promise.allSettled([
      createBooking(customerIds[0], {
        techProfileId: techProfileIds[0],
        serviceId: serviceIds[0],
        startAt: "2026-07-21T13:00:00.000Z",
        requestKey: randomUUID()
      }, new Date("2026-07-20T12:00:00.000Z")),
      createBooking(customerIds[1], {
        techProfileId: techProfileIds[0],
        serviceId: serviceIds[0],
        startAt: "2026-07-21T13:00:00.000Z",
        requestKey: randomUUID()
      }, new Date("2026-07-20T12:00:00.000Z"))
    ]);

    expect(overlapWrites.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(overlapWrites.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(overlapWrites.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "booking_conflict" }
    });
    await expect(fixtureClient.booking.count({
      where: { techProfileId: techProfileIds[0], status: "CONFIRMED" }
    })).resolves.toBe(1);
  });

  it("permits adjacent half-open bookings", async () => {
    const adjacentWrites = await Promise.allSettled([
      createBooking(customerIds[0], {
        techProfileId: techProfileIds[1],
        serviceId: serviceIds[1],
        startAt: "2026-07-21T13:00:00.000Z",
        requestKey: randomUUID()
      }, new Date("2026-07-20T12:00:00.000Z")),
      createBooking(customerIds[1], {
        techProfileId: techProfileIds[1],
        serviceId: serviceIds[1],
        startAt: "2026-07-21T13:30:00.000Z",
        requestKey: randomUUID()
      }, new Date("2026-07-20T12:00:00.000Z"))
    ]);

    expect(adjacentWrites.every((result) => result.status === "fulfilled")).toBe(true);
    await expect(fixtureClient.booking.count({
      where: { techProfileId: techProfileIds[1], status: "CONFIRMED" }
    })).resolves.toBe(2);
  });

  it("serializes whole weekly replacements even when the current schedule is empty", async () => {
    const techProfileId = techProfileIds[1];
    await fixtureClient.weeklyAvailabilityWindow.deleteMany({ where: { techProfileId } });
    const replacementA = [
      { weekday: 1, windows: [{ startMinute: 540, endMinute: 720 }, { startMinute: 780, endMinute: 900 }] }
    ];
    const replacementB = [
      { weekday: 3, windows: [{ startMinute: 600, endMinute: 840 }] },
      { weekday: 5, windows: [{ startMinute: 660, endMinute: 960 }] }
    ];

    await Promise.all([
      replaceOwnWeeklyAvailability(techProfileId, replacementA),
      replaceOwnWeeklyAvailability(techProfileId, replacementB)
    ]);

    const persisted = await fixtureClient.weeklyAvailabilityWindow.findMany({
      where: { techProfileId },
      select: { weekday: true, startMinute: true, endMinute: true },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }]
    });
    const flattenedA = replacementA.flatMap(({ weekday, windows }) => windows.map((window) => ({ weekday, ...window })));
    const flattenedB = replacementB.flatMap(({ weekday, windows }) => windows.map((window) => ({ weekday, ...window })));
    expect([flattenedA, flattenedB]).toContainEqual(persisted);
  });

  it("releases a canceled range for a later valid booking and creates one cancellation outbox pair", async () => {
    const startAt = "2026-07-21T14:00:00.000Z";
    const original = await createBooking(customerIds[0], {
      techProfileId: techProfileIds[2],
      serviceId: serviceIds[2],
      startAt,
      requestKey: randomUUID()
    }, new Date("2026-07-20T12:00:00.000Z"));

    const concurrentCancellations = await Promise.all([
      cancelBooking(
        { id: customerIds[0], role: "CUSTOMER" },
        original.booking.id,
        new Date("2026-07-20T12:00:00.000Z")
      ),
      cancelBooking(
        { id: customerIds[0], role: "CUSTOMER" },
        original.booking.id,
        new Date("2026-07-20T12:00:00.000Z")
      )
    ]);
    expect(concurrentCancellations).toEqual([
      expect.objectContaining({ id: original.booking.id, status: "CANCELED" }),
      expect.objectContaining({ id: original.booking.id, status: "CANCELED" })
    ]);
    await expect(fixtureClient.notificationOutbox.count({
      where: { bookingId: original.booking.id, messageKind: "BOOKING_CANCELED" }
    })).resolves.toBe(2);

    await expect(createBooking(customerIds[1], {
      techProfileId: techProfileIds[2],
      serviceId: serviceIds[2],
      startAt,
      requestKey: randomUUID()
    }, new Date("2026-07-20T12:00:00.000Z"))).resolves.toMatchObject({
      replayed: false,
      booking: { status: "CONFIRMED", startAt }
    });
  });

  async function createFixtures() {
    await fixtureClient.user.createMany({
      data: [
        { id: customerIds[0], email: `${customerIds[0]}@example.test`, fullName: "Race Customer One", role: "CUSTOMER" },
        { id: customerIds[1], email: `${customerIds[1]}@example.test`, fullName: "Race Customer Two", role: "CUSTOMER" },
        { id: techProfileIds[0], email: `${techProfileIds[0]}@example.test`, fullName: "Race Tech One", role: "TECH" },
        { id: techProfileIds[1], email: `${techProfileIds[1]}@example.test`, fullName: "Race Tech Two", role: "TECH" },
        { id: techProfileIds[2], email: `${techProfileIds[2]}@example.test`, fullName: "Race Tech Three", role: "TECH" }
      ]
    });
    for (let index = 0; index < techProfileIds.length; index += 1) {
      await fixtureClient.techProfile.create({
        data: {
          id: techProfileIds[index],
          userId: techProfileIds[index],
          businessName: `Race Studio ${index + 1}`,
          displayName: `Race Tech ${index + 1}`,
          referralCode: `RACE-${randomUUID()}`,
          isPublished: true,
          services: {
            create: {
              id: serviceIds[index],
              name: "Race Service",
              durationMinutes: 30,
              startingPriceCents: 5000,
              isActive: true
            }
          },
          scheduleSettings: {
            create: {
              timeZone: "America/New_York",
              minimumNoticeMinutes: 0,
              maximumAdvanceDays: 2,
              bufferMinutes: 0,
              cancellationCutoffMinutes: 60
            }
          },
          weeklyAvailability: {
            create: { weekday: 2, startMinute: 540, endMinute: 720 }
          }
        }
      });
    }
  }
});
