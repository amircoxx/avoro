# Direct booking and tech scheduling

## Goal

Let customers book an available service directly on avoro and let techs manage services, working hours, exceptions, and bookings from a calendar. Booking correctness takes priority over returning a slot or accepting a request: the database must reject overlapping confirmed appointments even when concurrent customers act on stale availability.

## Scope

This design covers the existing Vite/React frontend, Express API, Prisma data layer, and PostgreSQL database. It adds authenticated customer booking, customer booking history and cancellation, a tech schedule workspace, multi-service management, recurring availability with date-specific overrides, and Brevo confirmation/cancellation emails.

The first release does not include payments, guest booking, approval-based requests, atomic rescheduling, external calendar synchronization, SMS, waitlists, recurring appointments, staff/resource scheduling, or admin booking management. Rescheduling is cancel-then-book. Bookings are confirmed immediately when the database accepts them.

## Product decisions

- Customers select an active service; its duration determines appointment length.
- Customers must use a `CUSTOMER` account to confirm or cancel a booking. Anyone may inspect public availability, but authentication is required at confirmation and the current selection is preserved through sign-in.
- Starts occur every 30 minutes within a valid availability window. Service duration blocks the appointment exactly, followed by the tech's configured buffer.
- Each tech owns an IANA business timezone. Availability is configured and displayed in that timezone; persisted appointment timestamps are UTC.
- Techs configure recurring weekly hours, date-specific unavailable/custom-hour overrides, minimum notice, maximum advance window, one post-appointment buffer, and a customer cancellation cutoff.
- Both customer and tech receive confirmation and cancellation emails through Brevo.
- Existing confirmed bookings survive later service, availability, timezone, buffer, or policy edits.
- No schedule is implicitly open. A tech must explicitly save a timezone, at least one active bookable service, and weekly availability before the public API returns slots.

## User surfaces

### Customer booking page

The public profile's `Book now` action routes to `/artists/:id/book` rather than opening `bookingUrl`.

The page follows this sequence:

1. Select an active bookable service.
2. Browse a full-month calendar. Dates with at least one valid opening are visibly enabled.
3. Select a date. Exact times appear beside the month on desktop and below it on mobile.
4. Sign in as a customer if necessary without losing the selection.
5. Review the tech, service, starting price, duration, selected local date/time, timezone, buffer-neutral appointment end, and cancellation cutoff.
6. Confirm once using a client-generated idempotency key.
7. Show an in-app confirmation and link to `/bookings`.

The legacy `TechProfile.bookingUrl` column remains during this release to avoid a destructive migration, but profile editing stops exposing it and public booking actions stop using it.

If the tech has no active bookable service or configured availability, the profile labels the action `Booking unavailable` and directs the customer to the tech's existing public contact methods. It never falls back to the legacy external URL.

### Customer bookings

`/bookings` is customer-only and groups the customer's appointments into upcoming, past, and canceled lists. A booking detail view shows the tech, service snapshot, price snapshot, local appointment time and timezone, booking status, and cancellation policy.

Customers may cancel a confirmed future booking only before the tech's snapshotted cancellation deadline. Rescheduling guidance explicitly tells the customer to cancel and choose a new time. The system does not promise that a replacement time will remain available.

### Tech schedule workspace

`/schedule` is tech-only and contains three tabs:

- **Bookings:** a detailed week calendar by default, an optional month overview, and a booking detail panel. Techs may cancel but not move or mutate a confirmed booking.
- **Availability:** recurring weekly periods, date overrides, timezone, minimum notice, maximum booking horizon, buffer, and cancellation cutoff.
- **Services:** stable service records with name, description, duration, starting price, and active/inactive state.

Schedule edits that would place a confirmed booking outside the new hours return warnings and remain saveable. They never cancel or alter that booking. The UI presents the affected appointments so the tech can contact customers or cancel deliberately.

Changing the business timezone does not reinterpret existing bookings. Customer history keeps using each booking's timezone snapshot. If an upcoming booking's snapshot differs from the tech's current timezone, the tech calendar displays both labeled times in its detail panel.

## Data model

### Schedule settings and availability

