# Direct Booking and Tech Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build database-safe direct booking, customer booking history/cancellation, a tech schedule and services workspace, and durable Brevo notifications.

**Architecture:** The Express API remains controller → service → Prisma. PostgreSQL owns the hard non-overlap invariant through a partial GiST exclusion constraint, while a pure Luxon-based engine generates timezone-safe candidate slots and transactional services revalidate every write. The React frontend adds focused customer and tech pages through the existing API-module → facade → page pattern.

**Tech Stack:** React 19, React Router 7, Vite 6, Express 5, Prisma 6.19, PostgreSQL, Zod 3, Vitest 3, Luxon 3.7.2, Brevo transactional email API.

## Global Constraints

- Booking consistency takes priority over availability; uncertain or stale state fails closed.
- Confirmed blocked ranges for one tech must never overlap, including under concurrent requests.
- Store appointment instants in UTC; calculate and label them using the tech's IANA timezone.
- Appointment starts are aligned to `:00` or `:30`; the configured buffer extends the blocked range after the customer-visible end.
- Customers must authenticate with role `CUSTOMER` to create or cancel; tech schedule operations require role `TECH` and ownership.
- Bookings confirm immediately. There are no payments, guest bookings, approval requests, drag-to-reschedule, or external calendar synchronization.
- Existing bookings preserve service, price, duration, timezone, buffer result, and cancellation-policy snapshots.
- Schedule/service changes never mutate or silently cancel an existing booking.
- Brevo failure never rolls back a booking; notification rows commit in the booking transaction and retry asynchronously.
- Keep the existing controller → service → Prisma organization; do not add repository or mapper layers.
- Preserve the unrelated local edits in `frontend/src/assets/globals.css`, `frontend/src/pages/__tests__/home-page.test.tsx`, and `frontend/src/pages/__tests__/how-it-works-page.test.tsx`; inspect and merge around them instead of overwriting.

---

## File structure

### Backend files to create

- `backend/src/validations/schedule.schema.ts` — schedule, windows, overrides, services, and range query validation.
- `backend/src/validations/booking.schema.ts` — availability month, booking-create, and route-param validation.
- `backend/src/services/scheduling/time-zone.ts` — IANA validation, strict local-to-UTC conversion, and display helpers.
- `backend/src/services/scheduling/availability-engine.ts` — pure slot generation and overlap filtering.
- `backend/src/services/availability.service.ts` — Prisma-backed public availability query.
- `backend/src/services/tech-service.service.ts` — stable service CRUD and deactivation.
- `backend/src/services/schedule.service.ts` — settings, recurring windows, overrides, warnings, and tech calendar reads.
- `backend/src/services/booking.service.ts` — idempotent create, customer history, cancellation, and conflict mapping.
- `backend/src/services/booking-dto.ts` — booking snapshot/public DTO construction shared by booking and schedule services.
- `backend/src/services/email/booking-email.ts` — deterministic confirmation/cancellation subjects and HTML/text bodies.
- `backend/src/services/email/brevo.client.ts` — the isolated Brevo HTTP adapter.
- `backend/src/services/email/outbox-dispatcher.ts` — row claiming, retry classification, leasing, and polling lifecycle.
- `backend/src/controllers/booking.controller.ts` and `backend/src/routes/booking.routes.ts` — customer booking HTTP adapters.
- `backend/src/controllers/schedule.controller.ts` and `backend/src/routes/schedule.routes.ts` — tech schedule/service HTTP adapters.
- Focused unit/API/database tests beside the matching backend layer.

### Backend files to modify

- `backend/prisma/schema.prisma` and a new timestamped migration — schedule, service lifecycle, booking, outbox, checks, and exclusion constraint.
- `backend/src/services/tech-profile.service.ts` — stop destructive service replacement.
- `backend/src/services/marketplace-shared.ts` — expose active services and `bookingEnabled` without the legacy external URL.
- `backend/src/controllers/tech.controller.ts`, `backend/src/routes/tech.routes.ts`, and `backend/src/routes/api.routes.ts` — mount public availability and new resource routers.
- `backend/src/utils/api-response.ts` — stable booking conflict mapping.
- `backend/src/config/env.ts` and `backend/src/server.ts` — Brevo configuration and dispatcher lifecycle.
- `backend/package.json`, root `package-lock.json` — Luxon and its TypeScript declarations.

### Frontend files to create

- `frontend/src/services/api/booking-types.ts` — booking, availability, schedule, service, and warning contracts.
- `frontend/src/services/api/bookings.ts` and `frontend/src/services/api/schedule.ts` — browser transport functions.
- `frontend/src/facades/booking.facade.ts`, `customer-bookings.facade.ts`, and `schedule.facade.ts` — page-level workflows.
- `frontend/src/pages/booking-page.tsx` plus `frontend/src/pages/booking/*` — service picker, month calendar, day slots, and confirmation.
- `frontend/src/pages/customer-bookings-page.tsx` plus `frontend/src/pages/customer-bookings/*` — history, details, and cancellation.
- `frontend/src/pages/schedule-page.tsx` plus `frontend/src/pages/schedule/*` — tab shell, calendar, availability form, overrides, services, and booking details.
- Focused facade/component/page tests beside each new frontend feature.

### Frontend files to modify

- `frontend/src/services/api/client.ts` and `frontend/src/services/api.ts` — structured API errors and exports.
- `frontend/src/services/api/types.ts` and `profiles.ts` — service lifecycle/booking flags and removal of profile-owned service/booking URL edits.
- `frontend/src/components/layout/account-auth-context.tsx`, `site-header.tsx`, and auth tests — share authenticated user state and expose My bookings/Schedule navigation.
- `frontend/src/components/layout/tech-profile-details-modal.tsx`, `tech-profile-preview.tsx`, their tests, `frontend/src/pages/tech-profile/editor-state.ts`, and tech-profile page tests — remove legacy service/booking URL editing.
- `frontend/src/pages/for-techs-page.tsx` and its tests — keep onboarding profile-only and send the tech to schedule setup.
- `frontend/src/pages/artist-profile-page.tsx`, `frontend/src/pages/artist-profile/profile-overview.tsx`, and tests — internal Book now/unavailable behavior.
- `frontend/src/routes/app-routes.tsx`, `frontend/src/assets/globals.css` — routes and responsive/accessibility styles.
- `.env.example` and `README.md` — Brevo, public URL, migration, and verification instructions.

---

### Task 1: Add the migration-backed scheduling and booking schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260720_add_direct_booking/migration.sql`
- Create: `backend/src/services/__tests__/booking-schema.test.ts`

