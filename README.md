# Find My Tech

Find My Tech is a beauty-tech marketplace for lash and nail artists, organized as a literal frontend and backend project.

```text
frontend/  React, Vite, React Router, reusable UI, pages, state, and API client
backend/   Express, controllers, services, models, Prisma, validation, and middleware
```

## Local development

Install dependencies, then start both applications:

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and proxies `/api` requests to the backend on `http://localhost:3001`. To run either application independently, use `npm run dev:frontend` or `npm run dev:backend`.

## Docker development

Docker Compose runs the frontend and backend as separate development containers. Postgres remains external, so provide a reachable database URL when starting the stack:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE' docker compose up --build
```

Open `http://localhost:3000` for the frontend. The API is available at `http://localhost:3001`; frontend `/api` requests are proxied to the backend service automatically. If Postgres runs on your Mac, use `host.docker.internal` instead of `localhost` in the database URL.

Use `docker compose down` to stop the containers. Run `docker compose down -v` only when you also want to discard the containers' cached `node_modules` volumes.

## Environment

Keep local variables in the root `.env.local` file:

The backend, Prisma CLI, and `db:*` scripts use `.env.local` only as local
defaults. Explicitly supplied environment variables always win, including empty
values; `.env` is not loaded automatically. With `NODE_ENV=production`, no local
environment file is loaded, so inject the configuration through the deployment
environment. Database commands can run without `.env.local` when their required
variables are already supplied.

- `DATABASE_URL` — Postgres connection string.
- `GEOAPIFY_API_KEY` — city-autocomplete and reverse-geocoding provider key. Discover's “Use my location” control requests browser location permission, resolves coordinates through `GET /api/locations/coords?lat=...&lng=...`, then searches by city/state/country (not distance). Invalid coordinates return `422`; empty or unusable city results return `{ data: null }`; provider failures return `502`. Reverse-geocoding requests time out after 10 seconds. Automated location tests mock the provider and never call Geoapify.
- `FRONTEND_ORIGIN` — deployed frontend origin for credentialed CORS; defaults to local Vite.
- `PORT` — backend port; defaults to `3001`.
- `VITE_API_ORIGIN` — deployed Express API origin; leave unset locally to use the Vite proxy.
- `BREVO_API_KEY` — Brevo transactional-email API key.
- `BOOKING_EMAIL_FROM` — sender address verified in Brevo.
- `BOOKING_EMAIL_FROM_NAME` — display name used for booking email.
- `APP_PUBLIC_URL` — public frontend origin used in booking email links.
- `MESSAGING_ENABLED` — `true` enables operational messaging REST routes, Socket.IO, delivery processing, and frontend entry points. `GET /api/messaging/status` remains available when the flag is unset or `false` and reports `{ enabled: false }`; all other messaging surfaces stay disabled.

Copy placeholders from `.env.example`, but keep real secrets in `.env.local` or the deployment platform's secret settings. Verify `BOOKING_EMAIL_FROM` in Brevo before enabling the deployment dispatcher. The poller starts only when all four email variables are configured; if any are missing, it does not start and outbox rows remain pending. A fully configured but unverified sender can instead receive a terminal, non-retryable Brevo `4xx` response, so those rows are not promised a later retry. Automated tests use a fake transport and never call Brevo.

## Customer and tech messaging

Messaging is an opt-in rollout. Apply the checked-in migrations, provide `DATABASE_URL`, and set `MESSAGING_ENABLED=true` locally or in the deployment environment before starting the normal app commands. Leave the flag unset or `false` to keep operational messaging routes, the socket connection, delivery dispatcher, navigation badge, profile request control, and messages workspace unavailable. The body-free capability endpoint `GET /api/messaging/status` intentionally remains available and returns `{ enabled: false }` so the frontend can hide those entry points safely.

The backend must run as a persistent Node HTTP process that supports long-lived WebSocket connections and background delivery polling; a request-only or scale-to-zero function is not sufficient. Each enabled backend instance uses `DATABASE_URL` for Prisma and opens an additional dedicated PostgreSQL connection that remains subscribed to the `messaging_events` channel. The database therefore must permit persistent connections, `LISTEN`/`NOTIFY`, and enough connection capacity for both the Prisma workload and one listener per backend instance.

