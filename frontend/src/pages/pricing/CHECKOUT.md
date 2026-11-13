# Stripe Checkout backend handoff

The pricing page calls its own `selectPlan` handler, which calls
`createCheckoutSession` in `frontend/src/services/api/purchases.ts` and redirects
the browser to the returned Stripe-hosted URL. No Stripe SDK or secret is needed
in the frontend.

## Expected API contract

`POST /api/purchases/checkout` with the existing HTTP-only session cookie:

```json
{ "planId": "studio", "interval": "yearly" }
```

Return a successful JSON response:

```json
{ "data": { "url": "https://checkout.stripe.com/c/pay/SESSION" } }
```

Use the project's normal `{ "error": { "code": "...", "message": "..." } }`
format for failures. HTTP 401 prompts the user to sign in; HTTP 403 with code
`forbidden` explains that subscribing requires a tech account. Other failures show a
retry message. The frontend only accepts HTTPS URLs on `checkout.stripe.com`.
Custom Stripe checkout domains require updating that explicit allowlist.

## Backend responsibilities

- Authenticate the account and authorize it to subscribe; resolve its tech profile
  using the session, not client-supplied identity.
- Validate `planId` and `interval`. Current sample IDs are `starter`, `studio`, and
  `signature`; intervals are `monthly` and `yearly`.
- Map these values to your server-owned recurring Stripe Price IDs. Never use the
  displayed sample amounts as trusted billing input.
- Create a Stripe Checkout Session in subscription mode and return its `url`.
- Choose trusted success/cancel return URLs. There are no checkout result routes
  in this frontend change; `/pricing` can be a return destination but will not
  claim payment success.
- Handle duplicate requests/existing subscriptions and verify Stripe webhook
  events before granting or updating subscription access. A browser redirect
  does not prove payment.

The sample prices/benefits and preview notice remain in `pricing-data.ts` for
review. Replace them with your real catalog before launch. The original frontend handoff did not modify backend or Stripe resources.
Checkout creation and retry handling have since been implemented as described below;
webhook fulfillment and the customer management portal are documented in the root README.

## Retry persistence (2026-10-23)

Apply `20261023150000_persist_checkout_retry_parameters` before running the updated backend. It adds one `StripeCustomerCreation` request per local subscription and immutable customer/user/return-URL snapshots to checkout attempts. The earlier applied checkout migration is unchanged.

The purchasing model reloads the winning active attempt after a relevant unique conflict, and saves a customer association only when the stored ID is null. The service reuses the operation's original parameters and idempotency key. Automatic creation retries stop after 23 hours, before Stripe may discard a 24-hour-old key. Older ambiguous operations and legacy attempts missing snapshots require reconciliation; never delete them just to unblock payment.

Saved sessions are retrieved from Stripe. An open session is reused; a confirmed expired session is marked expired and asks the user to retry; a completed session blocks further checkout pending billing reconciliation. A completed checkout is not proof of paid entitlement. `ACTIVE`, `TRIALING`, and `PAST_DUE` local subscriptions are blocked, and Stripe subscriptions are checked to cover delayed webhooks. Customer accounts with more than 100 subscription records are conservatively blocked pending review.

Signed webhooks now synchronize billing state. An automated/manual recovery workflow for missed events remains outside this flow. Reconciliation must recover the existing Stripe object, update local billing state, and avoid regressing a completed attempt. The frontend verifies the returned HTTPS `checkout.stripe.com` URL before navigation.

Tests mock Stripe; no real Stripe objects or payments are created. Optional database concurrency verification uses `CHECKOUT_TEST_DATABASE_URL` pointing to a disposable database whose name starts with `checkout_test`; never use the application's database. Apply checked-in migrations to that disposable database first.

## Changing plans before payment

Returning from Stripe does not itself cancel a checkout. Selecting a different
plan or billing interval now retrieves the previous OPEN session and expires it
at Stripe before marking the local attempt EXPIRED. An already-expired Stripe
session can also be released. The new selection acquires a fresh attempt with
its own immutable parameters and idempotency key; choosing the same selection
continues to reuse the existing session.

Completed sessions, unresolved CREATING attempts, and failed or uncertain Stripe
expiration calls remain blocking. A retry retrieves the previous session again
to establish its outcome. A concurrent local update is accepted only if the
same session is already EXPIRED. Each request replaces at most one attempt and
rechecks the selection after acquiring its replacement, so a competing different
selection returns `checkout_attempt_conflict` rather than repeatedly canceling
other requests' checkouts. No migration or webhook configuration change is needed.

## Managing an existing subscription

The pricing page's **Manage subscription** button calls `POST /api/purchases/portal`
using the existing session cookie. The backend resolves the saved customer and
creates a Stripe Customer Portal session; it does not start another subscription.
The browser accepts only HTTPS `billing.stripe.com` URLs and prevents concurrent
checkout/portal requests during navigation. Existing subscribers attempting checkout
are directed to this button. Configure permitted plans and billing rules in the
Stripe portal configuration as described in the root README.