**Interfaces:**
- Consumes: existing `User`, `TechProfile`, and `TechService` models.
- Produces: Prisma models/enums `TechScheduleSettings`, `WeeklyAvailabilityWindow`, `AvailabilityOverride`, `AvailabilityOverrideWindow`, `Booking`, `BookingStatus`, `NotificationOutbox`, and stable `TechService.isActive`/`updatedAt` fields.

- [ ] **Step 1: Write the failing schema-contract test**

```ts
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
    expect(migration).toContain('tstzrange("startAt", "blockedUntilAt", \'[)\') WITH &&');
    expect(migration).toContain('WHERE ("status" = \'CONFIRMED\')');
  });
});
```

- [ ] **Step 2: Run the test and confirm the contract is absent**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-schema.test.ts`

Expected: FAIL because the migration and models do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

Add exact enums and fields matching the approved spec. Use `DateTime @db.Date` for override dates; `Int` minutes from local midnight for windows; `@@unique([techProfileId, weekday, startMinute, endMinute])`; `@@unique([techProfileId, localDate])`; `@@unique([customerId, requestKey])`; and indexes on tech/date, customer/start, status/start, and outbox due time. Add `User.customerBookings`, `User.canceledBookings`, `TechProfile.bookings`, `TechProfile.scheduleSettings`, availability collections, and `TechService.bookings` relations.

The booking snapshot block must be:

```prisma
model Booking {
  id                                String        @id @default(uuid())
  techProfileId                     String
  customerId                        String
  techServiceId                     String
  requestKey                        String
  serviceNameSnapshot               String
  durationMinutesSnapshot           Int
  startingPriceCentsSnapshot        Int
  timeZoneSnapshot                  String
  cancellationCutoffMinutesSnapshot Int
  startAt                           DateTime
  endAt                             DateTime
  blockedUntilAt                    DateTime
  status                            BookingStatus @default(CONFIRMED)
  canceledAt                        DateTime?
  canceledByUserId                  String?
  createdAt                         DateTime      @default(now())
  updatedAt                         DateTime      @updatedAt
  techProfile                       TechProfile   @relation(fields: [techProfileId], references: [id], onDelete: Restrict)
  customer                          User          @relation("CustomerBookings", fields: [customerId], references: [id], onDelete: Restrict)
  techService                       TechService   @relation(fields: [techServiceId], references: [id], onDelete: Restrict)
  canceledBy                        User?         @relation("CanceledBookings", fields: [canceledByUserId], references: [id], onDelete: SetNull)
  notifications                     NotificationOutbox[]

  @@unique([customerId, requestKey])
  @@index([techProfileId, startAt])
  @@index([customerId, startAt])
  @@index([status, startAt])
}
```

- [ ] **Step 4: Add authoritative SQL checks and exclusion constraint**

Generate the normal Prisma SQL into `20260720_add_direct_booking/migration.sql`, then add `btree_gist`, range checks, weekday/minute checks, and:

```sql
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_valid_range"
  CHECK ("startAt" < "endAt" AND "endAt" <= "blockedUntilAt"),
  ADD CONSTRAINT "Booking_no_confirmed_overlap"
  EXCLUDE USING gist (
    "techProfileId" WITH =,
    tstzrange("startAt", "blockedUntilAt", '[)') WITH &&
  ) WHERE ("status" = 'CONFIRMED');
```

- [ ] **Step 5: Generate and validate Prisma**

Run: `npm run db:generate && node backend/scripts/with-env.mjs validate`

Expected: Prisma client generation and schema validation both succeed. Do not run `db:push` against the hosted database.

- [ ] **Step 6: Run the schema-contract test**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-schema.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the migration foundation**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260720_add_direct_booking/migration.sql backend/src/services/__tests__/booking-schema.test.ts
git commit -m "feat: add booking database contract"
```

---

### Task 2: Separate stable service CRUD from tech profile saves

**Files:**
- Create: `backend/src/validations/schedule.schema.ts`
- Create: `backend/src/services/tech-service.service.ts`
- Create: `backend/src/services/__tests__/tech-services.test.ts`
- Create: `backend/src/controllers/schedule.controller.ts`
- Create: `backend/src/routes/schedule.routes.ts`
- Modify: `backend/src/routes/api.routes.ts`
- Modify: `backend/src/services/tech-profile.service.ts`
- Modify: `backend/src/services/marketplace-shared.ts`
- Modify: `backend/src/validations/tech-profile.schema.ts`
- Test: `backend/src/validations/__tests__/tech-profile.schema.test.ts`

**Interfaces:**
- Produces: `listOwnServices(userId)`, `createOwnService(userId, input)`, `updateOwnService(userId, serviceId, input)` and `TechServiceDto`.
- Produces endpoints: `GET|POST /api/schedule/services`, `PATCH /api/schedule/services/:serviceId`.
- Guarantees: profile saves no longer call `techService.deleteMany`; public profile DTOs contain active services only and `bookingEnabled` defaults false until Task 3 supplies schedule state.

- [ ] **Step 1: Write failing service ownership/lifecycle tests**

Cover: tech profile required, list includes active and inactive own records, create requires name/duration/price, patch cannot touch another tech's service, deactivation retains the row, and profile save never deletes services. Assert DTO shape:

```ts
expect(result).toEqual({
  id: "service-1",
  name: "Gel-X Full Set",
  description: "Prep and shaping",
  durationMinutes: 90,
  startingPriceCents: 8500,
  isActive: true
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/tech-services.test.ts src/validations/__tests__/tech-profile.schema.test.ts`

Expected: FAIL because service CRUD is absent and profile validation still owns services.

- [ ] **Step 3: Define strict service inputs**

In `schedule.schema.ts`, export:

```ts
export const techServiceWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  durationMinutes: z.number().int().min(5).max(720),
  startingPriceCents: z.number().int().min(0).max(500000),
  isActive: z.boolean().default(true)
});
export const serviceIdParamSchema = z.string().uuid();
```

Remove `services` and `bookingUrl` from `techProfileInputSchema`. Zod's default object stripping keeps old clients from persisting those deprecated fields during the transition.

- [ ] **Step 4: Implement stable owned service CRUD**

Resolve `TechProfile.id` from the authenticated user, scope every update by `{ id, techProfileId }` using `updateMany`, throw `not_found` when count is zero, and reload the row for the DTO. Never hard-delete. Keep all Prisma calls in `tech-service.service.ts`.

- [ ] **Step 5: Mount service routes through the controller**

