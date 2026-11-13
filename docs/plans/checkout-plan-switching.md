# Checkout plan switching

Approved behavior: returning from an unpaid checkout and selecting a different
plan or billing interval replaces the old checkout safely.

1. Add service regressions for plan/interval changes, already-expired sessions,
   provider failures, completed payments, and competing replacement requests.
2. Retrieve the old OPEN session and expire it at Stripe before releasing its
   local attempt. Preserve CREATING/uncertain/completed attempts. If a concurrent
   writer changed the row, proceed only if the same session is locally EXPIRED.
3. Acquire a fresh attempt using the existing unique active-attempt constraint.
   Recheck the winning selection; replace at most one old attempt per request.
   Keep immutable snapshots and distinct creation idempotency keys.
4. Update checkout documentation and run focused tests, repository tests,
   typecheck, build, and diff checks. Real Stripe/browser verification and
   database concurrency checks require an available browser and isolated test DB.

No schema, API envelope, authorization, or paid-entitlement changes are needed.
Never release the local attempt if Stripe expiration fails or is uncertain.

## Verification

- Checkout service: 29 passing tests, including 14 new switching cases.
- Checkout model: 8 passing tests.
- Frontend suite: 393 passing tests.
- Repository typecheck, build, and diff check passed. Vite reports its existing
  large-chunk warning.
- Full backend run: 588 passed, 39 skipped, one configuration-test timeout and
  two suite import failures. All 13 database environment policy tests passed on
  focused rerun. `messaging.api.test.ts` and `server-lifecycle.test.ts` mock the
  environment without `STRIPE_SECRET_KEY`, so the unchanged Stripe constructor
  fails during import; those unrelated test setups were not modified.
- Isolated database tests were skipped by their environment gates. Live browser
  and Stripe verification remains outstanding because Chrome was unavailable.
