# Customer portal implementation plan

## Approved direction

Implement Stripe's full hosted Customer Portal, as requested after comparing hosted and custom plan management. Add a Manage subscription button on pricing. Stripe configuration owns allowed prices, prorations, cancellation and payment-method settings. No new billing policy, schema, dependencies, or external configuration changes are included.

## Architecture and acceptance criteria

POST /api/purchases/portal authenticates a TECH using the existing cookie session, resolves the account through the purchasing model, and creates a fresh Stripe portal session for its saved customer. Never accept customer IDs, configuration IDs, or return URLs from the browser. Allow overdue/canceled customers to manage billing; reject accounts without a saved Stripe customer. Use APP_PUBLIC_URL or FRONTEND_ORIGIN for the pricing return URL and optional STRIPE_PORTAL_CONFIGURATION_ID for a server-selected configuration (otherwise Stripe's default).

The pricing button uses the browser API layer and permits only HTTPS billing.stripe.com redirects. It shares the checkout pending lock and provides actionable authentication/missing-account errors without exposing provider details. Returning from Stripe does not assert a successful plan change. Existing signed webhooks remain authoritative.

## Steps

- [x] Add failing backend route/service tests covering authentication, role, identity injection, missing customer, configuration selection, provider failure and no-store responses.
- [x] Add the public billing-portal service, controller, route and optional configuration.
- [x] Add failing browser API and pricing tests; implement safe portal navigation and error/pending UI.
- [x] Document Stripe sandbox/live setup, supported catalog, webhook forwarding and scheduled-change limitations.
- [x] Run focused tests, full repository tests, typecheck, build and diff checks.
- [ ] Inspect browser interactions and responsive layout: browser host unavailable; native fallback stopped because current browser URL could not be verified.

## Verification results

46 focused portal/API/pricing tests pass in the final full run. All 410 frontend tests and 603 backend tests pass; 39 opt-in database tests skip. The full suite remains red because messaging.api.test.ts and server-lifecycle.test.ts mock env without STRIPE_SECRET_KEY and fail while importing the pre-existing checkout Stripe client. An initial database-env-policy timeout passed on rerun. Typecheck, build and git diff --check pass. Independent read-only review found no concrete issues. Stripe configuration and a real sandbox portal journey still require verification; no external billing settings were changed.

## Review focus

Never create a replacement subscription or customer. Ignore all browser-supplied identity and return parameters. Never cache or log portal URLs. Existing checkout stays independent. Billing rules remain in Stripe; validate the chosen catalog and payment-failure behavior before enabling changes. The app does not mirror future schedule details or customer billing-address changes into profile data.