The controller must call `requireRole(cookie, ["TECH"])`, parse bodies/params, and return `{ data }`. Register static service routes now; later tasks extend the same router.

- [ ] **Step 6: Stop profile-owned service replacement and external booking URL writes**

Reduce `persistTechProfileDetails` to location upsert only. Remove `bookingUrl` from `profileData`. In `marketplace-shared.ts`, filter public services with `isActive`, include `isActive` in owner-facing service DTOs when needed, omit `bookingUrl` from public DTOs, and add `bookingEnabled: false` until schedule settings are included in Task 3.

- [ ] **Step 7: Run service/profile tests and the backend suite**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/tech-services.test.ts src/validations/__tests__/tech-profile.schema.test.ts && npm run test --workspace @find-my-tech/backend`

Expected: focused tests and full backend suite PASS.

- [ ] **Step 8: Commit stable service ownership**

```bash
git add backend/src/validations backend/src/services/tech-service.service.ts backend/src/services/__tests__/tech-services.test.ts backend/src/controllers/schedule.controller.ts backend/src/routes/schedule.routes.ts backend/src/routes/api.routes.ts backend/src/services/tech-profile.service.ts backend/src/services/marketplace-shared.ts
git commit -m "feat: add stable tech service management"
```

---

### Task 3: Add tech schedule settings, weekly hours, and date overrides

**Files:**
- Modify: `backend/src/validations/schedule.schema.ts`
- Create: `backend/src/services/schedule.service.ts`
- Create: `backend/src/services/__tests__/schedule.test.ts`
- Modify: `backend/src/controllers/schedule.controller.ts`
- Modify: `backend/src/routes/schedule.routes.ts`
- Modify: `backend/src/services/marketplace-shared.ts`

**Interfaces:**
- Produces: `getOwnSchedule`, `saveOwnScheduleSettings`, `replaceOwnWeeklyAvailability`, `upsertOwnOverride`, `deleteOwnOverride`.
- Produces: `ScheduleSettingsDto`, `AvailabilityWindowInput`, `AvailabilityOverrideDto`, and `ScheduleWarning`.
- Produces endpoints in the approved spec under `/api/schedule`.

- [ ] **Step 1: Write failing schedule tests**

Test IANA validation, suggested limits, minute bounds, overlapping-window rejection, transactionally replacing weekly windows, unavailable/custom overrides, ownership, and warnings that identify confirmed bookings outside the new schedule. Use a fixed `now` in service options rather than global fake time.

- [ ] **Step 2: Run the tests to verify the absent schedule module**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/schedule.test.ts`

Expected: FAIL because `schedule.service.ts` does not exist.

- [ ] **Step 3: Extend validation contracts**

Export exact schemas:

```ts
export const availabilityWindowSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440)
}).refine((value) => value.startMinute < value.endMinute, "End must be after start");

export const scheduleSettingsSchema = z.object({
  timeZone: z.string().trim().min(1).max(100),
  minimumNoticeMinutes: z.number().int().min(0).max(43200),
  maximumAdvanceDays: z.number().int().min(1).max(365),
  bufferMinutes: z.number().int().min(0).max(240),
  cancellationCutoffMinutes: z.number().int().min(0).max(43200)
});
```

Add weekday arrays and an override discriminated union. Validate IANA names in the service with `Intl.DateTimeFormat("en-US", { timeZone })` and reject overlapping sorted windows before opening a transaction.

- [ ] **Step 4: Implement schedule persistence and warnings**

Use one transaction for each replacement. Resolve the owning profile once, upsert settings, delete/create weekly windows or the single date override and its windows, then query affected `CONFIRMED` bookings. Return warnings shaped as:

```ts
type ScheduleWarning = {
  bookingId: string;
  startAt: string;
  message: "Existing booking falls outside the updated availability";
};
```

Warnings do not roll back the save.

- [ ] **Step 5: Expose schedule routes**

Implement `GET|PUT /settings`, `PUT /weekly-availability`, and `PUT|DELETE /overrides/:localDate`. Parse `YYYY-MM-DD` strictly and return 200 for upserts/replacements and deletions.

- [ ] **Step 6: Make public profile booking readiness honest**

Extend the public profile Prisma include/select so `bookingEnabled` is true only when schedule settings exist, at least one weekly window exists, and at least one active service has non-null duration and price. Do not require a currently open slot on the profile request.

