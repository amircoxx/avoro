# Customer-to-tech messaging system

## Goal

Let a signed-in customer request permission to message a published tech, let the tech accept or decline that request, and provide durable, realtime text messaging after acceptance. The system must preserve messages across disconnects, enforce permissions on the server, limit spam, and notify offline users without exposing private message text in email.

This design follows the existing request flow:

`React page -> messaging facade -> frontend API/socket clients -> Express route or socket gateway -> messaging service -> messaging model/Prisma -> PostgreSQL`

The WebSocket gateway is an additional transport into the messaging service. It does not own separate business rules.

## Approved product decisions

- A customer may initiate contact before booking by sending one introductory message request.
- The tech must accept the request before either participant can send normal messages.
- Accepted conversations remain available indefinitely. Either participant may archive the conversation or block the other participant.
- A declined request disables sending for 30 days. After the cooldown, the customer may submit one new request to the same tech.
- A directional block overrides pending, accepted, declined, and cooldown states until the blocker explicitly unblocks.
- Release 1 supports plain text only, with a 2,000-character server-owned maximum.
- Release 1 shows unread counts but not read receipts, typing indicators, or online presence.
- Users receive in-app unread indicators and privacy-safe email alerts.
- Email alerts link to the conversation but do not contain the message body.
- WebSockets provide live delivery. PostgreSQL and REST catch-up provide durability and offline recovery.
- The public booking workflow remains independent. A conversation does not require or automatically create a booking.

## Scope and non-goals

Release 1 includes:

- customer-created message requests from published tech profiles;
- tech request review, acceptance, decline, and blocking;
- a shared customer/tech inbox at `/messages`;
- live text messages over an authenticated Socket.IO connection;
- REST inbox, history, lifecycle, unread, archive, block, and reconnect APIs;
- idempotent message sends and reconnect catch-up;
- transactional realtime/email delivery jobs;
- responsive desktop and mobile messaging UI;
- focused metrics and privacy-safe operational logging.

Release 1 does not include:

- images, documents, voice messages, or link previews;
- group conversations or support/admin participation;
- tech-initiated conversations;
- message editing, deletion, reactions, forwarding, or search;
- visible delivered/seen receipts;
- typing indicators or presence;
- end-to-end encryption;
- automatic moderation or message-body analytics;
- SMS or mobile push notifications;
- booking-linked threads;
- permanent user or message deletion workflows beyond existing account/data policies.

## Architecture

### Browser

The frontend adds a role-neutral `/messages` page. Pages own rendering and view state. A focused messaging facade coordinates inbox loading, request actions, history pagination, socket connection state, catch-up, pending sends, and mapping API results to view needs.

Browser requests belong in `frontend/src/services/api/messaging.ts`, re-exported from the existing API compatibility entry point. Socket connection and typed event handling belong in a dedicated frontend messaging socket client, not in React components.

### REST transport

REST owns resource-oriented and recovery-friendly operations:

- inbox and unread summaries;
- paginated message history;
- messages newer than a known sequence after reconnect;
- request creation, acceptance, and decline;
- participant read and archive state;
- block and unblock operations.

### WebSocket transport

Socket.IO attaches to the existing persistent Node HTTP server. It owns live connection concerns:

- authenticated connection and reconnect;
- sending normal text messages with acknowledgments;
- receiving canonical committed messages;
- receiving conversation-state and unread-summary changes;
- session-invalid events that stop reconnect loops.

The gateway authenticates the existing HTTP-only cookie during the handshake and validates the configured frontend origin. Clients do not choose or join arbitrary conversation rooms. Each connection joins only a server-owned `user:<userId>` room after authentication, and backend fan-out targets those user rooms.

The gateway delegates every command to the public messaging service entry point. The service performs the same authorization, block, state, validation, idempotency, and persistence checks regardless of transport.

### Messaging domain

The backend follows existing ownership boundaries:

- `routes` map REST endpoints;
- `controllers` parse HTTP inputs and map results/errors;
- the socket gateway adapts socket commands and acknowledgments;
- `validations` contain Zod schemas shared by controllers and the gateway where appropriate;
- `services` own request lifecycle, authorization, unread state, message writes, and delivery-job creation;
- `models` own all Prisma access.

Controllers and the socket gateway do not directly mutate Prisma models.

### Durable delivery and fan-out

PostgreSQL is the canonical message store. A message is successful only after its database transaction commits. The sender then receives the canonical saved representation in the socket acknowledgment.

The same transaction inserts user-specific delivery-outbox rows. Realtime rows target both participants so the sender's other devices converge; email rows target only the non-sender when policy permits. The message transaction also advances the sender participant's read cursor through the new sequence. A backend dispatcher claims rows with leases and `FOR UPDATE SKIP LOCKED`, following the established booking-email dispatcher pattern.

Realtime fan-out initially uses PostgreSQL `LISTEN/NOTIFY` behind a small adapter. The dispatcher publishes only identifiers and event metadata, never message bodies. Each listening backend instance fetches the canonical authorized event data by identifier before emitting to its local user rooms. Publishing and marking a realtime job processed happen in one PostgreSQL transaction so the notification is emitted on commit. Duplicate notifications are acceptable because clients deduplicate by canonical message ID/sequence.

Each backend instance keeps a dedicated PostgreSQL session connection for `LISTEN`; pooled transaction connections cannot own subscriptions. The adapter boundary permits a later Redis-compatible broker without changing message persistence, authorization, APIs, or UI behavior.

This design requires a deployment that supports a persistent Node HTTP process, WebSocket upgrades, and a dedicated PostgreSQL listener connection. Production readiness must verify those capabilities before rollout.

## Conversation lifecycle

### Pending

A customer creates a request for a published tech profile with one introductory message. A database transaction creates or reopens the customer/tech conversation, ensures both participant rows exist, saves the request message, updates inbox ordering, and creates delivery jobs.

While pending:

- the customer cannot send another message;
- the targeted tech may accept, decline, or block;
- other tech accounts and customers cannot access the conversation.

### Accepted

Only the owning tech user may accept a pending request. Acceptance changes the status atomically and publishes a conversation update to both participants. Normal text messaging is then allowed in both directions.

Accepted conversations do not expire. Archiving changes only the acting participant's inbox state and does not close the conversation or delete history. A new received message automatically clears the recipient's archive timestamp so the conversation returns to the active inbox.

### Declined

Only the owning tech user may decline a pending request. Decline records `declinedAt` and prevents normal messages. A new request is rejected until strictly after `declinedAt + 30 days`. Once the cooldown expires, the same customer may create one new request within the existing conversation history, returning it to pending.

### Blocked

Blocking is directional and stored separately from conversation status. Before creating a request or message, the service checks blocks in both directions. If either participant has blocked the other, sending fails with the same generic `messaging_blocked` response so the API does not reveal which side initiated the block.

Unblocking removes only the acting user's directional block. It does not accept a request, reset a decline cooldown, unarchive a conversation, or erase history.

## Data model

### Enums

`ConversationStatus`:

- `PENDING`
- `ACCEPTED`
- `DECLINED`

`MessageKind`:

- `REQUEST`
- `TEXT`

`MessagingDeliveryKind` initially distinguishes realtime conversation/message updates and the supported email-alert kinds.

### Conversation

Add `Conversation` with:

- `id` UUID primary key;
- `customerId` foreign key to `User`;
- `techProfileId` foreign key to `TechProfile`;
- `status`;
- `requestedAt`, `acceptedAt`, and `declinedAt` nullable lifecycle timestamps;
- `lastMessageAt` for inbox ordering;
- `createdAt` and `updatedAt`;
- a unique constraint on `(customerId, techProfileId)`;
- indexes supporting customer inbox, tech-profile inbox, status, and last-message ordering.