Messaging reuses the configured Brevo sender and public app URL. Request, decision, and unread-message alerts are privacy-safe: email templates do not include the message body, durable outbox payloads contain identifiers and state metadata only, and PostgreSQL notifications and operational logs must remain body-free. If Brevo configuration is incomplete, realtime delivery can continue while email rows remain pending for a later configured worker.

On every socket reconnect the client treats realtime events as hints, reloads the inbox and unread summary through REST, then performs user-wide message catch-up from its last REST-confirmed global sequence. Message IDs and sequences deduplicate overlapping snapshot, catch-up, and socket delivery.

## Direct booking workflow

Techs make a profile bookable from the authenticated `/schedule` workspace in this order:

1. Create and publish the tech profile.
2. Add at least one active service with a duration and starting price.
3. Save the IANA timezone and booking policies.
4. Save weekly working hours, then add date-specific overrides when needed.

Customers open `/artists/:id/book` to choose an active service, date, and time. A customer account is required to confirm; completed and canceled appointments appear at `/bookings`. Tech accounts use `/schedule` for the week/month booking calendar, cancellation details, availability, overrides, policies, and services. Existing confirmed bookings keep their service, price, timezone, and cancellation-policy snapshots when a tech changes current setup.

## Where to make changes

| Need | Start here |
| --- | --- |
| Add or change a screen | `frontend/src/pages`, then its feature components |
| Change shared header or footer | `frontend/src/components/layout` |
| Change shared account dialogs | `frontend/src/components/layout/account` |
| Change app-wide account or messaging state | `frontend/src/context` |
| Change profile editor UI or media drafts | `frontend/src/pages/tech-profile` |
| Change a page-level workflow | `frontend/src/facades` |
| Add browser API behavior | `frontend/src/services/api` |
| Add an endpoint | backend route, controller, service, validation, then model/Prisma as needed |
| Change database data access | `backend/src/models` and `backend/prisma/schema.prisma` |

## Five-minute code tour

Read these files in order before changing a feature:

1. `frontend/src/routes/app-routes.tsx` to find the URL and route-level page.
2. The matching file in `frontend/src/pages`, plus its feature folder when one exists (for example, `pages/discover/`).
3. The page's facade in `frontend/src/facades` when the interaction combines API calls.
4. `frontend/src/services/api.ts`, then the owning module in `frontend/src/services/api/`, to see the browser request and types.
5. The matching backend route, controller, stable `*.service.ts` entry point, and model/Prisma code.

Two useful traces are:

- Discover search: `frontend/src/pages/discover-page.tsx` -> `frontend/src/facades/discover.facade.ts` -> `frontend/src/services/api/techs.ts` -> `GET /api/techs/search?...` -> `backend/src/routes/tech.routes.ts` -> `backend/src/controllers/tech.controller.ts` -> `backend/src/services/tech-search.service.ts`.
- Owner profile save: `frontend/src/pages/tech-profile-page.tsx` -> `frontend/src/services/api/profiles.ts` -> `POST /api/techs` -> `backend/src/routes/tech.routes.ts` -> `backend/src/controllers/tech.controller.ts` -> `backend/src/services/tech-profile.service.ts`.

Place reusable navigation, dialogs, and shell behavior in `frontend/src/components/layout`; reusable product controls in `frontend/src/components/common`; and sections only one page composes inside that page's feature folder. Do not move a page-local section into shared UI just because it is visually substantial.

## Database and verification

From the project root, use `npm run db:status` to inspect pending migrations and
`npm run db:deploy` to apply all pending checked-in migrations. Run
`npm run db:generate` after schema changes (stop the backend first if Windows has
locked the Prisma engine). These commands use the installed Prisma CLI through
Node and work in PowerShell as well as Unix shells.

```bash
./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma
./node_modules/.bin/prisma validate --schema backend/prisma/schema.prisma
./node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma
npm test
npm run typecheck
npm run build
```

