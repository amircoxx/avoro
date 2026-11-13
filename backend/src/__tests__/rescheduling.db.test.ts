import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const now = new Date("2026-07-20T12:00:00Z");
suite("rescheduling transactions on an isolated test database", () => {
  let db: PrismaClient;
  let shared: PrismaClient;
  let service: typeof import("../services/booking.service");
  let availability: typeof import("../services/availability.service");
  const users: string[] = [];
  let customerId: string;
  let techId: string;
  let serviceId: string;
  const actor = () => ({ id: customerId, role: "CUSTOMER" as const });
  const input = (startAt = "2026-07-21T15:00:00Z") => ({ startAt, version: 0, requestKey: randomUUID() });

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/test/i.test(new URL(url).pathname)) throw new Error("A dedicated TEST_DATABASE_URL with test in its database name is required");
    process.env.DATABASE_URL = url;
    db = new PrismaClient({ datasourceUrl: url });
    ({ prisma: shared } = await import("../models/database.model"));
    service = await import("../services/booking.service");
    availability = await import("../services/availability.service");
  });

  beforeEach(async () => {
    customerId = randomUUID(); techId = randomUUID(); serviceId = randomUUID();
    users.push(customerId, techId);
    await db.user.createMany({ data: [
      { id: customerId, email: `${customerId}@example.test`, role: "CUSTOMER" },
      { id: techId, email: `${techId}@example.test`, role: "TECH" }
    ] });
    await db.techProfile.create({ data: {
      id: techId, userId: techId, businessName: "Test Studio", displayName: "Test Tech",
      referralCode: randomUUID(), isPublished: true,
      services: { create: { id: serviceId, name: "Original service", durationMinutes: 60, startingPriceCents: 5000, isActive: true } },
      scheduleSettings: { create: { timeZone: "America/New_York", minimumNoticeMinutes: 0, maximumAdvanceDays: 30, bufferMinutes: 0, cancellationCutoffMinutes: 60 } },
      weeklyAvailability: { create: { weekday: 2, startMinute: 540, endMinute: 1020 } }
    } });
  });

  afterAll(async () => {
    if (!db) return;
    await db.notificationOutbox.deleteMany({ where: { booking: { customerId: { in: users } } } });
    await db.booking.deleteMany({ where: { customerId: { in: users } } });
    await db.techProfile.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await Promise.all([db.$disconnect(), shared?.$disconnect()]);
  });

  async function create(startAt = "2026-07-21T13:00:00Z") {
    return (await service.createBooking(customerId, { techProfileId: techId, serviceId, startAt, requestKey: randomUUID() }, now)).booking;
  }

  it("loads slots and reschedules through real authenticated HTTP requests", async () => {
    const original = await create();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { default: express } = await import("express");
    const { bookingRouter } = await import("../routes/booking.routes");
    const { errorHandler } = await import("../middleware/error.middleware");
    const { createSession } = await import("../services/session.service");
    const app = express();
    app.use(express.json());
    app.use("/api/bookings", bookingRouter);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test port");
      const url = `http://127.0.0.1:${address.port}/api/bookings/${original.id}`;
      const { token } = await createSession(customerId);
      const headers = { Cookie: `find_my_tech_session=${token}`, "Content-Type": "application/json" };
      expect((await fetch(`${url}/reschedule-availability?month=2026-07`)).status).toBe(401);
      const response = await fetch(`${url}/reschedule-availability?month=2026-07`, { headers });
      expect(response.status).toBe(200);
      const { data } = await response.json() as { data: { version: number; slots: Array<{ startAt: string }> } };
      const selected = data.slots.find(slot => slot.startAt === "2026-07-21T15:00:00.000Z");
      expect(selected).toBeDefined();
      const request = { ...input(selected!.startAt), version: data.version };
      const moved = await fetch(`${url}/reschedule`, { method: "POST", headers, body: JSON.stringify(request) });
      expect(moved.status).toBe(200);
      expect(await moved.json()).toMatchObject({ data: { booking: { id: original.id, version: 1, startAt: selected!.startAt } } });
      const replay = await fetch(`${url}/reschedule`, { method: "POST", headers, body: JSON.stringify(request) });
      expect(replay.status).toBe(200);
      const stale = await fetch(`${url}/reschedule`, { method: "POST", headers, body: JSON.stringify({ ...input("2026-07-21T17:00:00Z"), version: 0 }) });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ error: { code: "booking_version_conflict" } });
      expect(await db.bookingReschedule.count({ where: { bookingId: original.id } })).toBe(1);
      expect(await db.notificationOutbox.count({ where: { bookingId: original.id, messageKind: "BOOKING_RESCHEDULED" } })).toBe(2);
    } finally {
      vi.useRealTimers();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("replays simultaneous identical moves with one history and one notification pair", async () => {
    const original = await create(); const request = input();
    const results = await Promise.all([
      service.rescheduleBooking(actor(), original.id, request, now),
      service.rescheduleBooking(actor(), original.id, request, now)
    ]);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
    expect(results.map(r => r.booking.version)).toEqual([1, 1]);
    expect(await db.bookingReschedule.count({ where: { bookingId: original.id } })).toBe(1);
    expect(await db.notificationOutbox.count({ where: { bookingId: original.id, messageKind: "BOOKING_RESCHEDULED" } })).toBe(2);
    await expect(service.rescheduleBooking(actor(), original.id, { ...request, reason: "different" }, now))
      .rejects.toMatchObject({ code: "request_key_conflict" });
  });

  it("allows only one of two moves using the same version", async () => {
    const original = await create();
    const results = await Promise.allSettled([
      service.rescheduleBooking(actor(), original.id, input(), now),
      service.rescheduleBooking(actor(), original.id, input("2026-07-21T17:00:00Z"), now)
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "booking_version_conflict" } });
    expect(await db.bookingReschedule.count({ where: { bookingId: original.id } })).toBe(1);
  });

  it("allows only one of two appointments to move into the same slot", async () => {
    const first = await create(); const second = await create("2026-07-21T14:00:00Z");
    const results = await Promise.allSettled([
      service.rescheduleBooking(actor(), first.id, input(), now),
      service.rescheduleBooking(actor(), second.id, input(), now)
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "booking_conflict" } });
    expect(await db.bookingReschedule.count({ where: { bookingId: { in: [first.id, second.id] } } })).toBe(1);
  });

  it("prevents a new booking and a reschedule from claiming the same slot", async () => {
    const original = await create();
    const results = await Promise.allSettled([
      service.rescheduleBooking(actor(), original.id, input(), now),
      create("2026-07-21T15:00:00Z")
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "booking_conflict" } });
  });

  it("keeps cancellation and rescheduling consistent when they race", async () => {
    const original = await create();
    const results = await Promise.allSettled([
      service.cancelBooking(actor(), original.id, now),
      service.rescheduleBooking(actor(), original.id, input(), now)
    ]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    const current = await db.booking.findUniqueOrThrow({ where: { id: original.id } });
    const history = await db.bookingReschedule.count({ where: { bookingId: original.id } });
    expect(current.version).toBe(history + (current.status === "CANCELED" ? 1 : 0));
    expect(await db.notificationOutbox.count({ where: { bookingId: original.id, messageKind: "BOOKING_RESCHEDULED" } })).toBe(history * 2);
    const cancellations = await db.notificationOutbox.findMany({ where: { bookingId: original.id, messageKind: "BOOKING_CANCELED" } });
    expect(cancellations).toHaveLength(current.status === "CANCELED" ? 2 : 0);
    for (const event of cancellations) expect(event.payload).toMatchObject({ startAt: current.startAt.toISOString() });
  });

  it("uses saved service data, frees the old range, and offers overlapping moves", async () => {
    const original = await create();
    await db.techService.update({ where: { id: serviceId }, data: { durationMinutes: 180, startingPriceCents: 9999, isActive: false } });
    const slots = await availability.getRescheduleAvailability(actor(), original.id, "2026-07", now);
    expect(slots.service).toMatchObject({ durationMinutes: 60, startingPriceCents: 5000 });
    expect(slots.slots).toContainEqual(expect.objectContaining({ startAt: "2026-07-21T13:30:00.000Z" }));
    const moved = await service.rescheduleBooking(actor(), original.id, input("2026-07-21T13:30:00Z"), now);
    expect(moved.booking).toMatchObject({ durationMinutes: 60, startingPriceCents: 5000, endAt: "2026-07-21T14:30:00.000Z" });
    await service.rescheduleBooking(actor(), original.id, { ...input(), version: 1 }, now);
    await db.techService.update({ where: { id: serviceId }, data: { durationMinutes: 60, isActive: true } });
    await expect(create()).resolves.toHaveProperty("startAt", original.startAt);
  });

  it("rolls back the move and history if queuing notifications fails", async () => {
    const original = await create();
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `reject_reschedule_${suffix}`;
    // Both SQL identifiers and the booking ID are generated UUIDs, never user input.
    await db.$executeRawUnsafe(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW."bookingId" = '${original.id}' AND NEW."messageKind" = 'BOOKING_RESCHEDULED' THEN
        RAISE EXCEPTION 'test outbox failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${functionName} BEFORE INSERT ON "NotificationOutbox" FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
      await expect(service.rescheduleBooking(actor(), original.id, input(), now)).rejects.toThrow();
      const current = await db.booking.findUniqueOrThrow({ where: { id: original.id } });
      expect(current.startAt.toISOString()).toBe(original.startAt);
      expect(current.version).toBe(0);
      expect(await db.bookingReschedule.count({ where: { bookingId: original.id } })).toBe(0);
      expect(await db.notificationOutbox.count({ where: { bookingId: original.id, messageKind: "BOOKING_RESCHEDULED" } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${functionName} ON "NotificationOutbox"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${functionName}()`);
    }
  });
});
