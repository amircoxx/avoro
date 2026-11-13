# Backend services

## Purpose

Services own domain behavior between controllers and Prisma. Controllers validate and coordinate HTTP; services perform the business operation; models and Prisma provide database access.

## Services

- `tech-profile.service.ts` owns profile persistence and reads.
- `tech-search.service.ts` owns published-profile search and featured results.
- `saved-tech.service.ts` owns customer save, remove, and list behavior.
- `reviews.service.ts` owns review writes and rating-summary refreshes.
- `referrals.service.ts` owns referrals and portfolio-upload records.
- `profile-media.service.ts` owns profile-media behavior and transaction-scoped persistence.
- `messaging.service.ts` remains the public messaging domain entry point; the rate limiter, observability, and messaging types remain alongside it.
- `messaging/` contains the messaging-email renderer, delivery dispatcher, and their focused tests.
- `email/` contains the booking-email renderer, Brevo client, and durable outbox dispatcher.
- `scheduling/` contains pure availability and time-zone calculations shared by booking flows.
- `shared/booking.ts` contains booking query projections, response types, and mapping helpers reused by booking and scheduling services.
- `shared/marketplace.ts` contains profile query projections and mapping helpers reused by marketplace services.

## Adding domain behavior

Add a focused service function, call it from a controller, and keep Express `Request` and `Response` objects out of service signatures. Controllers use the public service files and may import allowed models, configuration, and utilities as needed. Put a helper under `shared/` only when multiple services use it; otherwise keep it private to its owning service file.

## Trace an incoming request

For a five-minute orientation, read `backend/src/routes`, then the matching controller, its `*.service.ts` import, and finally the relevant model and Prisma schema. Start from the frontend route and facade when you need the entire request path.

- Discover search enters through the tech route and controller, then reaches `tech-search.service.ts` for published-profile search and featured results.
- Owner profile save enters through the tech route and controller, then reaches `tech-profile.service.ts` for profile persistence.

Controllers import public service files for domain behavior and may import allowed models, configuration, and utilities as needed. Shared modules support services but do not expose domain operations directly to controllers.