The validation and migration commands use the environment precedence described above: an injected `DATABASE_URL` takes priority over local defaults. Production and shared databases must apply the checked-in migration history; the booking overlap constraint is authoritative SQL and must not be replaced with `db push`. The `npm run db:generate` and `backend/scripts/with-env.mjs` commands use the same precedence and do not require `.env.local` when variables are supplied externally. `npm run db:push` remains available only for isolated local schema prototyping that does not stand in for applying booking migrations.

The real PostgreSQL concurrency gates require a dedicated, migrated test database. Never point them at the normal or production `DATABASE_URL`, and do not run them when the isolated URL is absent or cannot be verified:

```bash
DATABASE_URL="$TEST_DATABASE_URL" ./node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma
RUN_DB_TESTS=1 npm run test --workspace @find-my-tech/backend -- src/__tests__/booking-concurrency.db.test.ts
RUN_DB_TESTS=1 npm run test --workspace @find-my-tech/backend -- src/__tests__/messaging-concurrency.db.test.ts
```

Set `TEST_DATABASE_URL` in your shell or test environment before running those commands. The booking gate verifies idempotent concurrent retries, exactly one winner for overlapping requests, accepted adjacent ranges, whole weekly replacements from an empty schedule, concurrent cancellation without duplicate notifications, and reuse of a canceled range when current schedule rules still allow it. The messaging gate verifies idempotent request and accepted-message retries, one conversation per customer/tech pair, single-winner decisions, block/send serialization, increasing sequence pagination, monotonic read cursors, multi-dispatcher `SKIP LOCKED` claims, and expired-lease recovery.

The backend keeps the established `/api` contract, HTTP-only session cookies, and Prisma schema. Browser code is isolated to `frontend/src`; database access is isolated to `backend/src/models` and backend configuration. Controllers must not import a service domain's private files. They use public service entry points for domain behavior and may import allowed models, configuration, and utilities as needed. See [the architecture guide](docs/architecture.md) for ownership boundaries and request flow.

### Stripe subscription creation webhook

Before deploying the `customer.subscription.created` handler, apply the checked-in
`20261102213000_add_subscription_stripe_status` migration to the intended database
using the existing migration deployment workflow, and regenerate the Prisma client
from `backend/prisma/schema.prisma`.

The handler uses `subscriptionId` from Stripe subscription metadata (set by checkout)
and validates the saved customer and subscription association. It initializes
`stripeSubscriptionId` and the nullable `stripeStatus` atomically. `stripeStatus`
stores Stripe's exact billing status independently of the application's `status`;
subscription creation does not grant paid access or change credits.

Duplicate or late creation events cannot overwrite an initialized Stripe status.
The lifecycle handlers below synchronize subsequent billing changes. Missing metadata, unknown local records,
conflicting associations, and database errors are not acknowledged as successful.
This handler does not replace a different existing Stripe subscription association.

### Stripe billing lifecycle

Before running the updated backend, apply
`20261102223000_add_subscription_billing_lifecycle` with `npm run db:deploy`,
then run `npm run db:generate`. The migration adds plan, interval, Stripe price,
scheduled-cancellation fields, and a version counter. It does not backfill billing
state for existing subscriptions; their next supported webhook reconciles it.