Add a one-to-one `TechScheduleSettings` record for each configured tech profile:

- `techProfileId` unique foreign key
- `timeZone` IANA identifier
- `minimumNoticeMinutes`, suggested as 120 during setup
- `maximumAdvanceDays`, suggested as 60 during setup
- `bufferMinutes`, suggested as 15 during setup
- `cancellationCutoffMinutes`, suggested as 1440 during setup
- timestamps

Suggested values are form defaults only; they do not publish availability before the tech saves the complete schedule.

`WeeklyAvailabilityWindow` stores `techProfileId`, weekday `0..6`, `startMinute`, and `endMinute`. Multiple non-overlapping windows per weekday are allowed. Database checks require valid minute ranges and the service transaction rejects overlapping windows.

`AvailabilityOverride` is unique by tech and local calendar date and has kind `UNAVAILABLE` or `CUSTOM_HOURS`. An unavailable override has no windows. A custom-hours override owns one or more `AvailabilityOverrideWindow` rows with valid, non-overlapping minute ranges. An override replaces, rather than augments, the recurring hours for that date.

### Services

Extend `TechService` with `isActive` and `updatedAt`. Service records receive dedicated CRUD operations and stable IDs. Deactivation replaces destructive removal once a service has been used.

A publicly bookable service must be active and have a valid `durationMinutes` and `startingPriceCents`. Existing services are backfilled active, but a legacy service missing duration or price returns as not bookable until the tech completes it.

Tech profile updates stop deleting and recreating `TechService` rows. Featured-service fields move out of the profile details modal and tech onboarding editor into the Schedule > Services surface. Public profiles continue rendering active services from the shared profile response.

### Bookings

Add `BookingStatus` with `CONFIRMED` and `CANCELED`, and a `Booking` model containing:

- `techProfileId`, `customerId`, and `techServiceId`
- `requestKey`, unique per customer for idempotent retries
- `serviceNameSnapshot`, `durationMinutesSnapshot`, and `startingPriceCentsSnapshot`
- `startAt`, `endAt`, and `blockedUntilAt` as UTC timestamps
- `timeZoneSnapshot` and `cancellationCutoffMinutesSnapshot`
- `status`, `canceledAt`, and `canceledByUserId`
- timestamps

`endAt` is the customer-visible appointment end. `blockedUntilAt` is `endAt + buffer` and is used only for scheduling conflicts. The database checks `startAt < endAt <= blockedUntilAt`.

The booking keeps service, timezone, price, duration, and cancellation-policy snapshots so later tech edits cannot rewrite appointment history. A deactivated service remains related to its historical bookings.

### Database non-overlap guarantee

The migration enables `btree_gist` and adds a partial PostgreSQL exclusion constraint equivalent to:

```sql
EXCLUDE USING gist (
  "techProfileId" WITH =,
  tstzrange("startAt", "blockedUntilAt", '[)') WITH &&
)
WHERE ("status" = 'CONFIRMED')
```

Half-open ranges allow an appointment to begin exactly when the prior blocked range ends. Any overlap for the same tech is rejected at the database boundary. Canceled rows do not participate and therefore release their time.

Prisma cannot be the sole expression of this invariant; the checked-in SQL migration is authoritative. Production schema changes use migration history rather than `db push`.

### Notification outbox

`NotificationOutbox` stores one recipient-specific message per booking event with a unique event key, booking reference, message kind, recipient fields, JSON payload, attempt count, next-attempt time, lease timestamp, sent timestamp, Brevo message ID, and last sanitized error.

Creating or canceling a booking inserts the customer and tech email rows inside the same database transaction as the booking change. A dispatcher claims rows with a database lease, sends them, and retries transient failures with bounded exponential backoff. Email delivery is at least once; it does not control booking commit success.

The dispatcher runs as a polling loop in the persistent Express backend process. Claiming uses row locks with `SKIP LOCKED`, so multiple backend instances do not intentionally process the same row concurrently. A row receives at most eight attempts. HTTP 408, 429, network failures, and 5xx responses retry; other 4xx responses become terminal failures with sanitized diagnostics. A lease timeout makes work claimable again after a crashed process.