- [ ] **Step 7: Run focused and regression tests**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/schedule.test.ts src/services/__tests__/profile-media.test.ts`

Expected: PASS with no public-profile mapping regressions.

- [ ] **Step 8: Commit schedule management**

```bash
git add backend/src/validations/schedule.schema.ts backend/src/services/schedule.service.ts backend/src/services/__tests__/schedule.test.ts backend/src/controllers/schedule.controller.ts backend/src/routes/schedule.routes.ts backend/src/services/marketplace-shared.ts
git commit -m "feat: add tech availability management"
```

---

### Task 4: Build timezone-safe slot generation and the public availability API

**Files:**
- Modify: `backend/package.json`, `package-lock.json`
- Create: `backend/src/services/scheduling/time-zone.ts`
- Create: `backend/src/services/scheduling/availability-engine.ts`
- Create: `backend/src/services/__tests__/availability-engine.test.ts`
- Create: `backend/src/validations/booking.schema.ts`
- Create: `backend/src/services/availability.service.ts`
- Create: `backend/src/services/__tests__/availability.test.ts`
- Modify: `backend/src/controllers/tech.controller.ts`
- Modify: `backend/src/routes/tech.routes.ts`

**Interfaces:**
- Produces: `strictLocalToUtc(localDate, minute, timeZone): Date | null`.
- Produces: `generateAvailableSlots(input: AvailabilityEngineInput): AvailableSlot[]`.
- Produces: `getPublicAvailability(techId, serviceId, month, now?)` and `GET /api/techs/:techId/availability`.

- [ ] **Step 1: Install the timezone dependency**

Run: `npm install luxon@3.7.2 --workspace @find-my-tech/backend && npm install -D @types/luxon --workspace @find-my-tech/backend`

Expected: backend manifest and root lockfile record Luxon and its declarations.

- [ ] **Step 2: Write failing pure-engine tests**

Cover multiple windows, `:00`/`:30` alignment, 45/60/90-minute services, buffer fit, existing blocked ranges, notice/horizon edges, override replacement, spring-forward nonexistent time, fall-back ambiguous time, and an invalid zone. Assert exact UTC results for `America/New_York`.

```ts
expect(generateAvailableSlots(input)).toEqual([
  { startAt: "2026-07-21T13:00:00.000Z", localDate: "2026-07-21", localTime: "9:00 AM", timeZone: "America/New_York" }
]);
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/availability-engine.test.ts`

Expected: FAIL because timezone and availability modules do not exist.

- [ ] **Step 4: Implement strict timezone conversion**

Build a Luxon `DateTime` from explicit local components. Return null when invalid, when normalized components differ from input (DST gap), or when `getPossibleOffsets().length !== 1` (DST ambiguity). Convert the single possible instant with `toUTC().toJSDate()`.

- [ ] **Step 5: Implement the pure engine**

Define explicit inputs rather than Prisma records:

```ts
export type AvailabilityEngineInput = {
  month: string;
  timeZone: string;
  durationMinutes: number;
  bufferMinutes: number;
  minimumStartAt: Date;
  maximumStartAt: Date;
  weekly: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  overrides: Array<{ localDate: string; unavailable: boolean; windows: Array<{ startMinute: number; endMinute: number }> }>;
  blocked: Array<{ startAt: Date; blockedUntilAt: Date }>;
};
```

Use half-open overlap: `candidateStart < existingBlockedUntil && candidateBlockedUntil > existingStart`.

- [ ] **Step 6: Write failing Prisma-backed availability tests**

Test unpublished tech, incomplete service, closed schedule, successful month query, range clipping, DTO privacy, and that `techId/availability` resolves before the generic `/:techId` route.

- [ ] **Step 7: Implement the availability service, validation, controller, and route**

Parse `serviceId` as UUID and `month` as strict `YYYY-MM`. Load only the requested tech/service/settings/month overrides and confirmed bookings intersecting the month plus maximum duration/buffer. Return:

```ts
type MonthAvailabilityDto = {
  month: string;
  timeZone: string;
  service: { id: string; name: string; durationMinutes: number; startingPriceCents: number };
  slots: AvailableSlot[];
};
```

Register `/:techId/availability` before `/:techId`.

- [ ] **Step 8: Run availability and route regression tests**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/availability-engine.test.ts src/services/__tests__/availability.test.ts src/__tests__/app.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit public availability**

```bash
git add backend/package.json package-lock.json backend/src/services/scheduling backend/src/services/availability.service.ts backend/src/services/__tests__/availability*.test.ts backend/src/validations/booking.schema.ts backend/src/controllers/tech.controller.ts backend/src/routes/tech.routes.ts
git commit -m "feat: generate timezone-safe availability"
```

---

### Task 5: Implement idempotent booking creation and database conflict handling

**Files:**
- Modify: `backend/src/validations/booking.schema.ts`
- Create: `backend/src/services/booking-dto.ts`
- Create: `backend/src/services/booking.service.ts`
- Create: `backend/src/services/__tests__/booking-create.test.ts`
- Create: `backend/src/controllers/booking.controller.ts`
- Create: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/routes/api.routes.ts`
- Modify: `backend/src/utils/api-response.ts`
- Create: `backend/src/__tests__/booking.api.test.ts`
- Create: `backend/src/__tests__/booking-concurrency.db.test.ts`

**Interfaces:**
- Produces: `createBooking(customerId, input, now?)`, `BookingDto`, `isBookingOverlapError(error)`.
- Produces: `POST /api/bookings` with idempotent 201/200 behavior and stable `booking_conflict` 409.
- Consumes: Task 4 strict slot validation helpers.

- [ ] **Step 1: Write failing create-service tests**

Cover role-independent domain inputs, exact request-key replay, server-owned snapshots, current schedule revalidation, two outbox rows, invalid/inactive service, self-booking rejection, and exclusion error mapping. Assert the client cannot supply duration/end/price/buffer.

- [ ] **Step 2: Write the failing API contract tests**

Assert unauthenticated 401, tech-role 403, validation 422, customer success 201, replay 200 with the same booking ID, and overlap 409:

```ts
expect(response.body).toEqual({
  error: { code: "booking_conflict", message: "That time is no longer available" }
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-create.test.ts src/__tests__/booking.api.test.ts`

Expected: FAIL because booking creation is not implemented.

- [ ] **Step 4: Add create validation and stable DTO mapping**

```ts
export const createBookingSchema = z.object({
  techProfileId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  requestKey: z.string().uuid()
}).strict();
```

`toBookingDto` must emit ISO strings, snapshot fields, status, tech/customer display data appropriate to the caller, and `canCancel` supplied by the service.

- [ ] **Step 5: Implement transactional idempotent creation**

Use `prisma.$transaction` at `Serializable`. First query `[customerId, requestKey]`; return it as replay if present. Load customer, published tech and user email, active complete service, settings, local schedule/override, and confirmed overlaps. Reuse the Task 4 engine/revalidation rules for exactly one requested start. Reject self-booking. Insert snapshot values plus customer/tech confirmation outbox rows in the same transaction.

- [ ] **Step 6: Map only the named exclusion constraint**

`isBookingOverlapError` must inspect Prisma `P2004`/database-error metadata and the constraint name `Booking_no_confirmed_overlap`; it must not convert unrelated constraint failures. Throw `new AppError("That time is no longer available", 409, "booking_conflict")`.

- [ ] **Step 7: Mount the booking route and API response**

Require `CUSTOMER`, parse the body, call `createBooking`, return 201 for a new result and 200 for `{ replayed: true }`, always under `{ data: { booking } }`.

- [ ] **Step 8: Add a real-PostgreSQL race test**

The database test uses `TEST_DATABASE_URL`, creates isolated user/profile/service/schedule fixtures, launches two `Promise.allSettled` booking writes with overlapping ranges, and asserts one `CONFIRMED` row plus one rejection. It also asserts adjacent half-open ranges both succeed. Skip with an explicit message unless `RUN_DB_TESTS=1`; never point it at the normal hosted `DATABASE_URL`.