The customer must have role `CUSTOMER`. The tech participant is always the user who owns `techProfileId`. Role and ownership are revalidated in service transactions; they are not inferred from client input.

### Conversation participant

Add `ConversationParticipant` with:

- `id` UUID primary key;
- `conversationId` and `userId` foreign keys;
- participant role (`CUSTOMER` or `TECH`) constrained by application logic;
- `lastReadSequence` as a non-negative big integer, initially zero;
- `archivedAt` nullable;
- `lastEmailAlertAt` nullable for alert coalescing;
- timestamps;
- a unique constraint on `(conversationId, userId)`;
- indexes for user inbox queries.

Every conversation has exactly two participant rows created in the same transaction as the first request. Service invariants reject writes if the expected customer or tech owner participant is missing or inconsistent.

### Message

Add `Message` with:

- `id` UUID primary key;
- `sequence` database-generated increasing big integer, unique;
- `conversationId` and `senderUserId` foreign keys;
- `kind`;
- normalized plain-text `body`;
- `clientRequestId` UUID;
- `createdAt`;
- a unique constraint on `(senderUserId, clientRequestId)` for idempotent retry;
- an index on `(conversationId, sequence)` for history and catch-up.

Ordering and pagination use `sequence`, not client timestamps. The server ignores client-created timestamps. Retrying a committed client request ID returns the original canonical message and does not create duplicate delivery jobs.

### Messaging block

Add `MessagingBlock` with:

- `blockerUserId` and `blockedUserId` foreign keys;
- `createdAt`;
- a unique constraint on the directional pair;
- a check that a user cannot block themself.

Only users who form a valid customer/tech conversation pair may create a messaging block through this feature.

### Messaging delivery outbox

Add a messaging-specific outbox rather than changing the established booking-specific `NotificationOutbox` contract. `MessagingDeliveryOutbox` contains:

- unique `eventKey`;
- delivery kind;
- `conversationId`, optional `messageId`, and `recipientUserId`;
- minimal JSON metadata with no message body;
- `attempts`, `nextAttemptAt`, `leasedAt`, `processedAt`, and sanitized `lastError`;
- timestamps;
- indexes for claimable work and recipient/event lookup.

Message persistence and delivery-job creation commit together. Failure to send a realtime or email alert never rolls back an already-saved message.

## REST API contracts

Mount `messagingRouter` at `/api/messaging`.

### Requests and conversations

- `POST /api/messaging/requests`
  - Customer-only.
  - Input: `techProfileId`, `body`, `clientRequestId`.
  - Creates the first request or reopens a declined conversation after cooldown.
- `GET /api/messaging/conversations`
  - Customer or tech.
  - Supports stable cursor pagination and `status`/`archived` filters.
  - Returns only conversations for the current user plus a `syncSequence` high-water mark from the same database snapshot.
- `GET /api/messaging/unread-summary`
  - Returns total unread count plus pending-request count appropriate to the current role.
- `POST /api/messaging/conversations/:conversationId/accept`
  - Owning tech only; pending state required.
- `POST /api/messaging/conversations/:conversationId/decline`
  - Owning tech only; pending state required.

### History and participant state

- `GET /api/messaging/conversations/:conversationId/messages?beforeSequence=...&limit=...`
  - Returns older history in canonical sequence order with a bounded maximum page size of 50.
- `GET /api/messaging/conversations/:conversationId/messages?afterSequence=...&limit=...`
  - Used for focused catch-up while one conversation is open. The response indicates whether more results remain.
- `GET /api/messaging/sync?afterSequence=...&limit=...`
  - Returns current-user messages newer than a global sequence across every participating conversation plus the canonical unread summary.
  - Uses bounded pagination and returns `nextSequence` plus `hasMore`; it never returns data for conversations outside the current user's membership.
  - On every reconnect, the client also reloads the conversation inbox so acceptance, decline, archive, and block changes missed while offline are recovered independently of message sequence.