## Availability calculation

The public availability endpoint accepts a tech, service, and requested month. The service performs these steps server-side:

1. Require a published tech, configured schedule, active bookable service, valid timezone, and a month intersecting the notice/horizon window.
2. Resolve each local date from its override or recurring weekday windows.
3. Generate local starts on the hour or half hour for which the entire appointment plus buffer fits inside a window.
4. Convert local boundaries to UTC. Omit nonexistent or ambiguous daylight-saving times rather than guessing.
5. Remove starts before minimum notice, beyond maximum advance, or overlapping a confirmed booking's blocked range.
6. Return local date/time labels, timezone, and opaque UTC start values needed for confirmation.

The response contains availability only, never customer identity or booking details. Empty, invalid, or uncertain schedules fail closed with no slots.

## Transactional booking flow

`POST /api/bookings` requires a customer session and accepts the tech profile ID, service ID, selected UTC start, and request key.

Inside one transaction, the service:

1. Returns the existing booking when the same customer/request key already succeeded.
2. Reloads the tech, service, settings, relevant local-day hours/override, and current policy.
3. Recomputes the selected start's validity; client-supplied duration, price, end, and buffer values are ignored.
4. Inserts the confirmed booking with snapshots and two outbox rows.
5. Commits only if the database exclusion constraint accepts the blocked range.

An exclusion violation maps to `409 Conflict` with a stable `booking_conflict` code. The frontend announces that the time was just taken, clears the selected time, and refreshes the selected date. Retrying an already-successful request key returns the original booking and does not create new outbox rows.

Availability reads may become stale between display and confirmation. That is acceptable; accepting an overlap is not.

## Cancellation flow

`POST /api/bookings/:bookingId/cancel` supports the owning customer or owning tech.

- A customer cancellation requires a confirmed future booking and `now < startAt - cancellationCutoffSnapshot`.
- The owning tech may cancel a confirmed future booking at any time.
- Repeated cancellation returns the already-canceled representation without duplicate email events.
- The status update and two cancellation outbox rows commit together.
- A canceled range becomes available only when the current service, schedule, override, notice, horizon, and buffer rules still permit it.

## API boundaries

Add focused routers mounted from `backend/src/routes/api.routes.ts`:

- `GET /api/techs/:techId/availability?serviceId=...&month=YYYY-MM`
- `POST /api/bookings`
- `GET /api/bookings` for the current customer's history
- `POST /api/bookings/:bookingId/cancel`
- `GET /api/schedule/bookings?from=...&to=...`
- `GET` and `PUT /api/schedule/settings`
- `PUT /api/schedule/weekly-availability`
- `PUT` and `DELETE /api/schedule/overrides/:localDate`
- `GET` and `POST /api/schedule/services`
- `PATCH /api/schedule/services/:serviceId`

Controllers validate requests and delegate. Focused services own authorization, availability calculation, transactions, Prisma access, and DTO mapping. No repository or mapper layer is added.

Stable errors include `unauthorized` (401), `forbidden` (403), `not_found` (404), `booking_conflict` (409), `cancellation_cutoff_passed` (409), and validation errors (400). Unexpected database, timezone, or provider details are logged server-side without secrets and are not exposed to clients.

## Brevo delivery

The dispatcher uses Brevo's current transactional email endpoint, `POST https://api.brevo.com/v3/smtp/email`, with `api-key`, JSON content type, sender, recipient, subject, HTML content, and text content. The returned `messageId` is persisted on the outbox row. The API key is never returned or logged. Reference: [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email).

Required production configuration:

- `BREVO_API_KEY`
- `BOOKING_EMAIL_FROM`
- `BOOKING_EMAIL_FROM_NAME`
- `APP_PUBLIC_URL` for booking/profile links

Local and automated tests use a fake transport. If production email configuration is missing, the dispatcher leaves messages pending and reports an operational error; it never rolls back or fabricates a booking failure.

Confirmation and cancellation templates include the booking ID, tech/customer display names, service snapshot, local date/time with timezone, appointment duration, price snapshot, cancellation policy, and the appropriate account link. Email content does not expose private tech addresses or unnecessary customer data.

