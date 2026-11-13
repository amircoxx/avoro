# Messaging release verification — September 9, 2026

Messaging passed the isolated PostgreSQL gate and the browser workflows below after five focused fixes. This is local verification, not approval to enable production messaging.

## Fixes

1. Cast `pg_notify`'s `void` result to text so Prisma can deserialize it without rolling back notification publication and delivery completion.
2. Normalize raw timestamp parameters to UTC when claiming delivery work. Prisma's timestamp-without-time-zone columns otherwise compare and store timestamptz parameters using the database session timezone, delaying work and corrupting lease times on non-UTC databases.
3. Proxy `/socket.io` and WebSocket upgrades through Vite alongside `/api`.
4. Connect the browser directly over WebSocket. Same-origin polling GET requests omit the Origin header required by the gateway; WebSocket handshakes include it. The server's strict origin check is preserved.
5. Explicitly reconnect after `io server disconnect`, which occurs during graceful backend shutdown. Logout and invalid-session disconnects remain terminal.

Regression tests cover non-UTC lease timing, transactional notification commit/rollback, transport options, and graceful disconnect versus logout/session invalidation. The database suite first reproduced 3 failures out of 13; the added client regressions also failed before their fixes.

## Test environment

- Temporary PostgreSQL 18 instance on loopback port 55439, using a newly created database, `fmt_messaging_release`.
- All six checked-in migrations applied successfully to that empty database.
- Database default timezone: America/New_York. The lease regression also explicitly selects that timezone within its transaction, independently of the database default.
- Separate backend and frontend processes on ports 3101 and 3100; normal development servers were preserved.
- Disposable customer/tech accounts and a published tech profile; no normal or production database was used.
- Messaging enabled only in the temporary backend process. Brevo credentials and sender configuration explicitly blanked for that process; no external emails sent.

## Final automated results

| Check | Result |
| --- | --- |
| Real PostgreSQL messaging concurrency suite | 13 passed |
| Focused frontend messaging suites | 72 passed across 7 files |
| Full backend suite | 348 passed, 18 database-gated tests skipped |
| Full frontend suite | 350 passed, 2 failures in unchanged booking-calendar tests |
| Workspace typechecks | Passed |
| Workspace builds | Passed; existing frontend bundle-size advisory |
| Whitespace/diff check | Passed |

The 13 messaging database tests were run separately with `RUN_DB_TESTS=1`; their skipped status in the ordinary full suite does not replace that successful database run. The five booking database tests were not run as part of this messaging work.

The two full-suite failures are in `frontend/src/pages/schedule/__tests__/bookings-calendar.test.tsx`, at the cancellation interactions around lines 221 and 273: `Button Cancel appointment was not rendered`. Neither the calendar implementation nor its tests was changed in this task.

## Browser evidence

Verified with separate authenticated browser sessions against the actual local API, database, and WebSocket server:

- Guest introduction draft survives login and can then be submitted.
- Request reaches the tech inbox and updates its pending badge without a reload.
- Tech acceptance updates the customer's composer without a reload.
- Messages deliver in both directions and appear in both conversation histories.
- Both browsers reconnect after a controlled graceful backend restart without page reloads.
- A message sent while the customer has left the app appears once in the message history on return.
- Archive and restore work in the mobile workspace.
- Blocking disables the other participant's composer; unblocking restores it.
- Restriction-dialog completion returns focus to its initiating control.
- Mobile inbox/conversation navigation and a 390 × 844 viewport were inspected.
- Tech decline succeeds; an immediate customer retry is rejected with the October 9, 2026 retry date, 30 days after the September 9 decline.
- Fresh normal-operation browser sessions reported no console errors. Earlier forced network outages produced expected network errors; the cooldown rejection produces an expected HTTP error alongside its user-facing alert.
- Eight email jobs remained pending with email sending disabled. Stored outbox payloads contained no tested message bodies; runtime logs contained no tested message bodies or fixture recipient addresses.

## Remaining release work

- Verify the actual deployment supports persistent Node processes, WebSocket upgrades, background polling, and PostgreSQL LISTEN/NOTIFY with an extra listener connection per backend instance.
- Confirm production migrations and the exact frontend/API origin configuration before enabling `MESSAGING_ENABLED` there.
- Verify Brevo sender configuration and actual delivery to an explicitly approved test recipient. Local verification covered queued email work and automated rendering/dispatcher tests, not delivery by the provider.
- A forced browser disconnect precisely between server commit and send acknowledgment, and a multi-device unread-count stress walkthrough, were not performed. Database retry/idempotency tests and automated client/context coverage passed; these do not constitute browser evidence for those exact scenarios.
- Mobile conversation deep links initially show the inbox; selecting the conversation opens the mobile detail pane. Automatic detail opening from a mobile deep link was not verified as a release requirement.
- Resolve or separately track the two booking-calendar test failures before claiming the entire repository suite is green.

No commit, push, deployment, production flag change, or environment-file modification was performed. Unrelated working-tree edits were preserved. Temporary browser evidence and command logs are retained under `/private/tmp/fmt-messaging-release`; this directory is local and may be removed by operating-system cleanup.