- [ ] **Step 9: Run unit/API tests**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-create.test.ts src/__tests__/booking.api.test.ts`

Expected: PASS.

- [ ] **Step 10: Run the database race test against a dedicated test database**

Run migration first:

```bash
DATABASE_URL="$TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
RUN_DB_TESTS=1 npm run test --workspace @find-my-tech/backend -- src/__tests__/booking-concurrency.db.test.ts
```

Expected: PASS with exactly one winner for overlaps and two winners for adjacency.

- [ ] **Step 11: Commit booking creation**

```bash
git add backend/src/validations/booking.schema.ts backend/src/services/booking-dto.ts backend/src/services/booking.service.ts backend/src/services/__tests__/booking-create.test.ts backend/src/controllers/booking.controller.ts backend/src/routes/booking.routes.ts backend/src/routes/api.routes.ts backend/src/utils/api-response.ts backend/src/__tests__/booking.api.test.ts backend/src/__tests__/booking-concurrency.db.test.ts
git commit -m "feat: create bookings without overlap"
```

---

### Task 6: Add booking history, tech calendar reads, and cancellation

**Files:**
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/services/booking-dto.ts`
- Modify: `backend/src/services/schedule.service.ts`
- Create: `backend/src/services/__tests__/booking-lifecycle.test.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/controllers/schedule.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/routes/schedule.routes.ts`
- Modify: `backend/src/__tests__/booking.api.test.ts`

**Interfaces:**
- Produces: `listCustomerBookings(customerId, now?)`, `listOwnCalendarBookings(userId, range, now?)`, `cancelBooking(actor, bookingId, now?)`.
- Produces: `GET /api/bookings`, `GET /api/schedule/bookings`, `POST /api/bookings/:bookingId/cancel`.

- [ ] **Step 1: Write failing lifecycle tests**

Cover customer-only history, owner-only tech calendar range, customer cutoff strictly before the deadline, tech cancellation at any time before start, past-booking rejection, other-user rejection, repeated cancellation idempotency, two cancellation outbox rows, and released range behavior.

- [ ] **Step 2: Run tests and verify missing functions**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-lifecycle.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement ordered history and calendar reads**

Customer results order upcoming ascending then past descending and include canceled rows in their own group. Tech range validation allows at most 93 days and returns confirmed/canceled records with customer name/email, snapshots, and both timezone labels when `timeZoneSnapshot !== currentSchedule.timeZone`.

- [ ] **Step 4: Implement transactional cancellation**

Resolve the actor role/ownership, reload the booking, return the DTO without writes when already canceled, enforce customer cutoff from the snapshot, require future start, update only `status: CONFIRMED`, and create uniquely keyed customer/tech cancellation outbox rows in the same transaction.

- [ ] **Step 5: Expose lifecycle endpoints**

Use the same cancellation endpoint for the owning customer or owning tech. Return stable `cancellation_cutoff_passed` 409 and `forbidden` 403 errors. Parse schedule `from`/`to` as offset-aware ISO datetimes.

- [ ] **Step 6: Run lifecycle/API tests**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-lifecycle.test.ts src/__tests__/booking.api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the booking lifecycle**

```bash
git add backend/src/services/booking.service.ts backend/src/services/booking-dto.ts backend/src/services/schedule.service.ts backend/src/services/__tests__/booking-lifecycle.test.ts backend/src/controllers/booking.controller.ts backend/src/controllers/schedule.controller.ts backend/src/routes/booking.routes.ts backend/src/routes/schedule.routes.ts backend/src/__tests__/booking.api.test.ts
git commit -m "feat: add booking history and cancellation"
```

---

### Task 7: Deliver durable Brevo booking emails

**Files:**
- Create: `backend/src/services/email/booking-email.ts`
- Create: `backend/src/services/email/brevo.client.ts`
- Create: `backend/src/services/email/outbox-dispatcher.ts`
- Create: `backend/src/services/__tests__/booking-email.test.ts`
- Create: `backend/src/services/__tests__/outbox-dispatcher.test.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Produces: `renderBookingEmail(kind, payload): { subject; htmlContent; textContent }`.
- Produces: `BrevoEmailClient.send(message): Promise<{ messageId: string }>`.
- Produces: `dispatchOutboxBatch(options)` and `startOutboxDispatcher(options): () => void`.

- [ ] **Step 1: Write failing deterministic template tests**

Assert confirmation and cancellation subjects/bodies for customer and tech. Assert escaped names/content, local date/time plus timezone, price/duration/cutoff, booking ID, and role-appropriate account URL. Assert no private address.

- [ ] **Step 2: Write failing dispatcher tests**

Cover `SKIP LOCKED` claiming, 60-second lease, success message ID, 408/429/network/5xx retry, other 4xx terminal failure, exponential retry, eight-attempt cap, missing configuration, sanitized errors, and stop function clearing the poll timer.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-email.test.ts src/services/__tests__/outbox-dispatcher.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement templates and Brevo adapter**

Send `POST https://api.brevo.com/v3/smtp/email` with headers `api-key`, `accept: application/json`, and `content-type: application/json`. Body fields are `sender`, `to`, `subject`, `htmlContent`, and `textContent`. Parse the returned `messageId`. Never include the key or full response body in thrown/logged errors.

- [ ] **Step 5: Implement safe outbox claiming and retry**

Claim up to 20 due rows in a short transaction with `FOR UPDATE SKIP LOCKED`, set a lease timestamp, commit, send outside the transaction, then mark sent or schedule `min(2 ** attempts, 60)` minutes later. Reclaim leases older than 60 seconds. After eight failures, set terminal failure state without another due time.

- [ ] **Step 6: Add environment parsing and server lifecycle**

Extend `env` with optional `BREVO_API_KEY`, `BOOKING_EMAIL_FROM`, `BOOKING_EMAIL_FROM_NAME`, and `APP_PUBLIC_URL`. Start the poller only when all four exist; otherwise log one configuration warning. Keep the HTTP server available. On `SIGTERM`/`SIGINT`, stop polling, close the HTTP server, and disconnect Prisma.