- `POST /api/messaging/conversations/:conversationId/read`
  - Input: `throughSequence`.
  - Advances but never decreases the current participant's read cursor.
- `POST /api/messaging/conversations/:conversationId/archive`
  - Archives only the current participant's inbox row.
- `DELETE /api/messaging/conversations/:conversationId/archive`
  - Restores only the current participant's inbox row.

### Blocks

- `POST /api/messaging/blocks`
  - Input: `conversationId`.
  - Derives the other participant server-side and creates a directional block.
- `DELETE /api/messaging/blocks/:conversationId`
  - Removes only the current participant's directional block for that conversation.

All identifiers and bodies are validated by Zod. List and history endpoints use bounded pagination and never expose another user's email address or private profile fields.

## Socket contract

### Connection

The client connects with the existing session cookie. The handshake rejects missing/expired sessions, admin accounts, unapproved origins, and connections over configured per-user/IP limits. Logout or session expiration causes `session:invalid` and prevents infinite reconnect attempts.

### Client commands

`message:send` input:

- `conversationId`;
- `body`;
- `clientRequestId`.

The acknowledgment is either:

- `{ ok: true, message: MessageDto }`; or
- `{ ok: false, error: { code, message, retryAfterSeconds? } }`.

Initial bootstrap connects the socket first, buffers live events, loads the canonical inbox and its `syncSequence` high-water mark, then merges buffered events. Socket events never advance the recovery cursor because multi-instance fan-out can arrive out of order. Only a successful paginated `GET /api/messaging/sync` response advances the client cursor. Socket.IO's reconnect callback reloads the inbox and pages sync after the last REST-confirmed cursor. Focused conversation history continues to use the per-conversation endpoint. No socket-only cursor is authoritative.

### Server events

- `message:created` with a canonical committed `MessageDto`;
- `conversation:updated` with the minimal canonical inbox/conversation representation;
- `unread:changed` with the current user's summary;
- `session:invalid` without session details.

Events are delivered to server-owned user rooms. Clients deduplicate by message ID and sequence. Receiving an event does not mark it read; the visible conversation advances the read cursor through the REST endpoint.

## Validation, authorization, and abuse controls

- Normalize line endings and surrounding whitespace; reject an empty result.
- Limit bodies to 2,000 Unicode characters after normalization.
- Store and render plain text. React rendering must not use raw HTML, and URLs are not automatically activated in release 1.
- Verify current-user conversation membership on every REST action and socket command.
- Verify the current tech still owns the target tech profile before accepting, declining, or responding.
- Require a published tech profile for a new customer request. Existing accepted conversations remain usable if a profile is later unpublished unless a participant blocks the other.
- Reject customer self-contact with their own tech profile.
- Check block state and decline cooldown inside the same transaction that writes a request or message.
- Apply separate rate limits for request creation, message sends, connection handshakes/reconnects, and history reads. Initial exact thresholds are configuration decisions for implementation, must be conservative, and require focused tests.
- Limit concurrent socket connections per user while allowing normal multi-device use.
- Do not log message bodies, cookies, authorization headers, email content, or raw socket payloads.
- Log actor ID, conversation ID, event type, result code, duration, and delivery-job identifiers.

Stable client error codes include:

- `request_pending`;
- `request_cooldown`, with the next allowed timestamp;
- `messaging_blocked`;
- `conversation_not_accepted`;
- `message_rate_limited`, with a safe retry interval;
- `message_too_long`;
- `forbidden`;
- `not_found`;
- `session_invalid`.

Unauthorized membership checks should prefer a generic not-found response where revealing that a conversation exists would leak information.

## Offline recovery and failure handling

### Recipient offline

No per-user queue stores canonical message bodies. The message remains in PostgreSQL, and the recipient loads messages after their last known sequence when reconnecting. The delivery outbox carries only notification work.

### Sender disconnects before acknowledgment

