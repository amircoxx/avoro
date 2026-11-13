# Project Architecture

Find My Tech uses a literal client/server layout: `frontend/` owns the React product experience and `backend/` owns the Express API and database behavior.

| Location | Owns | Must not own |
| --- | --- | --- |
| `frontend/src/pages` | Route-level screens, view state, and composition | direct fetch or server imports |
| `frontend/src/components/layout` | Navigation, shell, footer, and shared account dialogs in `account/` | page-specific data fetching |
| `frontend/src/components/common` | Product-specific reusable UI | database access |
| `frontend/src/components/ui` | Presentational primitives | API or session behavior |
| `frontend/src/facades` | Page-level workflows that combine API operations and map results to view needs | rendering or raw `fetch` calls |
| `frontend/src/services/api` | Browser API calls by domain, shared transport, response parsing, and API types | React view state |
| `frontend/src/context` | App-wide account and messaging providers | layout and page rendering |
| `frontend/src/{hooks,utils,assets}` | Client behavior, helpers, and static data | server imports |
| `backend/src/routes` | Express endpoint mapping | domain rules |
| `backend/src/controllers` | HTTP request/response orchestration | reusable database business logic |
| `backend/src/services` | Tech-profile, search, saved-tech, review, referral, auth, and provider business rules | Express `Request`/`Response` |
| `backend/src/models` | Prisma data boundary | HTTP/UI concerns |
| `backend/src/validations` | Zod request schemas | database queries |
| `backend/src/middleware` | CORS, error, and auth boundaries | domain rules |

## Request Flow

```text
React page/component
  -> frontend/src/facades (when a workflow spans API operations)
  -> frontend/src/services/api.ts
  -> Vite /api proxy (local) or Express origin (deployed)
  -> backend route
  -> controller
  -> service
  -> model / Prisma
  -> Postgres
```

The API retains HTTP-only cookie sessions. Local Vite development proxies `/api` to the backend. In production, `FRONTEND_ORIGIN` is the only credentialed CORS origin.

## Messaging flow and runtime

Messaging preserves the standard ownership boundaries while adding an authenticated socket transport for acknowledged sends and live hints:

```text
React page/component
  -> messaging facade
  -> REST API or cookie-authenticated Socket.IO
  -> Express controller or socket gateway
  -> messaging service
  -> messaging model / Prisma
  -> PostgreSQL
```

REST remains authoritative for status, inbox, history, unread totals, lifecycle actions, and catch-up. The socket gateway accepts idempotent message sends and emits participant-scoped updates only after the service commits. Services enforce request, decision, archive, block, read-cursor, and idempotency rules inside serializable transactions; the model owns Prisma queries, global message sequences, and participant-scoped hydration.

The browser connects directly with the WebSocket transport so its handshake includes the `Origin` header required by the gateway, including on same-origin deployments. Vite forwards `/socket.io` with WebSocket upgrades to the backend alongside `/api`. Hosting proxies must also support WebSocket upgrades. The client explicitly reconnects after a graceful server disconnect, while logout and session invalidation stop reconnection.

Committed writes create durable `MessagingDeliveryOutbox` rows whose payloads contain identifiers and state metadata, never message bodies. Dispatchers claim due rows with leases and `FOR UPDATE SKIP LOCKED`. Realtime delivery atomically marks a row complete and publishes an identifier-only `pg_notify` event. Every enabled backend instance holds a dedicated `DATABASE_URL` PostgreSQL connection subscribed with `LISTEN messaging_events`; the gateway then reloads the participant-authorized message, conversation, and unread DTOs before emitting them. Brevo request, decision, and unread-message emails are rendered from database context without including the message body.

This runtime requires a persistent Node HTTP process with long-lived WebSocket support, background polling, and persistent PostgreSQL connections. `MESSAGING_ENABLED` defaults to false and gates the operational REST routes, socket authorization, dispatcher, and frontend entry points together. The public `GET /api/messaging/status` capability endpoint remains available while disabled and reports `{ enabled: false }`. When enabled, the database must allow one dedicated listener connection per backend instance in addition to Prisma's connections.

Realtime delivery is non-authoritative. After a socket reconnect, the client reloads the inbox and unread summary through REST, then requests user-wide message pages strictly after its last REST-confirmed global sequence. Stable message IDs and monotonically increasing sequences merge snapshot, catch-up, and buffered socket events exactly once.

## Start Here: Five-Minute Reading Order

1. Open `frontend/src/routes/app-routes.tsx` to locate the route and its page.
2. Read the route page in `frontend/src/pages` and any sibling feature directory it composes.
3. Follow workflow code into `frontend/src/facades` and the public browser API contract in `frontend/src/services/api.ts`.
4. Follow the re-export into the matching `frontend/src/services/api/<domain>.ts` module.
5. Trace the matching backend route, controller, stable service entry point, model, and Prisma schema.

For Discover search, the concrete path is `pages/discover-page.tsx` -> `facades/discover.facade.ts` -> `services/api/techs.ts` -> `GET /api/techs/search?...` -> `routes/tech.routes.ts` -> `controllers/tech.controller.ts` -> `services/tech-search.service.ts`.

For an owner profile save, start at `pages/tech-profile-page.tsx`, follow `services/api/profiles.ts` directly to `POST /api/techs`, then trace `routes/tech.routes.ts` -> `controllers/tech.controller.ts` -> `services/tech-profile.service.ts`.

Shared shell, navigation, and dialog code belongs in `frontend/src/components/layout`; reusable product controls belong in `frontend/src/components/common`; generic presentation primitives belong in `frontend/src/components/ui`. A section that only one page composes belongs in that page's feature directory, even if it contains several visual elements.

## Adding Code

- Add a public screen in `frontend/src/pages` and URL mapping in `frontend/src/routes`.
- Add shared UI in `frontend/src/components` according to whether it is layout, product-specific, or generic.
- Put page-level request sequences and response mapping in a focused facade; pages retain view state and rendering.
- Call API functions directly for single operations. Use facades for workflows that coordinate requests, maintain workflow state, or prepare page data; do not add facades that only rename and forward API calls.
- Add every browser request to the appropriate `frontend/src/services/api` domain module; keep `frontend/src/services/api.ts` as the public compatibility entry point.
- Add an endpoint through `backend/src/routes` and a controller.
- Put domain behavior in `backend/src/services`, Prisma access in `backend/src/models`, and request schemas in `backend/src/validations`.
- Controllers must not import a service domain's private files. They use public service entry points for domain behavior and may import allowed models, configuration, and utilities as needed. A service domain's folders remain private implementation details; `services/shared/` contains cross-domain service helpers such as `booking.ts` and `marketplace.ts`.

## Folder organization

- `components/layout/account/` groups shared account dialogs and their presentation helpers.
- `context/` owns the account and messaging providers consumed across pages and the application shell.
- `pages/tech-profile/` groups the profile editor sections, preview, details dialog, and media draft helpers.
- `backend/src/services/messaging/` groups messaging email rendering and delivery dispatching. The main `messaging.service.ts` entry point, rate limiter, observability, and shared messaging types remain at the service root.
- Focused tests live in their owning folder's `__tests__/`; broader shell and integration tests remain at their existing scope.
