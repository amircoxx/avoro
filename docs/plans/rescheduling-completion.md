# Rescheduling completion

Scope: finish the booking-specific availability/read path, safe writes, notifications,
browser API helpers, and the customer/tech rescheduling dialog.

- GET /api/bookings/:bookingId/reschedule-availability?month=YYYY-MM requires
  the owning customer or tech. Return the current version with saved service data
  and slots using current schedule policies. Exclude the existing booking.
- POST reschedule rechecks rules and slots inside a serializable transaction;
  retry serialization/duplicate-key races up to three attempts, and return stable
  409 errors when another write wins. Replay checks precede stale-version checks.
- Save the move, version, history and both outbox rows atomically.
- Cancellation checks the version it read before updating, avoiding stale payloads
  or cancellation based on a superseded start time.
- Verify route/validation/client contracts and real PostgreSQL concurrency and
  rollback using an isolated temporary database, never the user's normal database.
- Explain the flow and remaining UI responsibilities after verification.

## Implemented flow for review

1. `getRescheduleAvailability(bookingId, month)` in the browser API makes an
   authenticated GET request. The controller validates the booking ID and month.
2. The availability service checks ownership, status and cutoff, then reads a
   consistent snapshot of the booking and schedule. It returns the booking version,
   saved service details and selectable slots. The existing booking is excluded
   from conflicts; other bookings and their buffers still block slots.
3. `rescheduleBooking(bookingId, input)` sends the selected UTC start, the version
   returned above, a request key and an optional reason. The server checks replay
   history first, then rechecks the booking and current availability.
4. One serializable transaction changes the booking, increments its version,
   records old/new times, and queues one email for each participant. A failure
   rolls back all those writes. Serialization races retry up to three attempts
   with a short backoff. Known overlap errors become `booking_conflict` (409).
5. Cancellation also guards its update with the version it read and increments
   the version, so it cannot cancel using a superseded start time or queue stale
   appointment details after a concurrent move.

## Implemented UI

- Use the booking-specific availability helper, not public new-booking availability.
- Display the returned timezone and saved service details. Keep the version tied
  to the loaded availability rather than silently replacing it before submitting.
- Generate one fresh `crypto.randomUUID()` for an intended move. Reuse it for a
  network retry of that exact move; generate a new key when the chosen time or
  reason changes. Do not reuse the booking's original creation request key.
- On success, refresh the appointment list/calendar and close the picker.
- On `booking_conflict` or `booking_version_conflict`, refresh availability and
  ask the user to review their choice. Never automatically overwrite a newer move.
- Both My bookings and the tech Schedule register open the shared
  `frontend/src/pages/booking/reschedule-dialog.tsx`. The owning tech uses the same
  endpoints; its cutoff differs from the customer's.
- The dialog traps keyboard focus, supports Escape, disables controls during saves,
  and ignores responses after unmount or after navigating to a different month.

## Verification

- Repository tests: 375 frontend and 456 backend tests passed; optional DB suites
  are excluded from that default run.
- Isolated PostgreSQL: 8 rescheduling tests and 5 existing booking concurrency
  tests passed, including real session/HTTP routing, duplicate requests, stale
  versions, overlapping moves, cancellation races and notification-failure rollback.
- Repository typecheck/build, Prisma validation and whitespace checks passed.
- The production frontend build reports the existing large-bundle warning.
- Customer and tech browser flows verified on an isolated database, including
  optional reason, calendar refresh, responsive layout, Escape and focus restoration.
  Two moves produced version 2, two history records and four notification rows.
  Actual email provider delivery remains unverified; local email workers were disabled.