The UI keeps the unsent text visible and marks it pending. After reconnect, it retries with the same `clientRequestId`. The server returns the original message if the first attempt committed. The UI does not display a pending message as definitively sent until it receives the canonical result.

### Fan-out failure

The outbox dispatcher retries transient realtime publication failures with bounded exponential backoff and leases. Even if fan-out never succeeds, reconnect catch-up returns the saved message.

### Email failure

Email delivery is advisory and must not control message commit success. Jobs retry transient failures. Permanent provider failures retain sanitized diagnostics for operations.

### Duplicate or out-of-order events

Clients merge by canonical ID and sort by server sequence. Duplicate notifications and acknowledgments are safe. Socket events do not advance the REST-confirmed recovery cursor. Initial bootstrap uses the inbox high-water mark after buffering live events; reconnect always performs paginated REST catch-up, so an earlier event cannot be lost when a later event arrives first.

### Database unavailable

The socket command returns a generic retryable failure and no success acknowledgment. The draft remains available to the sender. The system never broadcasts an uncommitted message.

## Email alert policy

Email alerts cover:

- a new message request to a tech;
- request acceptance or decline to the customer;
- a new message in an accepted conversation.

Email includes the sender/display name, event type, and secure link to `/messages`, but no message body. New-message alerts are delayed briefly, skipped if the recipient has already advanced the read cursor through the message, and coalesced per conversation to avoid one email per text. A default target is at most one unread-message alert per conversation within a 15-minute window; the exact timing remains server configuration rather than a public API contract.

The messaging dispatcher may reuse existing Brevo client and sender configuration helpers but must not couple messaging records to booking records.

## User experience

### Entry points

- Published tech profiles add `Message this tech` beside the booking action. Booking remains visually primary.
- An unauthenticated visitor is asked to sign in or create a customer account without losing the draft request.
- Customer and tech account menus and mobile navigation add `Messages` with an unread badge.
- Both roles use `/messages`; the page adapts actions and filters to the authenticated role.

### Customer request

The request dialog identifies the tech, explains that the customer may send one introduction pending approval, shows the plain-text limit, and submits once with a client-generated request ID. Success routes to the pending conversation. Cooldown and block responses use neutral, non-accusatory copy.

### Tech request review

The tech inbox includes a `Requests` filter and count. A pending request shows the customer display name, introduction, timestamp, and Accept, Decline, and Block actions. The reply composer remains disabled until acceptance.

### Accepted conversation

Desktop uses a conversation list and detail pane. Mobile shows the list first and a full-screen conversation with a Back control. The view contains chronological text messages, day/time separators, connection/reconnecting status, a multiline composer, send state, archive, and block actions.

The composer preserves its draft through temporary connection loss. It does not promise background offline sending; the user sees pending/retry state until the server confirms persistence.

### Accessibility

- Inbox rows and actions are keyboard reachable with visible focus.
- The selected conversation and unread state are conveyed without color alone.
- New incoming messages use a polite live region without re-announcing full history.
- Request and block confirmations use accessible dialogs with focus trapping and restoration.
- Connection and send errors use `role="alert"` where immediate action is required.
- Mobile navigation and conversation transitions retain clear headings and Back labels.

## Testing strategy

### Validation and service tests

- text normalization, empty text, and length boundaries;
- customer-only initiation and tech-only decisions;
- exactly one pending request message;
- acceptance, decline, 30-day cooldown boundaries, and retry reopening;
- blocks in both directions and unblock behavior;
- unique customer/tech conversation under concurrent requests;
- idempotent request and message retries;
- participant membership and tech-profile ownership checks;
- monotonic read cursor and archive restoration;
- unread summary calculations;
- message plus delivery-outbox atomicity;
- privacy-safe error and log shaping.

### Database integration tests

Run only against the isolated test database. Cover concurrent request creation, duplicate client request IDs, accept/send races, decline/retry boundary races, block/send races, ordered sequence pagination, outbox claiming with multiple dispatchers, lease recovery, and notification publication transaction behavior.