## Frontend component boundaries

- A booking-page facade loads the public profile, services, and month availability and performs the confirm workflow.
- Focused customer components own service selection, month navigation, selected-day slots, confirmation summary, and conflict recovery.
- A customer-bookings facade owns history loading and cancellation.
- A schedule facade owns tech settings, windows, overrides, services, and calendar bookings.
- Calendar/date utilities are shared and timezone-explicit; components do not construct API timestamps ad hoc.
- Existing auth context handles sign-in and resumes the pending booking selection.

The current profile editor no longer writes services as part of profile save. The public profile and owner preview continue consuming services through existing profile DTOs, now filtered to active records where appropriate.

## Accessibility and responsive behavior

- Calendar days and time choices are real keyboard-operable controls with selected, unavailable, current-date, and focus states that do not rely on color alone.
- Month navigation announces the displayed month; availability refreshes use an appropriate live region.
- Conflict and cancellation errors move focus to a concise alert and retain the selected service/date where safe.
- The customer month and selected-day times render side by side on wide screens and stack on mobile.
- The tech week calendar provides a list fallback on narrow screens and does not require drag-and-drop.
- Forms use explicit labels and describe timezone and policy units.

## Migration and compatibility

- Add the new scheduling, booking, and outbox tables plus `TechService` lifecycle fields through a checked-in Prisma migration with the raw SQL checks and exclusion constraint.
- Backfill existing services as active. Legacy services without duration or price remain visible but not bookable until completed.
- Retain `bookingUrl` data for compatibility, remove it from editable/public booking behavior, and defer column deletion to a later cleanup migration.
- Existing profiles receive no schedule rows and therefore expose no accidental availability.
- Deploy the database migration before enabling the frontend booking routes.

## Verification

### Unit tests

- Weekly hours, multiple daily windows, full-day and custom-hour overrides
- 30-minute starts with variable service durations and buffers
- Minimum notice, maximum advance, cancellation cutoff, and current-time boundaries
- UTC/local conversions across normal dates and daylight-saving gaps/ambiguities
- Snapshot and DTO mapping, idempotency decisions, and stable error mapping

### Database and API integration tests

- Run against real PostgreSQL with the checked-in migration.
- Race two concurrent identical and partially overlapping requests; exactly one conflicting booking may become confirmed.
- Accept adjacent ranges and reuse a canceled range when current schedule rules permit it.
- Verify idempotent retry returns the original booking without duplicate outbox rows.
- Cover customer/tech role and ownership rules, unpublished techs, inactive/incomplete services, invalid months, schedule warnings, and cancellation cutoffs.
- Verify schedule/service transactions do not delete or rewrite existing booking history.

### Email tests

- Assert confirmation/cancellation payloads for both recipients with a fake Brevo transport.
- Verify claiming, leasing, retry scheduling, sent state, sanitized failures, and no duplicate outbox creation.
- Exercise Brevo success, retryable response, permanent response, and missing-configuration behavior without exposing the API key.

### Frontend and browser tests

- Test service selection, month navigation, day/time selection, auth resume, one-shot confirmation, `409` recovery, history grouping, and cutoff-aware cancellation.
- Test tech week/month views, settings validation, multiple windows, overrides, services, warnings, and cancellation.
- Run frontend/backend tests, typechecks, and production builds.
- In a real browser, complete one customer booking, confirm both account views, cancel from each allowed role, verify the slot rules after cancellation, and verify actual Brevo delivery when credentials and a verified sender are available.

## Success criteria

- No two confirmed bookings for one tech have overlapping blocked ranges, including under concurrent requests.
- Customers can book only server-generated valid times for active services and receive immediate, understandable conflict recovery.
- Techs can manage services and availability and see their bookings without silently mutating existing appointments.
- Customers can view and cancel their own bookings within the snapshotted policy.
- Confirmation and cancellation emails are durably queued with the booking change and delivered through Brevo with retry behavior.
- All new behavior is role-protected, timezone-explicit, accessible, responsive, migration-backed, and verified at unit, API, database-concurrency, frontend, and browser levels.
