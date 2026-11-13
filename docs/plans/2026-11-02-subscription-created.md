# Subscription-created webhook

Approved design: persist Stripe's exact initial status in a nullable `Subscription.stripeStatus` field, independently of the application `status`. Do not grant paid access from creation. Add a migration without applying it to a database.

Implementation:
1. Add controller-through-model regression tests for identifiers, expanded customers, all Stripe statuses, conflicting associations, duplicate delivery, and database failures. Observe failures before implementation.
2. Add the nullable field and additive SQL migration. Keep the controller responsible for extracting event fields, the service responsible for validation, and the model responsible for persistence.
3. Atomically initialize only an unset Stripe status with an empty or matching subscription ID and matching customer. A failed conditional write must be checked against the current record: acknowledge matching initialized records, reject missing/conflicting/uninitialized records. Never change application status or credits.
4. Generate/validate Prisma, run webhook and backend regression tests, typecheck/build, review the diff, and document operational steps. No real Stripe calls or normal-database tests.

Future subscription-update handlers must write `stripeStatus`; this creation handler intentionally does not synchronize subsequent changes. A different Stripe subscription cannot replace an existing association through a creation event.

Verification: all 22 new tests failed against the original stub, then all 37 webhook tests passed after implementation. Prisma client generation/schema validation and backend typecheck/build passed. Full backend suite: 501 passed, 38 skipped; messaging.api and server-lifecycle failed at Stripe client construction due to missing API credentials, as in the prior checkout-expiration work. Database-backed tests were skipped without an isolated test database; the new migration has not been applied. No external Stripe operations were performed.