### API and socket integration tests

- cookie authentication and origin rejection;
- REST membership isolation and bounded pagination;
- socket user-room isolation with two users and multiple devices;
- send acknowledgment only after persistence;
- recipient live delivery and sender canonical acknowledgment;
- disconnect before acknowledgment followed by idempotent retry;
- reconnect gap detection and REST catch-up;
- duplicate/out-of-order event deduplication;
- logout/session expiry stopping reconnect;
- stable rate-limit and lifecycle errors.

### Frontend tests

- profile request entry and authentication draft preservation;
- customer pending state and disabled repeat send;
- tech request filters and accept/decline/block actions;
- inbox ordering, unread badges, archive filters, and restored archived threads;
- pending, sent, retry, reconnecting, and failed UI states;
- desktop and mobile navigation behavior;
- keyboard and dialog accessibility;
- live-region behavior for incoming messages.

### Real workflow verification

Use two isolated browser sessions, one customer and one tech, to verify request creation, email alert scheduling, live acceptance, two-way messaging, multi-device unread updates, disconnection and catch-up, archive restoration, decline/cooldown errors, blocking, responsive layouts, console errors, and network/socket behavior.

## Observability

Track counters and latency without message content:

- socket connections, authenticated failures, reconnects, and active connections;
- request created/accepted/declined/blocked outcomes;
- message write latency and error codes;
- acknowledgment latency and realtime fan-out latency;
- catch-up requests, returned message counts, and detected sequence gaps;
- unread email jobs queued, skipped, sent, retried, and terminally failed;
- outbox depth, oldest pending age, attempts, and lease recovery;
- rate-limit activations.

Alert on growing outbox age, sustained socket authentication failures, database/listener disconnection, high message-write error rate, or abnormal reconnect loops.

## Rollout sequence

1. Add the migration, Prisma models, model boundary, validation, and messaging service with database/service tests.
2. Add REST lifecycle, inbox, history, participant-state, and block APIs with integration tests.
3. Attach Socket.IO to the existing server lifecycle, add authentication and user rooms, and verify graceful shutdown.
4. Add the transactional delivery dispatcher and PostgreSQL fan-out adapter; exercise multi-instance behavior in an isolated environment.
5. Add frontend API/socket clients and messaging facade.
6. Add `/messages`, profile request entry, account navigation badges, responsive behavior, and accessibility tests.
7. Add privacy-safe Brevo templates and email coalescing.
8. Run focused suites, Prisma generation/validation, full tests, typecheck, build, `git diff --check`, and two-session browser verification.
9. Deploy behind a server-owned messaging feature flag, first for internal/test accounts, then a limited cohort, then all users after outbox, socket, error, and abuse metrics remain healthy.

The migration is additive. Do not use `prisma db push` for shared or production databases. If the feature flag is disabled after deployment, saved conversations and messages remain intact while entry points and live connections are unavailable.

## Acceptance criteria

- A signed-in customer can send exactly one request to a published tech without a booking.
- Only the owning tech can accept or decline that request.
- Before acceptance, neither side can send normal messages.
- After acceptance, both participants can send and receive live text messages.
- A committed message survives sender/recipient disconnects and backend restart and appears through catch-up.
- Retrying with the same client request ID cannot create a duplicate message or duplicate delivery jobs.
- A decline enforces the full 30-day cooldown; a block prevents messaging until the blocker unblocks.
- Users can archive independently, and an incoming message restores the recipient's archived conversation.
- Unread badges remain correct across reconnect and multiple devices without exposing visible read receipts.
- Email alerts contain no private message body and are skipped/coalesced according to policy.
- No user can enumerate or access a conversation they do not participate in.
- Message bodies, cookies, and private email content do not appear in application logs or realtime fan-out payloads.
- The existing booking, schedule, session-cookie, and booking-email contracts continue to work unchanged.