Enable `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and
`customer.subscription.deleted` on the existing `/api/purchases/webhook` endpoint.
Invoice parsing uses the installed Stripe SDK's `parent.subscription_details`
shape, and subscription periods come from subscription items; configure the
webhook API version accordingly. Stripe lookups need the configured secret key.

Updates and paid invoices retrieve current Stripe subscription state, validate the
local subscription/customer association, and synchronize `stripeStatus`, `plan`,
`interval`, `stripePriceId`, `currentPeriodEnd`, `cancelAtPeriodEnd`, and `cancelAt`.
The application status follows this policy:

- `ACTIVE`: Stripe is active, its latest invoice is paid, and the single item has
  quantity one, a configured price, and an unexpired current billing period.
- `TRIALING`: Stripe is trialing with a supported item and unexpired period.
- `PAST_DUE`: Stripe reports overdue payment; no ACTIVE grace period is granted.
- `CANCELED`: Stripe reports canceled or incomplete-expired, or a deletion arrives.
- `FREE`: other states, unsupported items, or active subscriptions without a paid
  latest invoice. Unsupported prices never grant active/trial status.

Paying an older invoice cannot grant access when the latest invoice remains unpaid.
Paid zero-value invoices are valid, including discounts and credits. One-off paid
invoices are acknowledged without updating a subscription. Scheduled cancellation
alone does not revoke an otherwise eligible active/trial status.

Conditional writes increment `billingVersion`; a conflict reloads the record and
refetches Stripe state, up to three attempts. Terminal subscriptions cannot be
reactivated by a late webhook. A deletion revokes status without a Stripe lookup.
Matching duplicate deliveries are safe; credits are never incremented by these
handlers. Provider/database failures propagate for Stripe retry.

`invoice.payment_failed` verifies the invoice's customer and subscription, then
reconciles current Stripe state using the same version-protected update. An overdue
subscription becomes `PAST_DUE` without an ACTIVE grace period; an incomplete first
payment remains `FREE`. A delayed failure cannot override a subsequently recovered
subscription with a paid latest invoice. One-off invoice failures are acknowledged
without subscription processing, and errors propagate for retry.

These handlers persist billing/access status; they do not add new UI entitlement
checks. Failure notification emails, invoice-level failure history, automated
periodic reconciliation, and replacing an existing Stripe subscription with a new
ID remain outside this flow.

### Customer management portal

The pricing page's **Manage subscription** button opens Stripe's hosted Customer
Portal. `POST /api/purchases/portal` requires a signed-in TECH account and resolves
the Stripe customer from that account's saved subscription. It accepts no client
customer ID or return URL, creates a fresh short-lived session, and returns a
non-cacheable `{ data: { url } }` response. Customers can access billing even when
their local status is FREE, PAST_DUE, or CANCELED. Accounts without a Stripe
customer receive `409 missing_billing_account` and should choose a plan first.

Before using it, save a Customer Portal configuration in the matching Stripe
sandbox or live account. Enable the desired invoice history, payment-method,
cancellation, and subscription-update features. Set the optional backend
`STRIPE_PORTAL_CONFIGURATION_ID=bpc_...` to select a specific saved configuration;
otherwise Stripe uses its default. Restart the backend after environment changes.
The return URL is `/pricing` under `APP_PUBLIC_URL`, falling back to
`FRONTEND_ORIGIN`. Portal URLs are restricted to HTTPS `billing.stripe.com` in the
browser API; custom portal domains require an explicit allowlist change.

For plan switching, allow only the six recurring prices in
`backend/src/config/stripe-prices.ts`, with quantity fixed at one. Configure
proration and effective-date rules in Stripe; the application does not select
these rules on the customer's behalf. Stripe's end-of-period downgrade feature
requires prices under the same product, so check the catalog before enabling it.
Do not enable pause flows or unsupported prices without corresponding entitlement
policy changes. Sandbox and live portal configurations must be set up separately.

Existing signed `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, and `invoice.payment_failed` handlers synchronize effective billing
state. Returning from the portal does not prove payment or a plan change. Future
scheduled changes are shown in Stripe; the local `plan` remains the effective
plan until the schedule takes effect. Billing-address edits in Stripe do not edit
the user's avoro profile. No database migration is required for portal access.

For local testing, keep the listener running (quote the event list in PowerShell):

```powershell
stripe listen --events "checkout.session.completed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed" --forward-to http://localhost:3001/api/purchases/webhook
```

Use that listener's signing secret as `STRIPE_WEBHOOK_SECRET`. With a sandbox tech
account that has completed checkout, open **Manage subscription**, check the
available plans and invoices, and test a plan change and return navigation. Verify
successful webhook responses and the effective plan/status in `Subscription`.
Also test declined/authentication-required upgrade payments before enabling plan
changes: the existing entitlement policy requires a paid latest invoice for ACTIVE
and does not implement a separate grace-period policy for a failed upgrade.

