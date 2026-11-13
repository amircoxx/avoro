# Checkout fixes 5–8

Implement the previously discussed persisted customer-creation operation rather than an in-memory lock or an unpersisted idempotency key. Preserve route/controller/service/model ownership. No Stripe account mutations or database migrations are run by this task.

1. Add regressions for customer creation, competing attempt inserts, subscription guards, session reuse, response validation, and ambiguous failures.
2. Add a new migration for one customer-creation operation per local subscription and nullable checkout request snapshots. Legacy attempts without snapshots fail closed if they require recreation.
3. Recover relevant Prisma unique conflicts with bounded retries. Save customer IDs conditionally, never overwrite an established association.
4. Snapshot Stripe parameters, reuse idempotency keys, stop automatic creation retries after 23 hours (before Stripe's minimum 24-hour retention). Retrieve known sessions; expired sessions require another user attempt, completed sessions block new checkout pending billing reconciliation.
5. Verify focused tests, Prisma schema/client generation, typechecks/builds and broader tests. Document remaining webhook/reconciliation operations and unapplied migration.

Subscription policy: ACTIVE, TRIALING, and PAST_DUE cannot purchase another subscription. Check Stripe's customer subscriptions as well to avoid relying only on local webhook state. Unknown/ambiguous state blocks checkout rather than creating another object. Webhook fulfillment, plan changes, refunds, and an automated reconciliation worker are outside this change.

## Verification performed

- 23 checkout service/model tests and 12 frontend checkout tests pass.
- All migrations applied to a fresh disposable PostgreSQL database. The real concurrency test passed with 8 competing customer operations and 12 competing checkout requests; Prisma's partial-index conflict reports `target: ["subscriptionId"]` as expected.
- Prisma validation/client generation, both workspace typechecks, builds, and diff whitespace check pass.
- Full frontend suite passed (388 tests before three additional URL validation cases, which also passed in the focused run).
- Backend broad suite: 453 passed, 7 environment tests failed, 2 suites failed to load due to existing mandatory Stripe configuration/import-time client construction. Those configuration/client files were not modified by this change. Other DB suites were skipped without dedicated URLs.
- Browser: mocked invalid URL was rejected with retry enabled; yearly Studio request redirected to an intercepted Stripe page at mobile viewport. No real Stripe calls or payments.
- Temporary frontend/browser/PostgreSQL processes stopped. The new migration remains unapplied to the user's database.