- [ ] **Step 7: Run email and backend tests**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/booking-email.test.ts src/services/__tests__/outbox-dispatcher.test.ts && npm run typecheck --workspace @find-my-tech/backend`

Expected: PASS.

- [ ] **Step 8: Commit email delivery**

```bash
git add backend/src/services/email backend/src/services/__tests__/booking-email.test.ts backend/src/services/__tests__/outbox-dispatcher.test.ts backend/src/config/env.ts backend/src/server.ts
git commit -m "feat: deliver booking emails through Brevo"
```

---

### Task 8: Add typed frontend booking/schedule APIs and shared auth state

**Files:**
- Create: `frontend/src/services/api/booking-types.ts`
- Create: `frontend/src/services/api/bookings.ts`
- Create: `frontend/src/services/api/schedule.ts`
- Create: `frontend/src/services/__tests__/bookings.test.ts`
- Create: `frontend/src/services/__tests__/schedule.test.ts`
- Modify: `frontend/src/services/api/client.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/api/types.ts`
- Modify: `frontend/src/services/api/profiles.ts`
- Modify: `frontend/src/services/__tests__/profiles.test.ts`
- Modify: `frontend/src/components/layout/account-auth-context.tsx`
- Modify: `frontend/src/components/layout/site-header.tsx`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Produces: `ApiClientError { status; code; message; issues? }`.
- Produces typed functions `getMonthAvailability`, `createBooking`, `getCustomerBookings`, `cancelBooking`, and every `/api/schedule` operation.
- Produces auth context `{ authUser, isAuthLoading, openAccountAuth, closeAccountAuth, completeAuthentication, signOut }`.

- [ ] **Step 1: Write failing structured-error tests**

Assert `readApiResponse` throws an `ApiClientError` retaining `status: 409` and `code: "booking_conflict"`, while existing callers still receive the same human-readable `.message`.

- [ ] **Step 2: Write failing transport tests**

Mock `fetch` and assert every path, method, credentials mode, encoded parameter, body, and response shape for bookings and schedule. Include cancellation and month query.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm run test --workspace @find-my-tech/frontend -- src/services/__tests__/bookings.test.ts src/services/__tests__/schedule.test.ts src/services/__tests__/profiles.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement API contracts and structured errors**

Define `ApiClientError` in `client.ts`; construct it from `response.status` and `payload.error.code`. Put all booking/schedule DTOs in `booking-types.ts` and export modules through `api.ts`.

- [ ] **Step 5: Remove service and booking URL ownership from profile forms**

Delete `bookingUrl`, `serviceName`, `serviceDescription`, and `startingPrice` from `TechOnboardingForm`, initial state, payload construction, and owner mapping. Add `isActive` and `bookingEnabled` to profile types. Profile payloads no longer send `services` or `bookingUrl`.

- [ ] **Step 6: Centralize header authentication state**

Move the initial session load and current user into `AccountAuthProvider`. `completeAuthentication(user)` closes the modal and updates context, allowing a booking page to resume confirmation immediately. `SiteHeader` consumes the context instead of loading a second copy, while preserving current menus and modal behavior.

- [ ] **Step 7: Run API/auth/profile regression tests**

Run: `npm run test --workspace @find-my-tech/frontend -- src/services/__tests__ src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit frontend foundations**

```bash
git add frontend/src/services frontend/src/components/layout/account-auth-context.tsx frontend/src/components/layout/site-header.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: add typed booking client foundations"
```

---

### Task 9: Build the customer month booking flow

**Files:**
- Create: `frontend/src/facades/booking.facade.ts`
- Create: `frontend/src/facades/__tests__/booking.facade.test.ts`
- Create: `frontend/src/pages/booking-page.tsx`
- Create: `frontend/src/pages/booking/service-picker.tsx`
- Create: `frontend/src/pages/booking/month-calendar.tsx`
- Create: `frontend/src/pages/booking/day-slots.tsx`
- Create: `frontend/src/pages/booking/booking-summary.tsx`
- Create: `frontend/src/pages/booking/__tests__/month-calendar.test.tsx`
- Create: `frontend/src/pages/__tests__/booking-page.test.tsx`
- Modify: `frontend/src/pages/artist-profile-page.tsx`
- Modify: `frontend/src/pages/artist-profile/profile-overview.tsx`
- Modify: `frontend/src/pages/__tests__/artist-profile-page.test.ts`
- Modify: `frontend/src/routes/app-routes.tsx`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Consumes: Task 8 APIs/auth context and `PublicTechProfile.bookingEnabled`.
- Produces: `/artists/:id/book` and internal profile booking behavior.
- Produces: facade `loadBookingPage(techId)`, `loadMonth(techId, serviceId, month)`, `confirmBooking(input)`.

- [ ] **Step 1: Write failing facade tests**

Assert profile load, month load, one generated request UUID retained across retry, successful confirmation, and that `ApiClientError.code === "booking_conflict"` triggers a selected-day refresh result rather than a generic failure.

- [ ] **Step 2: Write failing calendar/page tests**

Cover full-month grid, month navigation, enabled-day semantics, exact selected-day times, keyboard activation, `aria-selected`, mobile DOM order, service reset clearing stale slots, auth modal resume, tech-account rejection, double-submit disabled state, summary content, and 409 focus/refresh behavior.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test --workspace @find-my-tech/frontend -- src/facades/__tests__/booking.facade.test.ts src/pages/booking/__tests__/month-calendar.test.tsx src/pages/__tests__/booking-page.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement the booking facade and focused components**

Keep transport out of components. The month component receives `{ month, availableDates, selectedDate, onSelectDate, onPreviousMonth, onNextMonth }`. The slots component receives already formatted API labels and UTC values. The summary displays snapshot inputs and generates/reuses one UUID with `crypto.randomUUID()`.

- [ ] **Step 5: Compose the booking page and auth resume**

Load the profile, render active complete services, request one month at a time, preserve service/date/time while opening login, observe `authUser`, require `CUSTOMER`, and confirm. On `booking_conflict`, focus `role="alert"`, clear only the time, and reload the selected month.

- [ ] **Step 6: Replace the external profile action**

When `bookingEnabled`, both profile buttons route to `/artists/${id}/book`. Otherwise render disabled `Booking unavailable` copy and keep existing contact methods. Remove all `window.open(bookingUrl)` behavior.

- [ ] **Step 7: Add responsive and accessible styling**

Use the approved full month + selected-day panel. Stack times below the month under the existing mobile breakpoint. Preserve unrelated edits in `globals.css` by appending a named booking section and reviewing the combined diff.

- [ ] **Step 8: Run customer booking tests and frontend typecheck**

Run: `npm run test --workspace @find-my-tech/frontend -- src/facades/__tests__/booking.facade.test.ts src/pages/booking src/pages/__tests__/booking-page.test.tsx src/pages/__tests__/artist-profile-page.test.ts && npm run typecheck --workspace @find-my-tech/frontend`

Expected: PASS.

- [ ] **Step 9: Commit the customer booking flow**

```bash
git add frontend/src/facades/booking.facade.ts frontend/src/facades/__tests__/booking.facade.test.ts frontend/src/pages/booking-page.tsx frontend/src/pages/booking frontend/src/pages/__tests__/booking-page.test.tsx frontend/src/pages/artist-profile-page.tsx frontend/src/pages/artist-profile/profile-overview.tsx frontend/src/pages/__tests__/artist-profile-page.test.ts frontend/src/routes/app-routes.tsx frontend/src/assets/globals.css
git commit -m "feat: add customer month booking flow"
```

---

### Task 10: Add customer booking history and cancellation