References: [portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal)
and [portal configuration](https://docs.stripe.com/customer-management/configure-portal).

### Password reset request limits

`POST /api/auth/forgot-password` permits five valid requests per client IP in a
15-minute fixed window, in addition to the 60-second per-email cooldown. The IP
budget is consumed even when an email is already cooling down or has no account.
An exhausted IP receives HTTP 429 (`rate_limited`) and a `Retry-After` header in
seconds. Successful responses retain the same account-neutral message.

Apply the checked-in `20260921223000_add_password_reset_ip_limit` migration before
starting the updated backend (`prisma migrate deploy` with the intended database
configuration). PostgreSQL stores the counters and enforces the limit atomically
across backend instances. No application restart resets the budget. Expired rows
are reused when that IP next requests a reset; operators can periodically delete
rows whose `windowStartedAt` is more than 15 minutes old to bound IP retention.

The limiter uses Express `request.ip`. Express currently trusts only the direct
connection, so arbitrary `X-Forwarded-For` headers cannot bypass the limit. Behind
Vite's development proxy, requests share the proxy's IP. Before a production
reverse-proxy deployment, configure Express `trust proxy` for the actual trusted
proxy addresses/subnets and ensure the proxy overwrites forwarding headers;
otherwise users share the proxy's budget. Do not enable blanket `trust proxy: true`
or trust client-supplied forwarding headers. IPv4-mapped IPv6 peers are normalized
to IPv4, and PostgreSQL's `inet` type canonicalizes other IP representations.
The limit is per address, not an IPv6 subnet, and is not a complete defense against
distributed abuse.


### Password recovery verification and operation

The forgot-password and reset-password screens now call the backend endpoints.
Configure `BREVO_API_KEY`, `BOOKING_EMAIL_FROM`, and `APP_PUBLIC_URL` (the frontend
origin) for delivery. The server runs without these values, but the reset email
worker stays disabled and queued requests remain pending until configuration is
provided and the server restarts. Other API and messaging functions can still run.
Apply checked-in migrations before starting the backend, using
`node backend/scripts/with-env.mjs migrate deploy` from the project root with the
intended `.env.local` database configuration.

The isolated `password-reset-flow.db.test.ts` suite exercises real HTTP routes,
PostgreSQL, token creation, worker processing, old/new password login, session
revocation, expiry, reuse, and simultaneous token redemption. Only external email
delivery is replaced with a test double. Run it with `RUN_DB_TESTS=1` and a dedicated
`TEST_DATABASE_URL` whose database name contains a `test` marker; never point it at
a normal development or production database. For final provider verification, use
a controlled account to request a reset email and follow the actual delivered link.
Email verification screens remain a separate, unconnected feature.

### Appointment rescheduling API

Owners can load `GET /api/bookings/:bookingId/reschedule-availability?month=YYYY-MM`
using their authenticated session. This returns saved service details, the current
booking `version`, and slots calculated using current schedule rules while excluding
that booking from conflicts. Use this endpoint for moves rather than the public
new-booking availability endpoint.

`POST /api/bookings/:bookingId/reschedule` accepts `startAt`, `version`, a fresh UUID
`requestKey`, and optional `reason`. Reuse the request key only when retrying the
same move. Success and a replay return `{ data: { booking } }` with HTTP 200.
Stale versions and unavailable times return HTTP 409. The move, history and both
email outbox rows commit together. The UI must refresh after success or a conflict.

The browser helpers are `getRescheduleAvailability` and `rescheduleBooking` in
`frontend/src/services/api/bookings.ts`. Customers can choose **Reschedule appointment** in My bookings; techs can select an
appointment in Schedule and use the same action. The shared dialog shows available
dates and times, accepts an optional reason, and refreshes the register after saving.
See `docs/plans/rescheduling-completion.md` for the flow and UI responsibilities.
Run `src/__tests__/rescheduling.db.test.ts` with `RUN_DB_TESTS=1` and an isolated
`TEST_DATABASE_URL` to verify the real HTTP, concurrency and rollback behavior.