**Files:**
- Create: `frontend/src/facades/customer-bookings.facade.ts`
- Create: `frontend/src/facades/__tests__/customer-bookings.facade.test.ts`
- Create: `frontend/src/pages/customer-bookings-page.tsx`
- Create: `frontend/src/pages/customer-bookings/booking-list.tsx`
- Create: `frontend/src/pages/customer-bookings/booking-detail.tsx`
- Create: `frontend/src/pages/__tests__/customer-bookings-page.test.tsx`
- Modify: `frontend/src/routes/app-routes.tsx`
- Modify: `frontend/src/components/layout/site-header.tsx`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Produces: `/bookings`, `loadCustomerBookings()`, `cancelCustomerBooking(id)`.
- Consumes: Task 8 booking DTO/API and shared auth context.

- [ ] **Step 1: Write failing facade/page tests**

Cover authenticated customer guard, upcoming ascending/past descending/canceled sections, empty states, snapshot details, cutoff-disabled action, confirmation dialog, successful cancellation moving sections, repeated cancellation, and stable cutoff error.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test --workspace @find-my-tech/frontend -- src/facades/__tests__/customer-bookings.facade.test.ts src/pages/__tests__/customer-bookings-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement facade and page components**

Keep grouping from the API response rather than recomputing status from browser timezone. Cancellation reloads history after success and retains the selected booking on failure. The confirmation copy says rescheduling requires canceling and then choosing a new available time.

- [ ] **Step 4: Add customer navigation**

Add `My bookings` to the authenticated customer desktop account menu and mobile account section. Keep Saved techs and Account settings intact. Route changes still close menus.

- [ ] **Step 5: Run booking-history/header tests**

Run: `npm run test --workspace @find-my-tech/frontend -- src/facades/__tests__/customer-bookings.facade.test.ts src/pages/__tests__/customer-bookings-page.test.tsx src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit customer booking management**

```bash
git add frontend/src/facades/customer-bookings.facade.ts frontend/src/facades/__tests__/customer-bookings.facade.test.ts frontend/src/pages/customer-bookings-page.tsx frontend/src/pages/customer-bookings frontend/src/pages/__tests__/customer-bookings-page.test.tsx frontend/src/routes/app-routes.tsx frontend/src/components/layout/site-header.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts frontend/src/assets/globals.css
git commit -m "feat: add customer booking history"
```

---

### Task 11: Build tech services and availability management

**Files:**
- Create: `frontend/src/facades/schedule.facade.ts`
- Create: `frontend/src/facades/__tests__/schedule.facade.test.ts`
- Create: `frontend/src/pages/schedule-page.tsx`
- Create: `frontend/src/pages/schedule/schedule-tabs.tsx`
- Create: `frontend/src/pages/schedule/availability-editor.tsx`
- Create: `frontend/src/pages/schedule/override-editor.tsx`
- Create: `frontend/src/pages/schedule/services-editor.tsx`
- Create: `frontend/src/pages/schedule/__tests__/availability-editor.test.tsx`
- Create: `frontend/src/pages/schedule/__tests__/services-editor.test.tsx`
- Create: `frontend/src/pages/__tests__/schedule-page.test.tsx`
- Modify: `frontend/src/components/layout/tech-profile-details-modal.tsx`
- Modify: `frontend/src/components/layout/__tests__/tech-profile-details-modal.test.tsx`
- Modify: `frontend/src/pages/tech-profile/editor-state.ts`
- Modify: `frontend/src/pages/__tests__/tech-profile-page.test.ts`
- Modify: `frontend/src/pages/for-techs-page.tsx`
- Modify: `frontend/src/pages/__tests__/for-techs-page.test.ts`
- Modify: `frontend/src/components/layout/site-header.tsx`
- Modify: `frontend/src/routes/app-routes.tsx`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Produces: tech-only `/schedule` shell with Availability and Services tabs.
- Produces facade functions that preserve backend warnings verbatim.

- [ ] **Step 1: Write failing facade/editor tests**

Cover default form suggestions, timezone selection, notice/horizon/buffer/cutoff units, multiple periods per weekday, overlap validation, full-day/custom override, service add/edit/deactivate/reactivate, required duration/price, save warnings, and keyboard/error behavior.

- [ ] **Step 2: Write failing profile/onboarding regression tests**

Assert booking URL and featured-service fields are absent from profile details and tech onboarding; profile save payload contains neither. Assert the post-profile CTA links to `/schedule` to finish bookable setup.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm run test --workspace @find-my-tech/frontend -- src/facades/__tests__/schedule.facade.test.ts src/pages/schedule/__tests__ src/components/layout/__tests__/tech-profile-details-modal.test.tsx src/pages/__tests__/tech-profile-page.test.ts src/pages/__tests__/for-techs-page.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement schedule facade and tab shell**

Load settings, weekly hours, overrides, services, and the initial calendar range through focused API calls. Keep dirty state per tab so a failed save retains inputs. Default to Bookings after Task 12 adds it; while implementing this task, the route can default to Availability only in the test harness, not shipped code.

- [ ] **Step 5: Implement availability and override editors**

Represent UI times as minute integers at the component boundary. Sort periods before save, reject overlaps client-side, display timezone/policy help, and surface backend booking warnings after a successful save without reverting it.

- [ ] **Step 6: Implement stable services editor**

Use modal or inline forms with explicit name, description, minutes, price dollars converted exactly to cents, and active state. Deactivate rather than delete. Mark incomplete legacy records and require completion before activation.

- [ ] **Step 7: Remove legacy profile/onboarding fields**

Remove booking URL and service controls from `TechProfileDetailsModal` and `ForTechsPage`; update dirty-state helpers and tests. After profile creation, show `Set up services and availability` linking to `/schedule`.

- [ ] **Step 8: Add tech navigation and route**

Keep `My Profile` as the primary tech navigation. Add `Schedule` to tech account menus on desktop/mobile and register `/schedule`.

- [ ] **Step 9: Run schedule editor and profile regression tests**

Run: `npm run test --workspace @find-my-tech/frontend -- src/facades/__tests__/schedule.facade.test.ts src/pages/schedule src/pages/__tests__/schedule-page.test.tsx src/components/layout/__tests__/tech-profile-details-modal.test.tsx src/pages/__tests__/tech-profile-page.test.ts src/pages/__tests__/for-techs-page.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit tech configuration UI**

```bash
git add frontend/src/facades/schedule.facade.ts frontend/src/facades/__tests__/schedule.facade.test.ts frontend/src/pages/schedule-page.tsx frontend/src/pages/schedule frontend/src/pages/__tests__/schedule-page.test.tsx frontend/src/components/layout/tech-profile-details-modal.tsx frontend/src/components/layout/__tests__/tech-profile-details-modal.test.tsx frontend/src/pages/tech-profile/editor-state.ts frontend/src/pages/__tests__/tech-profile-page.test.ts frontend/src/pages/for-techs-page.tsx frontend/src/pages/__tests__/for-techs-page.test.ts frontend/src/components/layout/site-header.tsx frontend/src/routes/app-routes.tsx frontend/src/assets/globals.css
git commit -m "feat: add tech schedule configuration"
```

---

### Task 12: Add the tech booking calendar and cancellation detail panel

**Files:**
- Create: `frontend/src/pages/schedule/bookings-calendar.tsx`
- Create: `frontend/src/pages/schedule/bookings-list.tsx`
- Create: `frontend/src/pages/schedule/booking-detail.tsx`
- Create: `frontend/src/pages/schedule/__tests__/bookings-calendar.test.tsx`
- Modify: `frontend/src/pages/schedule-page.tsx`
- Modify: `frontend/src/facades/schedule.facade.ts`
- Modify: `frontend/src/facades/__tests__/schedule.facade.test.ts`
- Modify: `frontend/src/pages/__tests__/schedule-page.test.tsx`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Produces: Bookings tab with week default, month overview, narrow-screen list fallback, detail view, and tech cancellation.
- Consumes: `getScheduleBookings(from, to)` and shared `cancelBooking(id)`.

- [ ] **Step 1: Write failing calendar/detail tests**

Cover week default, previous/next/today, month toggle, booking placement by server-provided schedule-zone labels, overlapping visual lanes, canceled styling, list fallback content, accessible selection, snapshot/current timezone dual labels, detail fields, tech cancellation confirmation, and refresh after cancel.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/schedule/__tests__/bookings-calendar.test.tsx src/pages/__tests__/schedule-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement week/month calendar components**

Use click selection only; do not add drag/drop. Render the same booking collection into a time-grid week view and summary month view. Provide a semantic list with date headings at narrow widths and as a keyboard-readable fallback.

- [ ] **Step 4: Implement detail and tech cancellation**

Show customer name/email, service/price/duration snapshots, booking ID, local time, status, and differing timezone labels. Tech cancellation calls the shared endpoint, retains detail on error, and reloads the visible range on success.

- [ ] **Step 5: Make Bookings the shipped default tab**

Update `SchedulePage` so the approved tab order is Bookings, Availability, Services and Bookings is selected on initial load.

- [ ] **Step 6: Run tech calendar tests and typecheck**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/schedule src/pages/__tests__/schedule-page.test.tsx src/facades/__tests__/schedule.facade.test.ts && npm run typecheck --workspace @find-my-tech/frontend`

Expected: PASS.

- [ ] **Step 7: Commit the tech calendar**

```bash
git add frontend/src/pages/schedule frontend/src/pages/schedule-page.tsx frontend/src/facades/schedule.facade.ts frontend/src/facades/__tests__/schedule.facade.test.ts frontend/src/pages/__tests__/schedule-page.test.tsx frontend/src/assets/globals.css
git commit -m "feat: add tech booking calendar"
```

---

### Task 13: Verify migration, full flows, configuration, and documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: backend/frontend tests only if verification exposes a genuine missing assertion or bug

**Interfaces:**
- Consumes: all prior tasks.
- Produces: documented setup and evidence that the complete feature works without weakening unrelated behavior.

- [ ] **Step 1: Update environment documentation**

Replace the unused Resend example with:

```dotenv
BREVO_API_KEY=xkeysib_booking_email_key
BOOKING_EMAIL_FROM=bookings@example.com
BOOKING_EMAIL_FROM_NAME=avoro Bookings
APP_PUBLIC_URL=http://localhost:3000
```

Document that the sender must be verified in Brevo, secrets belong in `.env.local`/deployment settings, and tests use fake transport.

- [ ] **Step 2: Update migration and workflow documentation**

In `README.md`, replace booking-related `db:push` guidance with `migrate deploy` for production and list schedule setup order: profile → service → timezone/policies → weekly hours. Document customer/tech routes and the dedicated `TEST_DATABASE_URL` concurrency check.

- [ ] **Step 3: Run formatting/diff safety checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; the three pre-existing frontend modifications remain recognizable and are not accidentally dropped.

- [ ] **Step 4: Run all automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run db:generate
node backend/scripts/with-env.mjs validate
```

Expected: every command exits 0.

- [ ] **Step 5: Re-run the database concurrency gate**

Run against the dedicated migrated test database:

```bash
RUN_DB_TESTS=1 npm run test --workspace @find-my-tech/backend -- src/__tests__/booking-concurrency.db.test.ts
```

Expected: exactly one confirmed overlap winner, adjacent bookings accepted, and canceled-range reuse obeys current schedule rules.

- [ ] **Step 6: Verify complete browser workflows**

Start the app, then exercise in a real browser:

1. Tech creates two services, timezone/policies, weekly hours, and a closed-day override.
2. Customer sees the full month, selects a service/day/time, signs in, confirms, and sees `/bookings`.
3. A second customer attempting the same time receives conflict recovery and refreshed times.
4. Tech sees the appointment in week and month views and its detail panel.
5. Customer cutoff behavior and both customer/tech cancellation paths match the API.
6. Existing bookings remain visible after service deactivation and schedule/timezone edits.
7. Keyboard navigation, focus alerts, mobile month stacking, and narrow calendar list work.

Expected: all actions and network responses match the approved specification.

- [ ] **Step 7: Verify Brevo delivery when credentials are available**

Create and cancel one test booking with a verified sender. Confirm customer and tech each receive the correct messages, and verify outbox rows store Brevo message IDs. If credentials are unavailable, verify rows remain pending and report this external verification gap explicitly; do not claim live delivery.

- [ ] **Step 8: Review the final diff for scope and secrets**

Run: `git diff --stat origin/main...HEAD && git diff origin/main...HEAD -- . ':!package-lock.json'`

Expected: only booking/scheduling, required profile/auth integration, documentation, and intentional pre-existing user edits are present; no credentials or private appointment data are committed/logged.

- [ ] **Step 9: Commit documentation/verification fixes**

```bash
git add .env.example README.md
git commit -m "docs: document booking setup and verification"
```

If verification required code fixes, stage those exact files with their focused regression tests and use a separate `fix:` commit before the documentation commit.
