# Customer-to-Tech Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build permissioned, durable, realtime text messaging in which a customer sends one request, the tech accepts or declines it, and both participants can then converse with offline recovery and privacy-safe notifications.

**Architecture:** PostgreSQL is the source of truth for conversations, ordered messages, participant cursors, blocks, and delivery jobs. REST owns lifecycle, inbox, history, and reconnect recovery; an authenticated Socket.IO gateway delegates live sends to the same messaging service and publishes only committed results. React uses a focused API client, socket client, facade, and messaging context before rendering the role-neutral `/messages` workspace.

**Tech Stack:** React 19, React Router, Vite, TypeScript, Socket.IO client, Express 5, Socket.IO server, Prisma 6, PostgreSQL `LISTEN/NOTIFY`, `pg`, Zod 3, Brevo, Vitest, Happy DOM, and Supertest.

## Global Constraints

- Release 1 is customer-initiated, one-to-one, plain-text messaging only.
- Message bodies are normalized plain text with an exact maximum of 2,000 Unicode code points after normalization.
- A customer gets one introductory request message; normal messages require `ACCEPTED` status.
- A decline enforces exactly 30 days before another request; a directional block overrides every conversation state.
- Accepted conversations do not expire. Archive is participant-specific and an incoming message restores the recipient's archived conversation.
- PostgreSQL is authoritative; a socket event is never proof of persistence.
- `Message.sequence` is a database-generated `BigInt` but every HTTP/socket DTO exposes it as a decimal string.
- Initial bootstrap connects and buffers socket events before loading the canonical inbox high-water mark; only successful REST sync pages advance the recovery cursor.
- Reconnect always reloads the canonical inbox and pages `GET /api/messaging/sync` after the last REST-confirmed message sequence.
- Emails never include message bodies and new-message alerts are coalesced to at most one per conversation in 15 minutes.
- No message body, cookie, authorization header, email content, or raw socket payload may be logged.
- Preserve the existing `/api`, HTTP-only session-cookie, booking, schedule, and booking-email contracts.
- Use a checked-in Prisma migration; never use `prisma db push` for a shared or production database.
- Do not run database tests against the normal application database; require `TEST_DATABASE_URL` and `RUN_DB_TESTS=1`.
- Do not commit during execution unless the user explicitly authorizes commits. The commit commands below are named checkpoints to use only after that authorization.

---

## File structure

### Backend foundation

- `backend/prisma/schema.prisma` — messaging enums, relations, and models.
- `backend/prisma/migrations/20260814_add_customer_tech_messaging/migration.sql` — additive tables, indexes, foreign keys, and checks.
- `backend/src/validations/messaging.schema.ts` — strict REST/socket schemas and cursor conversion.
- `backend/src/models/messaging.model.ts` — Prisma projections, transaction-scoped store, inbox/history/sync reads, and delivery claims.
- `backend/src/services/messaging.types.ts` — public service DTOs and actor types; all sequences are strings outside the model.
- `backend/src/services/messaging.service.ts` — request lifecycle, authorization, blocks, archive/read state, message persistence, and catch-up.
- `backend/src/services/messaging-rate-limit.service.ts` — bounded per-process defensive rate limits with deterministic test injection.
- `backend/src/services/messaging-observability.ts` — structured identifier-only telemetry for writes, sockets, catch-up, and delivery health.

### Backend transports and delivery

- `backend/src/controllers/messaging.controller.ts` — HTTP orchestration only.
- `backend/src/routes/messaging.routes.ts` — status endpoint plus authenticated lifecycle/history routes.
- `backend/src/middleware/messaging-enabled.middleware.ts` — server-owned feature gate.
- `backend/src/realtime/messaging-event-bus.ts` — dedicated PostgreSQL listener and typed identifier-only events.
- `backend/src/realtime/messaging.gateway.ts` — Socket.IO authentication, server-owned user rooms, commands, acknowledgments, and local fan-out.
- `backend/src/services/messaging-email.ts` — deterministic body-free email templates.
- `backend/src/services/messaging-delivery-dispatcher.ts` — leased outbox claiming, transactional `pg_notify`, email skip/coalescing, retry, and shutdown.
- `backend/src/server.ts` — HTTP server, socket gateway, listener, both dispatchers, and graceful shutdown.

### Frontend transport and state

- `frontend/src/services/api/messaging-types.ts` — browser DTOs and inputs.
- `frontend/src/services/api/messaging.ts` — REST messaging calls.
- `frontend/src/services/messaging-socket.ts` — Socket.IO client and typed live events.
- `frontend/src/facades/messaging.facade.ts` — combined REST/socket workflows and catch-up.
- `frontend/src/components/layout/messaging-context.tsx` — capability, unread summary, authenticated socket lifecycle, and global badge state.

### Frontend surfaces

- `frontend/src/pages/messages-page.tsx` — role/auth ownership and workspace composition.
- `frontend/src/pages/messages/conversation-list.tsx` — filters, rows, selection, unread presentation.
- `frontend/src/pages/messages/conversation-panel.tsx` — history, pending-request actions, live messages, read advancement, composer, archive, and block actions.
- `frontend/src/pages/messages/message-composer.tsx` — draft, 2,000-code-point counter, pending/retry state, and accessible errors.
- `frontend/src/pages/artist-profile/message-request-dialog.tsx` — customer introduction dialog with auth-draft preservation.
- `frontend/src/routes/app-routes.tsx`, `frontend/src/components/layout/beauty-shell.tsx`, and `frontend/src/components/layout/site-header.tsx` — route, provider, navigation, and unread badge.
- `frontend/src/assets/globals.css` — responsive inbox/dialog styles using existing palette tokens.

---

### Task 1: Add Socket.IO dependencies and the additive messaging schema

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`
- Modify: `package-lock.json`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260814_add_customer_tech_messaging/migration.sql`
- Test: `backend/src/services/__tests__/messaging-schema.test.ts`

**Interfaces:**
- Produces Prisma enums `ConversationStatus`, `MessageKind`, and `MessagingDeliveryKind`.
- Produces models `Conversation`, `ConversationParticipant`, `Message`, `MessagingBlock`, and `MessagingDeliveryOutbox`.
- Produces globally increasing `Message.sequence: bigint`; later DTO layers must serialize it to `string`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../prisma/migrations/20260814_add_customer_tech_messaging/migration.sql", import.meta.url), "utf8");

describe("messaging schema", () => {
  it("keeps one conversation per customer and tech with ordered idempotent messages", () => {
    expect(schema).toContain("@@unique([customerId, techProfileId])");
    expect(schema).toContain("sequence        BigInt");
    expect(schema).toContain("@@unique([senderUserId, clientRequestId])");
    expect(schema).toContain("@@index([conversationId, sequence])");
  });

  it("adds database checks Prisma cannot express", () => {
    expect(migration).toContain('CHECK ("blockerUserId" <> "blockedUserId")');
    expect(migration).toContain('CHECK ("lastReadSequence" >= 0)');
    expect(migration).toContain('CREATE UNIQUE INDEX "Conversation_customerId_techProfileId_key"');
  });
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-schema.test.ts`

Expected: FAIL because the migration file and models do not exist.

- [ ] **Step 3: Install the approved transport dependencies**

Run:

```bash
npm install socket.io pg --workspace @find-my-tech/backend
npm install --save-dev @types/pg --workspace @find-my-tech/backend
npm install socket.io-client --workspace @find-my-tech/frontend
```

Expected: `backend/package.json`, `frontend/package.json`, and `package-lock.json` contain only the new Socket.IO/PostgreSQL listener dependencies and their transitive packages.

- [ ] **Step 4: Add the Prisma models and relations**

Add these exact field contracts, with named relations where `User` appears more than once:

```prisma
enum ConversationStatus {
  PENDING
  ACCEPTED
  DECLINED
}

enum MessageKind {
  REQUEST
  TEXT
}
enum MessagingDeliveryKind {
  REALTIME_MESSAGE
  REALTIME_CONVERSATION
  EMAIL_REQUEST
  EMAIL_DECISION
  EMAIL_MESSAGE
}

model Conversation {
  id            String             @id @default(uuid())
  customerId    String
  techProfileId String
  status        ConversationStatus @default(PENDING)
  requestedAt   DateTime
  acceptedAt    DateTime?
  declinedAt    DateTime?
  lastMessageAt DateTime
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  customer      User               @relation("CustomerConversations", fields: [customerId], references: [id], onDelete: Restrict)
  techProfile   TechProfile        @relation(fields: [techProfileId], references: [id], onDelete: Restrict)
  participants  ConversationParticipant[]
  messages      Message[]
  deliveries    MessagingDeliveryOutbox[]

  @@unique([customerId, techProfileId])
  @@index([customerId, lastMessageAt])
  @@index([techProfileId, lastMessageAt])
  @@index([status, lastMessageAt])
}

model ConversationParticipant {
  id                 String       @id @default(uuid())
  conversationId     String
  userId             String
  role               UserRole
  lastReadSequence   BigInt       @default(0)
  archivedAt         DateTime?
  lastEmailAlertAt   DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  conversation       Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user               User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([userId, archivedAt])
}

model Message {
  id              String       @id @default(uuid())
  sequence        BigInt       @unique @default(autoincrement())
  conversationId  String
  senderUserId    String
  kind            MessageKind
  body            String
  clientRequestId String
  createdAt       DateTime     @default(now())
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender          User         @relation(fields: [senderUserId], references: [id], onDelete: Restrict)
  deliveries      MessagingDeliveryOutbox[]

  @@unique([senderUserId, clientRequestId])
  @@index([conversationId, sequence])
}
```

Add the remaining models:

```prisma
model MessagingBlock {
  id            String   @id @default(uuid())
  blockerUserId String
  blockedUserId String
  createdAt     DateTime @default(now())
  blocker       User     @relation("MessagingBlocker", fields: [blockerUserId], references: [id], onDelete: Cascade)
  blocked       User     @relation("MessagingBlocked", fields: [blockedUserId], references: [id], onDelete: Cascade)

  @@unique([blockerUserId, blockedUserId])
  @@index([blockedUserId])
}

model MessagingDeliveryOutbox {
  id              String                @id @default(uuid())
  eventKey        String                @unique
  deliveryKind    MessagingDeliveryKind
  conversationId  String
  messageId       String?
  recipientUserId String
  payload         Json
  attempts        Int                   @default(0)
  nextAttemptAt   DateTime?             @default(now())
  leasedAt        DateTime?
  processedAt     DateTime?
  lastError       String?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  conversation    Conversation          @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  message         Message?              @relation(fields: [messageId], references: [id], onDelete: Cascade)
  recipient       User                  @relation(fields: [recipientUserId], references: [id], onDelete: Cascade)

  @@index([nextAttemptAt, processedAt])
  @@index([recipientUserId, createdAt])
}
```

Add these reverse relation fields: `customerConversations`, `conversationParticipants`, `sentMessages`, `messagingBlocksCreated`, `messagingBlocksReceived`, and `messagingDeliveries` on `User`, plus `conversations` on `TechProfile`. Give the two block relations the explicit names shown above.

- [ ] **Step 5: Write the checked-in SQL migration**

Generate the normal enum/table/index/foreign-key SQL, then add these manual constraints:

```sql
ALTER TABLE "ConversationParticipant"
  ADD CONSTRAINT "ConversationParticipant_nonnegative_read_sequence"
  CHECK ("lastReadSequence" >= 0);

ALTER TABLE "MessagingBlock"
  ADD CONSTRAINT "MessagingBlock_no_self_block"
  CHECK ("blockerUserId" <> "blockedUserId");
```

Use `ON DELETE RESTRICT` for conversation customer/tech and message sender history; use `ON DELETE CASCADE` for conversation-owned participants, messages, and delivery rows.

- [ ] **Step 6: Generate and validate Prisma, then run the schema test**

Run:

```bash
./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma
./node_modules/.bin/prisma validate --schema backend/prisma/schema.prisma
npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-schema.test.ts
```

Expected: Prisma generation and validation succeed; the schema test passes.

- [ ] **Step 7: Commit checkpoint, only with explicit authorization**

```bash
git add backend/package.json frontend/package.json package-lock.json backend/prisma/schema.prisma backend/prisma/migrations/20260814_add_customer_tech_messaging/migration.sql backend/src/services/__tests__/messaging-schema.test.ts
git commit -m "feat: add messaging data foundation"
```

### Task 2: Define messaging validation, DTOs, and the Prisma model boundary

**Files:**
- Create: `backend/src/validations/messaging.schema.ts`
- Create: `backend/src/services/messaging.types.ts`
- Create: `backend/src/models/messaging.model.ts`
- Create: `backend/src/validations/__tests__/messaging.schema.test.ts`
- Create: `backend/src/models/__tests__/messaging.model.test.ts`

**Interfaces:**
- Produces `MessagingActor`, `MessageDto`, `ConversationDto`, `UnreadSummaryDto`, `MessagePageDto`, and `SyncPageDto`.
- Produces `normalizeMessageBody(value: string): string` using Unicode code-point length.
- Produces `createMessagingModel(prismaClient)` and `messagingModel` with `withSerializableTransaction`, inbox/history/sync reads, and outbox claim/update methods.
- All public `sequence`, `nextSequence`, and `throughSequence` values are decimal strings.

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from "vitest";
import { createMessageRequestSchema, markReadSchema, normalizeMessageBody } from "../messaging.schema";

describe("messaging validation", () => {
  it("normalizes line endings and rejects more than 2,000 Unicode code points", () => {
    expect(normalizeMessageBody("  hello\r\nthere  ")).toBe("hello\nthere");
    expect(() => createMessageRequestSchema.parse({
      techProfileId: "12dcb560-d78f-4c0f-a228-581b871d8db6",
      body: "😀".repeat(2_001),
      clientRequestId: "3754164f-7c66-4c13-ad80-f810453c07f5"
    })).toThrow();
  });

  it("accepts only UUID request identifiers and decimal read cursors", () => {
    expect(createMessageRequestSchema.parse({
      techProfileId: "12dcb560-d78f-4c0f-a228-581b871d8db6",
      body: "Can you work with color-treated hair?",
      clientRequestId: "3754164f-7c66-4c13-ad80-f810453c07f5"
    }).body).toBe("Can you work with color-treated hair?");
    expect(markReadSchema.parse({ throughSequence: "42" })).toEqual({ throughSequence: "42" });
    expect(() => markReadSchema.parse({ throughSequence: "-1" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the validation test and verify it fails**

Run: `npm run test --workspace @find-my-tech/backend -- src/validations/__tests__/messaging.schema.test.ts`

Expected: FAIL because `messaging.schema.ts` does not exist.

- [ ] **Step 3: Implement strict schemas and sequence conversion**

```ts
import { z } from "zod";

const uuid = z.string().uuid();
const sequence = z.string().regex(/^(0|[1-9]\d*)$/);

export function normalizeMessageBody(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

const body = z.string().transform(normalizeMessageBody).superRefine((value, context) => {
  if (!value) context.addIssue({ code: z.ZodIssueCode.custom, message: "Message cannot be empty" });
  if ([...value].length > 2_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "Message is too long" });
});
export const createMessageRequestSchema = z.object({ techProfileId: uuid, body, clientRequestId: uuid }).strict();
export const sendMessageSchema = z.object({ conversationId: uuid, body, clientRequestId: uuid }).strict();
export const conversationIdParamSchema = z.object({ conversationId: uuid }).strict();
export const markReadSchema = z.object({ throughSequence: sequence }).strict();
export const conversationListQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED"]).optional(),
  archived: z.enum(["true", "false"]).default("false"),
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30)
}).strict();
export const messagePageQuerySchema = z.object({
  beforeSequence: sequence.optional(),
  afterSequence: sequence.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50)
}).strict().refine((value) => !(value.beforeSequence && value.afterSequence), "Choose one message cursor");
export const syncQuerySchema = z.object({ afterSequence: sequence.default("0"), limit: z.coerce.number().int().min(1).max(100).default(100) }).strict();
```

- [ ] **Step 4: Define exact service DTOs**

```ts
export type MessagingActor = { id: string; role: "CUSTOMER" | "TECH" };
export type MessageDto = {
  id: string;
  sequence: string;
  conversationId: string;
  senderUserId: string;
  kind: "REQUEST" | "TEXT";
  body: string;
  createdAt: string;
};
export type ConversationDto = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  counterpart: { userId: string; displayName: string; avatarUrl: string | null };
  requestedAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  lastMessageAt: string;
  lastMessage: MessageDto | null;
  unreadCount: number;
  archivedAt: string | null;
  isBlocked: boolean;
};
export type UnreadSummaryDto = { unreadMessages: number; pendingRequests: number; total: number };
export type ConversationPageDto = { conversations: ConversationDto[]; nextCursor: string | null; syncSequence: string };
export type MessagePageDto = { messages: MessageDto[]; nextSequence: string | null; hasMore: boolean };
export type SyncPageDto = MessagePageDto & { unread: UnreadSummaryDto };
```

The DTO intentionally contains no email field.

- [ ] **Step 5: Write the failing model mapping test**

Test `toMessageDto` with `sequence: 42n` and assert the DTO contains `sequence: "42"` and an ISO `createdAt`. Test the inbox projection source and assert it contains participant membership, counterpart public identity, last-message ordering, and no email selection.

Run: `npm run test --workspace @find-my-tech/backend -- src/models/__tests__/messaging.model.test.ts`

Expected: FAIL because the model mapper does not exist.

- [ ] **Step 6: Implement the model boundary**

Export:

```ts
export function createMessagingModel(database: typeof prisma) {
  return {
    withSerializableTransaction: <T>(work: (store: MessagingTransactionStore) => Promise<T>) =>
      database.$transaction((tx) => work(createMessagingTransactionStore(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }),
    listConversations,
    listMessages,
    syncMessages,
    getUnreadSummary,
    claimDeliveryBatch,
    completeDelivery,
    retryDelivery
  };
}

export const messagingModel = createMessagingModel(prisma);
```

`MessagingTransactionStore` must expose narrowly named reads/writes needed by Tasks 3–4: request context, conversation access, idempotent message lookup, request upsert, state transition, block insert/delete, participant archive/read update, accepted-message insert, and recipient delivery creation. Keep Prisma record types private to the model and return service-shaped records with `bigint` sequences.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run test --workspace @find-my-tech/backend -- src/validations/__tests__/messaging.schema.test.ts src/models/__tests__/messaging.model.test.ts
npm run typecheck --workspace @find-my-tech/backend
```

Expected: all pass.

- [ ] **Step 8: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/validations/messaging.schema.ts backend/src/validations/__tests__/messaging.schema.test.ts backend/src/services/messaging.types.ts backend/src/models/messaging.model.ts backend/src/models/__tests__/messaging.model.test.ts
git commit -m "feat: add messaging domain boundaries"
```

### Task 3: Implement request lifecycle, archive, and block rules

**Files:**
- Create: `backend/src/services/messaging.service.ts`
- Create: `backend/src/services/messaging-observability.ts`
- Create: `backend/src/services/__tests__/messaging-lifecycle.test.ts`
- Create: `backend/src/services/__tests__/messaging-observability.test.ts`
- Modify: `backend/src/models/messaging.model.ts`

**Interfaces:**
- Consumes `MessagingTransactionStore`, strict normalized inputs, and DTO mappers from Task 2.
- Produces `createMessagingService(model, telemetry)` and singleton `messagingService`.
- Produces `createRequest`, `acceptRequest`, `declineRequest`, `setArchived`, `blockConversation`, and `unblockConversation`.
- Produces `createMessagingTelemetry(logger)` with identifier-only `recordWrite`, `recordSocket`, `recordCatchUp`, and `recordDeliveryHealth` methods.

- [ ] **Step 1: Write failing lifecycle tests with a fake transaction store**

Cover these exact cases:

```ts
it("creates one pending request and both participant rows atomically", async () => {
  const result = await service.createRequest(customer.id, input, now);
  expect(store.createRequest).toHaveBeenCalledWith(expect.objectContaining({
    customerId: customer.id,
    techProfileId: input.techProfileId,
    body: input.body,
    clientRequestId: input.clientRequestId,
    senderReadThroughNewMessage: true
  }));
  expect(result.replayed).toBe(false);
});

it("rejects a second pending request and reports the exact cooldown boundary", async () => {
  store.findRequestContext.mockResolvedValueOnce(pendingContext).mockResolvedValueOnce({
    ...declinedContext,
    declinedAt: new Date("2026-08-01T12:00:00.000Z")
  });
  await expect(service.createRequest(customer.id, input, now)).rejects.toMatchObject({ code: "request_pending" });
  await expect(service.createRequest(customer.id, input, new Date("2026-08-15T12:00:00.000Z"))).rejects.toMatchObject({
    code: "request_cooldown"
  });
});
```

Also test customer self-contact, unpublished tech, wrong-role decisions, non-owner tech decisions, exact acceptance/decline compare-and-set behavior, block checks in both directions, unblock not changing status, participant-only archive, and incoming-message archive restoration contract.

Write a telemetry test that records a message-write outcome and asserts the serialized log contains actor ID, conversation ID, outcome, and duration but has no accepted field for body, cookie, email, or raw payload. Record delivery depth/oldest-age and socket connect/reconnect outcomes through separate typed methods.

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-lifecycle.test.ts`

Expected: FAIL because `messaging.service.ts` does not exist.

- [ ] **Step 3: Implement the service factory and stable errors**

```ts
const declineCooldownMs = 30 * 24 * 60 * 60 * 1_000;

export function createMessagingService(
  model: MessagingModel = messagingModel,
  telemetry: MessagingTelemetry = messagingTelemetry
) {
  return {
    async createRequest(customerId: string, input: CreateMessageRequestInput, now = new Date()) {
      return model.withSerializableTransaction(async (store) => {
        const context = await store.findRequestContext(customerId, input.techProfileId);
        assertRequestAllowed(context, customerId, now);
        const replay = await store.findMessageByClientRequestId(customerId, input.clientRequestId);
        if (replay) return { replayed: true, conversation: replay.conversation, message: replay.message };
        return { replayed: false, ...(await store.createRequest({ customerId, ...input, now, senderReadThroughNewMessage: true })) };
      });
    },
    acceptRequest,
    declineRequest,
    setArchived,
    blockConversation,
    unblockConversation
  };
}

export const messagingService = createMessagingService();
```

Map business failures to `AppError` codes `request_pending`, `request_cooldown`, `messaging_blocked`, `conversation_not_accepted`, `forbidden`, and generic `not_found`. Return the next allowed ISO timestamp in the cooldown message/data shape without exposing block direction.

Implement telemetry as a small structured-logger adapter with explicit method parameters rather than `Record<string, unknown>`. Service writes record event name, actor/conversation IDs, result code, and duration. Task 6 records outbox depth/age/attempts; Task 7 records socket connection, authentication failure, reconnect, and fan-out latency. No method accepts message text or credential fields.

- [ ] **Step 4: Implement serializable lifecycle writes in the model store**

Use update predicates such as `{ id, status: "PENDING" }` and require `count === 1` before returning acceptance/decline success. Create lifecycle realtime/email outbox rows in the same transaction with unique event keys. On Prisma `P2034`, retry the entire service transaction at most three times; on idempotency uniqueness, load and return the original record.

```ts
const changed = await tx.conversation.updateMany({
  where: { id: conversationId, status: "PENDING" },
  data: { status: "ACCEPTED", acceptedAt: now, declinedAt: null }
});
if (changed.count !== 1) throw new AppError("Message request is no longer pending", 409, "request_not_pending");
await tx.messagingDeliveryOutbox.createMany({ data: lifecycleDeliveryRows });
```

- [ ] **Step 5: Run lifecycle and type checks**

Run:

```bash
npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-lifecycle.test.ts src/services/__tests__/messaging-observability.test.ts
npm run typecheck --workspace @find-my-tech/backend
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/services/messaging.service.ts backend/src/services/messaging-observability.ts backend/src/services/__tests__/messaging-lifecycle.test.ts backend/src/services/__tests__/messaging-observability.test.ts backend/src/models/messaging.model.ts
git commit -m "feat: add messaging request lifecycle"
```

### Task 4: Implement messages, unread cursors, history, inbox, and reconnect sync

**Files:**
- Modify: `backend/src/services/messaging.service.ts`
- Modify: `backend/src/models/messaging.model.ts`
- Create: `backend/src/services/__tests__/messaging-messages.test.ts`

**Interfaces:**
- Produces `sendMessage(actor, input)`, `listConversations(actor, query)`, `listMessages(actor, conversationId, query)`, `markRead(actor, conversationId, throughSequence)`, `getUnreadSummary(actor)`, and `syncMessages(actor, query)`.
- `sendMessage` returns `{ replayed: boolean; message: MessageDto; conversation: ConversationDto }`.
- Sync returns only current-user messages and `UnreadSummaryDto`; reconnect separately reloads the inbox.

- [ ] **Step 1: Write failing message and recovery tests**

```ts
it("acknowledges only a committed accepted-conversation message", async () => {
  store.findConversationAccess.mockResolvedValue(acceptedAccess);
  store.createAcceptedMessage.mockResolvedValue(savedMessageRecord);
  await expect(service.sendMessage(customerActor, input, now)).resolves.toMatchObject({
    replayed: false,
    message: { id: "message-2", sequence: "42", body: input.body }
  });
  expect(store.createAcceptedMessage).toHaveBeenCalledWith(expect.objectContaining({
    clearRecipientArchive: true,
    advanceSenderReadCursor: true
  }));
});

it("advances read cursors monotonically and syncs only participant messages", async () => {
  await service.markRead(customerActor, conversationId, "42");
  expect(store.advanceReadCursor).toHaveBeenCalledWith(customerActor.id, conversationId, 42n);
  await expect(service.syncMessages(customerActor, { afterSequence: "41", limit: 100 }))
    .resolves.toMatchObject({ messages: [{ sequence: "42" }], hasMore: false });
});
```

Also test pending/declined/blocked sends, idempotent retries, sender multi-device realtime rows, recipient realtime/email rows, no message body in outbox payload, bounded before/after pagination, generic non-member not-found, unread calculation, and archive restoration.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-messages.test.ts`

Expected: FAIL because message operations are not implemented.

- [ ] **Step 3: Implement message persistence and idempotency**

Inside one serializable transaction:

1. Load conversation access and both-direction block state.
2. Require actor membership and `ACCEPTED` status.
3. Return an existing `(senderUserId, clientRequestId)` message if present.
4. Insert the normalized `TEXT` message.
5. Advance the sender read cursor to the new sequence.
6. Clear the recipient archive timestamp.
7. Update `Conversation.lastMessageAt`.
8. Insert realtime rows for both users and a delayed `EMAIL_MESSAGE` row for the non-sender, with only IDs/event metadata.

Convert every `bigint` through `value.toString()` at the service DTO boundary.

```ts
const saved = await store.createAcceptedMessage({
  conversationId: input.conversationId,
  senderUserId: actor.id,
  body: input.body,
  clientRequestId: input.clientRequestId,
  now,
  clearRecipientArchive: true,
  advanceSenderReadCursor: true
});
return { replayed: false, message: toMessageDto(saved.message), conversation: toConversationDto(saved.conversation, actor.id) };
```

- [ ] **Step 4: Implement canonical reads and monotonic unread state**

Use model queries scoped by `participants.some.userId = actor.id`. Compute unread messages with `message.sequence > participant.lastReadSequence` and `senderUserId != actor.id`. Load the inbox page and current user's maximum visible message sequence inside one repeatable-read transaction and return that maximum as `syncSequence`. Encode the conversation page cursor as base64url JSON containing only `{ lastMessageAt, id }`; decode and validate both values server-side before building the stable `(lastMessageAt DESC, id DESC)` predicate. Advance reads with a guarded update equivalent to:

```ts
await tx.conversationParticipant.updateMany({
  where: { conversationId, userId: actor.id, lastReadSequence: { lt: throughSequence } },
  data: { lastReadSequence: throughSequence }
});
```

Before advancing, verify `throughSequence` does not exceed the conversation's latest visible message. Inbox pagination uses `(lastMessageAt, id)` as a stable cursor; history/sync use `Message.sequence`.

- [ ] **Step 5: Run focused service tests and typecheck**

Run:

```bash
npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-lifecycle.test.ts src/services/__tests__/messaging-messages.test.ts
npm run typecheck --workspace @find-my-tech/backend
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/services/messaging.service.ts backend/src/services/__tests__/messaging-messages.test.ts backend/src/models/messaging.model.ts
git commit -m "feat: persist and recover messaging history"
```

### Task 5: Expose feature-gated REST contracts and defensive rate limits

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/config/__tests__/env.test.ts`
- Create: `backend/src/middleware/messaging-enabled.middleware.ts`
- Create: `backend/src/services/messaging-rate-limit.service.ts`
- Create: `backend/src/services/__tests__/messaging-rate-limit.test.ts`
- Create: `backend/src/controllers/messaging.controller.ts`
- Create: `backend/src/routes/messaging.routes.ts`
- Modify: `backend/src/routes/api.routes.ts`
- Modify: `backend/src/utils/errors.ts`
- Modify: `backend/src/utils/api-response.ts`
- Modify: `backend/src/__tests__/app.test.ts`
- Create: `backend/src/__tests__/messaging.api.test.ts`

**Interfaces:**
- Produces public `GET /api/messaging/status -> { data: { enabled: boolean } }`.
- Mounts every approved lifecycle, inbox, history, sync, read, archive, and block endpoint.
- Produces `createSlidingWindowLimiter({limit, windowMs, now})` with `consume(key)` returning `{allowed, retryAfterSeconds}`.
- Adds optional safe `error.details` to the existing API error envelope for `retryAfterSeconds` and `nextAllowedAt`; existing error responses remain unchanged when details are absent.

- [ ] **Step 1: Write failing environment and limiter tests**

Add `MESSAGING_ENABLED` and `DATABASE_URL` to the environment-test key list. Assert only the case-insensitive string `true` enables messaging. Test a deterministic limiter:

```ts
const limiter = createSlidingWindowLimiter({ limit: 2, windowMs: 60_000, now: () => now });
expect(limiter.consume("user-1").allowed).toBe(true);
expect(limiter.consume("user-1").allowed).toBe(true);
expect(limiter.consume("user-1")).toEqual({ allowed: false, retryAfterSeconds: 60 });
```

- [ ] **Step 2: Write failing API contract tests**

Mock `messagingService` and session service. Cover status while disabled, 404 feature gating for mutations, customer-only request creation, tech-only accept/decline service calls, membership-scoped history, decimal cursor forwarding, archive/block endpoints, validation errors, idempotent `201` versus replayed `200`, and stable lifecycle errors. Assert a rate limit returns HTTP 429, a `Retry-After` header, and `{ details: { retryAfterSeconds: 60 } }`; assert cooldown returns `{ details: { nextAllowedAt: "2026-08-31T12:00:00.000Z" } }`.

Run: `npm run test --workspace @find-my-tech/backend -- src/config/__tests__/env.test.ts src/services/__tests__/messaging-rate-limit.test.ts src/__tests__/messaging.api.test.ts`

Expected: FAIL because the modules/routes do not exist.

- [ ] **Step 3: Implement the server-owned feature flag and limiter**

```ts
function readBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export const env = {
  PORT: readPort(process.env.PORT),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  BREVO_API_KEY: readOptional(process.env.BREVO_API_KEY),
  BOOKING_EMAIL_FROM: readOptional(process.env.BOOKING_EMAIL_FROM),
  BOOKING_EMAIL_FROM_NAME: readOptional(process.env.BOOKING_EMAIL_FROM_NAME),
  APP_PUBLIC_URL: readOptional(process.env.APP_PUBLIC_URL),
  DATABASE_URL: readOptional(process.env.DATABASE_URL),
  MESSAGING_ENABLED: readBoolean(process.env.MESSAGING_ENABLED)
};
```

The status route is always available. All other messaging routes call `requireMessagingEnabled`. Use these initial per-process defensive limits:

- request creation: 10 per customer per 24 hours;
- history/sync: 120 per user per minute;
- lifecycle mutations: 30 per user per minute.

The durable one-pending-request, cooldown, idempotency, and block rules remain authoritative when multiple instances multiply a defensive limiter.

Extend `AppError` with an optional fourth constructor argument `details?: Record<string, string | number>`. Update `toApiError` to include `details` only when defined, and update the error middleware to set `Retry-After` when `details.retryAfterSeconds` is a positive integer. Existing snapshot tests must continue receiving their original body without an empty `details` field.

- [ ] **Step 4: Implement controllers and routes**

Controllers call `requireRole`/`requireCurrentUser`, parse strict schemas, call `messagingService`, and return the existing `{ data }` envelope. Route mapping:

```ts
messagingRouter.get("/status", getMessagingStatus);
messagingRouter.use(requireMessagingEnabled);
messagingRouter.post("/requests", createMessageRequest);
messagingRouter.get("/conversations", getConversations);
messagingRouter.get("/unread-summary", getUnreadSummary);
messagingRouter.get("/sync", syncMessages);
messagingRouter.get("/conversations/:conversationId/messages", getMessages);
messagingRouter.post("/conversations/:conversationId/accept", acceptMessageRequest);
messagingRouter.post("/conversations/:conversationId/decline", declineMessageRequest);
messagingRouter.post("/conversations/:conversationId/read", markMessagesRead);
messagingRouter.post("/conversations/:conversationId/archive", archiveConversation);
messagingRouter.delete("/conversations/:conversationId/archive", restoreConversation);
messagingRouter.post("/blocks", blockConversation);
messagingRouter.delete("/blocks/:conversationId", unblockConversation);
```

Mount with `apiRouter.use("/messaging", messagingRouter)`.

- [ ] **Step 5: Run REST tests and typecheck**

Run:

```bash
npm run test --workspace @find-my-tech/backend -- src/config/__tests__/env.test.ts src/services/__tests__/messaging-rate-limit.test.ts src/__tests__/messaging.api.test.ts
npm run typecheck --workspace @find-my-tech/backend
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/config/env.ts backend/src/config/__tests__/env.test.ts backend/src/middleware/messaging-enabled.middleware.ts backend/src/services/messaging-rate-limit.service.ts backend/src/services/__tests__/messaging-rate-limit.test.ts backend/src/controllers/messaging.controller.ts backend/src/routes/messaging.routes.ts backend/src/routes/api.routes.ts backend/src/utils/errors.ts backend/src/utils/api-response.ts backend/src/__tests__/app.test.ts backend/src/__tests__/messaging.api.test.ts
git commit -m "feat: expose messaging REST contracts"
```

### Task 6: Add privacy-safe email rendering and the durable delivery dispatcher

**Files:**
- Create: `backend/src/services/messaging-email.ts`
- Create: `backend/src/services/messaging-delivery-dispatcher.ts`
- Create: `backend/src/services/__tests__/messaging-email.test.ts`
- Create: `backend/src/services/__tests__/messaging-delivery-dispatcher.test.ts`
- Modify: `backend/src/models/messaging.model.ts`

**Interfaces:**
- Produces `renderMessagingEmail(kind, payload)` with no body field.
- Produces `dispatchMessagingDeliveryBatch(options): Promise<number>` and `startMessagingDeliveryDispatcher(options): () => void`.
- Reuses `BrevoEmailClient` without changing the booking dispatcher.

- [ ] **Step 1: Write failing email privacy tests**

```ts
const rendered = renderMessagingEmail("EMAIL_MESSAGE", {
  conversationId: "conversation-1",
  senderDisplayName: "Avery",
  recipientRole: "TECH",
  appPublicUrl: "https://avoro.example"
});
expect(rendered.subject).toContain("Avery");
expect(rendered.textContent).toContain("https://avoro.example/messages");
expect(rendered.textContent).not.toContain("private message body");
expect(JSON.stringify(rendered)).not.toContain("body");
```

Cover request, accepted, declined, and new-message templates.

- [ ] **Step 2: Write failing dispatcher tests**

Cover `SKIP LOCKED`, 60-second leases, eight-attempt ceiling, realtime `pg_notify` identifier-only payload, both-user fan-out, two-minute delayed message-email eligibility, skip when read, 15-minute coalescing, retryable Brevo errors, sanitized terminal errors, and stop behavior.

Run: `npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-email.test.ts src/services/__tests__/messaging-delivery-dispatcher.test.ts`

Expected: FAIL because renderer/dispatcher do not exist.

- [ ] **Step 3: Implement deterministic body-free templates**

The renderer input contains only `conversationId`, sender/counterpart display name, recipient role, decision, and `appPublicUrl`. Return `{ subject, htmlContent, textContent }`; link to `${appPublicUrl.replace(/\/$/, "")}/messages`. Never accept a message body in the payload type.

```ts
export type MessagingEmailPayload = {
  conversationId: string;
  senderDisplayName: string;
  recipientRole: "CUSTOMER" | "TECH";
  decision?: "ACCEPTED" | "DECLINED";
  appPublicUrl: string;
};

export function renderMessagingEmail(kind: MessagingEmailKind, payload: MessagingEmailPayload): RenderedEmail {
  const messagesUrl = `${payload.appPublicUrl.replace(/\/$/, "")}/messages`;
  return renderBodyFreeTemplate(kind, payload.senderDisplayName, messagesUrl, payload.decision);
}
```

- [ ] **Step 4: Implement leased dispatch and email policy**

Claim up to 50 due `MessagingDeliveryOutbox` rows with `FOR UPDATE SKIP LOCKED`. For realtime rows, run `SELECT pg_notify('messaging_events', <identifier JSON>)` and set `processedAt` in the same transaction. For email-message rows:

1. Load the recipient participant, message sequence, safe display names, and recipient email.
2. Mark processed without sending when `lastReadSequence >= message.sequence`.
3. Mark processed without sending when `lastEmailAlertAt > now - 15 minutes`.
4. Send the body-free email outside the claim transaction.
5. Update `lastEmailAlertAt` and `processedAt` after success.
6. Retry network/408/429/5xx failures with bounded exponential backoff; terminally stop other 4xx or the eighth attempt.

```ts
export async function dispatchMessagingDeliveryBatch(options: DispatchMessagingOptions) {
  const claimed = await options.model.claimDeliveryBatch(options.now());
  const results = await Promise.allSettled(claimed.map((row) => dispatchClaimedRow(row, options)));
  const persistenceFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (persistenceFailure) throw persistenceFailure.reason;
  return claimed.length;
}
```

- [ ] **Step 5: Run delivery tests and preserve booking tests**

Run:

```bash
npm run test --workspace @find-my-tech/backend -- src/services/__tests__/messaging-email.test.ts src/services/__tests__/messaging-delivery-dispatcher.test.ts src/services/__tests__/outbox-dispatcher.test.ts src/services/__tests__/booking-email.test.ts
npm run typecheck --workspace @find-my-tech/backend
```

Expected: all pass; booking delivery behavior is unchanged.

- [ ] **Step 6: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/services/messaging-email.ts backend/src/services/messaging-delivery-dispatcher.ts backend/src/services/__tests__/messaging-email.test.ts backend/src/services/__tests__/messaging-delivery-dispatcher.test.ts backend/src/models/messaging.model.ts
git commit -m "feat: deliver private messaging alerts"
```

### Task 7: Attach the authenticated Socket.IO gateway and PostgreSQL event bus

**Files:**
- Create: `backend/src/realtime/messaging-event-bus.ts`
- Create: `backend/src/realtime/messaging.gateway.ts`
- Create: `backend/src/realtime/__tests__/messaging-event-bus.test.ts`
- Create: `backend/src/realtime/__tests__/messaging.gateway.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/__tests__/server-lifecycle.test.ts`

**Interfaces:**
- Produces `startMessagingEventBus({ connectionString, onEvent }): Promise<() => Promise<void>>`.
- Produces `attachMessagingGateway({ server, eventBus, service, frontendOrigin, enabled }): { io; stop(): Promise<void> }`.
- Socket acknowledgment type is `{ ok: true, message, conversation } | { ok: false, error: { code, message, retryAfterSeconds? } }`.

- [ ] **Step 1: Write failing event-bus tests**

Use a fake `pg.Client`. Assert `connect`, `LISTEN messaging_events`, identifier payload parsing, malformed payload rejection without secret logging, reconnect/error reporting, `UNLISTEN`, and `end` on stop.

- [ ] **Step 2: Write failing gateway tests**

Use an HTTP server and Socket.IO clients. Cover:

- missing/expired cookie rejection;
- unapproved origin rejection;
- admin rejection;
- server-owned `user:<id>` room membership only;
- `message:send` service delegation with normalized input;
- acknowledgment after resolved persistence;
- stable error acknowledgment;
- committed event fan-out to recipient and sender's second device;
- no cross-user delivery;
- per-IP handshake 20/minute, per-user send 60/minute, and per-conversation send 20/minute;
- `session:invalid` and disconnect after session revalidation failure.

Run: `npm run test --workspace @find-my-tech/backend -- src/realtime/__tests__/messaging-event-bus.test.ts src/realtime/__tests__/messaging.gateway.test.ts`

Expected: FAIL because realtime modules do not exist.

- [ ] **Step 3: Implement the dedicated PostgreSQL listener**

```ts
export type MessagingBusEvent = {
  eventKey: string;
  kind: "message" | "conversation" | "unread";
  recipientUserId: string;
  conversationId: string;
  messageId?: string;
};
```

Validate parsed JSON before calling `onEvent`. Event payloads contain IDs only. Fetch canonical DTO data through the messaging service/model before emitting locally.

- [ ] **Step 4: Implement gateway authentication and commands**

Use `getCurrentUser(socket.handshake.headers.cookie)` and compare `socket.handshake.headers.origin` with `env.FRONTEND_ORIGIN`. On success, join `user:${user.id}`. Do not implement a client room-join command. Revalidate the stored cookie through `getCurrentUser` before every command and on a five-minute unref'ed session timer; emit `session:invalid` and disconnect when the session is missing, expired, revoked, or resolves to a different user. Validate `message:send` with `sendMessageSchema`, invoke `messagingService.sendMessage`, and return the stable acknowledgment through the callback.

```ts
socket.on("message:send", async (raw, acknowledge) => {
  try {
    const current = await revalidateSocketUser(socket, authenticatedUser.id);
    const input = sendMessageSchema.parse(raw);
    const result = await service.sendMessage({ id: current.id, role: current.role as "CUSTOMER" | "TECH" }, input);
    acknowledge({ ok: true, ...result });
  } catch (error) {
    acknowledge({ ok: false, error: toSocketError(error) });
  }
});
```

- [ ] **Step 5: Refactor server startup and shutdown**

Make `startBookingServer` asynchronous and replace `app.listen` ownership with an injectable HTTP-server factory:

```ts
const server = createHttpServer(app);
const messagingRuntime = await startMessagingRuntime({ server, enabled: env.MESSAGING_ENABLED });
server.listen(env.PORT, onListening);
```

Keep `startBookingServer` as the exported entry-point name, update its tests/caller to await the returned promise, and return `{ server, shutdown }`. The module entry uses `void startBookingServer().catch(() => { console.error("Server startup failed"); process.exitCode = 1; })`. Shutdown order is: stop booking dispatcher, stop messaging dispatcher, stop accepting sockets, stop event bus/listener, close HTTP server, disconnect Prisma. A partial messaging startup failure while the flag is enabled fails server startup rather than silently claiming realtime availability.

- [ ] **Step 6: Run realtime and lifecycle tests**

Run:

```bash
npm run test --workspace @find-my-tech/backend -- src/realtime/__tests__/messaging-event-bus.test.ts src/realtime/__tests__/messaging.gateway.test.ts src/__tests__/server-lifecycle.test.ts
npm run typecheck --workspace @find-my-tech/backend
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/realtime backend/src/server.ts backend/src/__tests__/server-lifecycle.test.ts
git commit -m "feat: add authenticated realtime messaging"
```

### Task 8: Add typed frontend REST/socket clients and the messaging facade

**Files:**
- Create: `frontend/src/services/api/messaging-types.ts`
- Create: `frontend/src/services/api/messaging.ts`
- Modify: `frontend/src/services/api/client.ts`
- Modify: `frontend/src/services/api.ts`
- Create: `frontend/src/services/messaging-socket.ts`
- Create: `frontend/src/services/__tests__/messaging.test.ts`
- Create: `frontend/src/services/__tests__/messaging-socket.test.ts`
- Create: `frontend/src/facades/messaging.facade.ts`
- Create: `frontend/src/facades/__tests__/messaging.facade.test.ts`

**Interfaces:**
- Mirrors backend DTOs with sequence fields as strings.
- Extends `ApiClientError` with optional `details?: Record<string, string | number>` while preserving existing callers.
- Produces `MessagingSocket` with `connect`, `disconnect`, `sendMessage`, and typed subscription methods.
- Produces `MessagingFacade` with `loadWorkspace`, `loadOlderMessages`, `recoverAfterReconnect`, lifecycle actions, participant actions, and `sendMessage`.

- [ ] **Step 1: Write failing REST client tests**

Assert exact URL encoding, `credentials: "include"`, request envelopes, decimal cursor query parameters, status capability response, and preservation of `ApiClientError.code`/status/details for cooldown, rate-limit, and block failures.

```ts
await expect(createMessageRequest(input)).resolves.toEqual({ conversation, message });
expect(fetchMock).toHaveBeenCalledWith("/api/messaging/requests", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input)
});
```

- [ ] **Step 2: Write failing socket-client tests**

Inject a fake `io` factory. Assert `withCredentials: true`, connection to `VITE_API_ORIGIN` or same origin, no arbitrary room join, acknowledgment mapping, timeout/retry state, event subscribe/unsubscribe, and `session:invalid` stopping reconnect.

- [ ] **Step 3: Implement browser DTOs and REST calls**

Export messaging modules from `frontend/src/services/api.ts`. Add optional `details` to `ApiResponse.error`, pass it into `ApiClientError`, and leave existing formatting unchanged. Use only `apiUrl` and `readApiResponse`; pages/components do not call `fetch`.

```ts
export async function createMessageRequest(input: CreateMessageRequestInput) {
  const response = await fetch(apiUrl("/api/messaging/requests"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readApiResponse<CreateMessageRequestResult>(response, "Message request could not be sent");
}
```

- [ ] **Step 4: Implement the socket client**

```ts
export type MessagingSocket = {
  connect(): void;
  disconnect(): void;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  onMessage(listener: (message: MessageDto) => void): () => void;
  onConversation(listener: (conversation: ConversationDto) => void): () => void;
  onUnread(listener: (summary: UnreadSummaryDto) => void): () => void;
  onConnection(listener: (state: "connected" | "reconnecting" | "disconnected" | "session-invalid") => void): () => void;
};
```

Generate `clientRequestId` outside `sendMessage`; the caller retains it for retry. A five-second acknowledgment timeout changes UI state but does not generate a new ID.

- [ ] **Step 5: Write and implement facade recovery tests**

Test that initial `loadWorkspace` connects the socket, buffers events, loads the inbox `syncSequence`, then merges the buffer without using socket sequences as cursor progress. Test that `recoverAfterReconnect(lastRestConfirmedSequence)` calls inbox load first, then pages `/sync` until `hasMore` is false, advances the cursor only from successful REST `nextSequence` values, merges messages by ID, and sorts by numeric `BigInt(sequence)`. Test an out-of-order socket event (`43` before `42`) plus REST catch-up and prove both survive exactly once.

```ts
await expect(facade.recoverAfterReconnect("41")).resolves.toMatchObject({
  conversations: [conversation],
  messages: [{ ...message, sequence: "42" }],
  lastRestConfirmedSequence: "42",
  unread: { unreadMessages: 1, pendingRequests: 0, total: 1 }
});
expect(loadConversations).toHaveBeenCalledBefore(syncMessages);
```

- [ ] **Step 6: Run frontend transport tests and typecheck**

Run:

```bash
npm run test --workspace @find-my-tech/frontend -- src/services/__tests__/messaging.test.ts src/services/__tests__/messaging-socket.test.ts src/facades/__tests__/messaging.facade.test.ts
npm run typecheck --workspace @find-my-tech/frontend
```

Expected: PASS.

- [ ] **Step 7: Commit checkpoint, only with explicit authorization**

```bash
git add frontend/src/services/api/messaging-types.ts frontend/src/services/api/messaging.ts frontend/src/services/api/client.ts frontend/src/services/api.ts frontend/src/services/messaging-socket.ts frontend/src/services/__tests__/messaging.test.ts frontend/src/services/__tests__/messaging-socket.test.ts frontend/src/facades/messaging.facade.ts frontend/src/facades/__tests__/messaging.facade.test.ts
git commit -m "feat: add messaging browser clients"
```

### Task 9: Add global capability, socket, and unread state to the application shell

**Files:**
- Create: `frontend/src/components/layout/messaging-context.tsx`
- Create: `frontend/src/components/layout/__tests__/messaging-context.test.tsx`
- Modify: `frontend/src/components/layout/beauty-shell.tsx`
- Modify: `frontend/src/components/layout/site-header.tsx`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Produces `useMessaging()` with `{ enabled, unread, connectionState, live, refreshUnread }`, where `live` is the single authenticated `MessagingSocket` instance or `null`.
- Consumes `useAccountAuth()`; connects only for authenticated `CUSTOMER`/`TECH` users when server status is enabled.
- Site header renders `Messages` and the unread total for both customer and tech accounts, never admins or logged-out visitors.

- [ ] **Step 1: Write failing provider tests**

Cover disabled capability, authenticated connection, exposure of the same live client to page consumers, logout disconnect, account switch stale-event rejection, unread socket updates, buffered bootstrap, reconnect calling facade recovery, and cleanup.

```tsx
expect(socket.connect).toHaveBeenCalledTimes(1);
act(() => socket.emitUnread({ unreadMessages: 2, pendingRequests: 1, total: 3 }));
expect(container.textContent).toContain("3 unread messages");
```

- [ ] **Step 2: Run the provider test and verify it fails**

Run: `npm run test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/messaging-context.test.tsx`

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement `MessagingProvider`**

Load `/api/messaging/status` once. When enabled and the authenticated user is customer/tech, create/connect one socket, buffer events until `loadWorkspace` returns its REST `syncSequence`, then merge the buffer and store that REST-confirmed cursor. On reconnect, reload the inbox and complete `/sync` before advancing the cursor. Use a generation ref so stale events from a prior account cannot update current state. Disconnect and reset on logout or account ID change.

```tsx
useEffect(() => {
  const generation = ++connectionGeneration.current;
  if (!enabled || !authUser || authUser.role === "ADMIN") return resetMessagingState();
  const socket = socketFactory();
  const offUnread = socket.onUnread((next) => { if (connectionGeneration.current === generation) setUnread(next); });
  const offConnection = socket.onConnection((state) => {
    if (connectionGeneration.current !== generation) return;
    setConnectionState(state);
    if (state === "connected") void facade.recoverAfterReconnect(lastSequenceRef.current);
  });
  socket.connect();
  return () => { offUnread(); offConnection(); socket.disconnect(); };
}, [authUser?.id, authUser?.role, enabled, facade, socketFactory]);
```

- [ ] **Step 4: Nest the provider and add role-aware navigation**

```tsx
<AccountAuthProvider>
  <MessagingProvider>
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" richColors />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  </MessagingProvider>
</AccountAuthProvider>
```

Add a `Messages` menu item with a screen-reader label such as `Messages, 3 unread` and a visual badge only when `total > 0`. Add the same action to mobile navigation. Route through `router.push("/messages")`.

- [ ] **Step 5: Run provider/shell tests**

Run:

```bash
npm run test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/messaging-context.test.tsx src/components/layout/__tests__/beauty-shell-accessibility.test.ts
npm run typecheck --workspace @find-my-tech/frontend
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, only with explicit authorization**

```bash
git add frontend/src/components/layout/messaging-context.tsx frontend/src/components/layout/__tests__/messaging-context.test.tsx frontend/src/components/layout/beauty-shell.tsx frontend/src/components/layout/site-header.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: surface global messaging state"
```

### Task 10: Build the responsive `/messages` inbox and conversation workspace

**Files:**
- Create: `frontend/src/pages/messages-page.tsx`
- Create: `frontend/src/pages/messages/conversation-list.tsx`
- Create: `frontend/src/pages/messages/conversation-panel.tsx`
- Create: `frontend/src/pages/messages/message-composer.tsx`
- Create: `frontend/src/pages/__tests__/messages-page.test.tsx`
- Create: `frontend/src/pages/messages/__tests__/message-composer.test.tsx`
- Modify: `frontend/src/routes/app-routes.tsx`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Consumes `MessagingFacade`, `useAccountAuth`, and `useMessaging`.
- Produces a role-neutral authenticated route at `/messages`.
- Keeps page state owner-scoped by authenticated user ID and deduplicates canonical messages by ID.

- [ ] **Step 1: Write failing page workflow tests**

Cover auth loading, redirect for logged-out/admin users, customer and tech inbox loading, Requests filter only for techs, desktop list/detail composition, mobile list-to-conversation navigation, selection, older-history pagination, socket message merge, unread/read advancement, archive restoration, accept/decline/block confirmation, and error recovery.

```tsx
expect(container.querySelector('main[aria-labelledby="messages-title"]')).not.toBeNull();
expect(buttonNamed(container, "Requests, 1 pending")).not.toBeNull();
await act(async () => buttonNamed(container, "Accept request")?.click());
expect(facade.acceptRequest).toHaveBeenCalledWith("conversation-1");
expect(textarea(container)?.disabled).toBe(false);
```

- [ ] **Step 2: Write failing composer tests**

Cover Unicode code-point counter, whitespace-only disablement, Enter versus Shift+Enter behavior, pending state, five-second uncertain state, retry with the same `clientRequestId`, preserved draft while reconnecting, canonical success clearing, and accessible error alerts.

- [ ] **Step 3: Run the page tests and verify they fail**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/__tests__/messages-page.test.tsx src/pages/messages/__tests__/message-composer.test.tsx`

Expected: FAIL because components and route do not exist.

- [ ] **Step 4: Implement the page ownership and live merge logic**

`MessagesPage` rejects unsupported roles, keys all loaded state by `authUser.id`, and invalidates request generations on account change/unmount. On socket events, merge the canonical conversation/message, sort messages with `BigInt(left.sequence)`, update selection, and call `markRead` only when the conversation panel is visible and focused.

```ts
function mergeMessages(current: MessageDto[], incoming: MessageDto[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) =>
    BigInt(left.sequence) < BigInt(right.sequence) ? -1 : BigInt(left.sequence) > BigInt(right.sequence) ? 1 : 0
  );
}
```

- [ ] **Step 5: Implement accessible list, panel, and composer components**

Use semantic headings and buttons, `aria-current` for selection, text plus visual unread state, a polite live region for only the newest incoming message, and accessible confirm dialogs for decline/block. Pending requests show Accept/Decline/Block to the owning tech; the composer remains disabled until accepted. Archive and block remain participant actions.

```tsx
<main aria-labelledby="messages-title" className="messages-page">
  <h1 id="messages-title" className="editorial-display">Messages</h1>
  <div className="messages-workspace">
    <ConversationList conversations={conversations} selectedId={selectedId} onSelect={setSelectedId} />
    <ConversationPanel conversation={selectedConversation} messages={selectedMessages} connectionState={connectionState} />
  </div>
  <p className="sr-only" aria-live="polite">{newestIncomingAnnouncement}</p>
</main>
```

- [ ] **Step 6: Add responsive styles with existing tokens**

Append only `.messages-*` and `.message-request-*` selectors to `frontend/src/assets/globals.css`. Desktop uses a bounded list/detail grid; under the existing mobile breakpoint, show one pane at a time with a labeled Back button. Use existing background, foreground, border, rose, and editorial tokens; do not redesign the shell.

```css
.messages-workspace {
  display: grid;
  grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
  border: 1px solid var(--border);
  background: var(--background);
}

@media (max-width: 768px) {
  .messages-workspace { display: block; }
  .messages-pane[hidden] { display: none; }
}
```

- [ ] **Step 7: Run page, route, and accessibility tests**

Run:

```bash
npm run test --workspace @find-my-tech/frontend -- src/pages/__tests__/messages-page.test.tsx src/pages/messages/__tests__/message-composer.test.tsx src/__tests__/app-routes.test.tsx
npm run typecheck --workspace @find-my-tech/frontend
```

Expected: PASS.

- [ ] **Step 8: Commit checkpoint, only with explicit authorization**

```bash
git add frontend/src/pages/messages-page.tsx frontend/src/pages/messages frontend/src/pages/__tests__/messages-page.test.tsx frontend/src/routes/app-routes.tsx frontend/src/assets/globals.css
git commit -m "feat: add messaging inbox workspace"
```

### Task 11: Add customer message requests to published tech profiles

**Files:**
- Create: `frontend/src/pages/artist-profile/message-request-dialog.tsx`
- Create: `frontend/src/pages/artist-profile/__tests__/message-request-dialog.test.tsx`
- Modify: `frontend/src/pages/artist-profile-page.tsx`
- Modify: `frontend/src/pages/__tests__/artist-profile-page.test.ts`
- Modify: `frontend/src/assets/globals.css`

**Interfaces:**
- Consumes `createMessageRequest`, `useAccountAuth`, `useMessaging`, and `router.push`.
- Adds `Message this tech` beside the existing booking/save actions only when server capability is enabled and the profile is published.
- Keeps the request draft mounted while the shared auth modal opens.

- [ ] **Step 1: Write failing request-dialog tests**

Cover logged-out auth prompt with preserved text, tech/admin rejection, self-contact defense copy, 2,000-code-point limit, pending submission, success routing to `/messages?conversation=<id>`, request pending, cooldown date, generic blocked copy, Escape/focus trapping, and focus restoration.

```tsx
await act(async () => buttonNamed(container, "Message this tech")?.click());
textarea(container)!.value = "Do you work with color-treated hair?";
textarea(container)!.dispatchEvent(new window.Event("input", { bubbles: true }));
await act(async () => buttonNamed(container, "Log in to send")?.click());
expect(openAccountAuth).toHaveBeenCalledWith("login");
expect(textarea(container)?.value).toBe("Do you work with color-treated hair?");
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm run test --workspace @find-my-tech/frontend -- src/pages/artist-profile/__tests__/message-request-dialog.test.tsx src/pages/__tests__/artist-profile-page.test.ts`

Expected: FAIL because the dialog/action does not exist.

- [ ] **Step 3: Implement the focused dialog**

Generate one `crypto.randomUUID()` when submission begins and reuse it until a canonical success or the user changes the draft after a definite validation failure. If unauthenticated, keep the dialog and draft state mounted, call `openAccountAuth("login")`, and allow submission after `authUser` becomes a customer. Do not auto-send immediately after authentication.

```tsx
async function submitRequest() {
  if (!authUser) { openAccountAuth("login"); return; }
  if (authUser.role !== "CUSTOMER" || !techProfileId) return;
  const requestId = clientRequestId ?? crypto.randomUUID();
  setClientRequestId(requestId);
  const result = await createMessageRequest({ techProfileId, body: draft, clientRequestId: requestId });
  setClientRequestId(null);
  router.push(`/messages?conversation=${encodeURIComponent(result.conversation.id)}`);
}
```

- [ ] **Step 4: Add the narrow profile action**

Place `Message this tech` as a secondary action beside the existing primary booking action. Do not alter booking availability or saved-tech behavior. Hide it when messaging is disabled; show neutral explanatory feedback for unsupported account roles.

```tsx
{messagingEnabled ? (
  <EditorialButton variant="secondary" onClick={() => setMessageRequestOpen(true)}>
    <MessageCircle aria-hidden="true" /> Message this tech
  </EditorialButton>
) : null}
```

- [ ] **Step 5: Run profile and messaging tests**

Run:

```bash
npm run test --workspace @find-my-tech/frontend -- src/pages/artist-profile/__tests__/message-request-dialog.test.tsx src/pages/__tests__/artist-profile-page.test.ts src/pages/__tests__/messages-page.test.tsx
npm run typecheck --workspace @find-my-tech/frontend
```

Expected: PASS.

- [ ] **Step 6: Commit checkpoint, only with explicit authorization**

```bash
git add frontend/src/pages/artist-profile/message-request-dialog.tsx frontend/src/pages/artist-profile/__tests__/message-request-dialog.test.tsx frontend/src/pages/artist-profile-page.tsx frontend/src/pages/__tests__/artist-profile-page.test.ts frontend/src/assets/globals.css
git commit -m "feat: add customer message requests"
```

### Task 12: Prove database concurrency, complete documentation, and verify the full workflow

**Files:**
- Create: `backend/src/__tests__/messaging-concurrency.db.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-08-14-customer-tech-messaging-design.md` only if implementation discovers a contract correction that the user approves.

**Interfaces:**
- Validates the complete feature rather than producing a new public interface.
- Documents `MESSAGING_ENABLED`, persistent WebSocket hosting, dedicated PostgreSQL listener requirements, and isolated database-test commands.

- [ ] **Step 1: Write the gated database concurrency suite**

Use the same `RUN_DB_TESTS=1` and isolated `TEST_DATABASE_URL` gate as booking concurrency tests. Cover:

```ts
it("creates exactly one request under concurrent identical retries", async () => {
  const results = await Promise.all([
    service.createRequest(customerId, input),
    service.createRequest(customerId, input)
  ]);
  expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
  expect(await testPrisma.message.count({ where: { senderUserId: customerId, clientRequestId: input.clientRequestId } })).toBe(1);
});
```

Also prove one customer/tech conversation under different concurrent request IDs, accept-versus-decline single winner, block-versus-send safety, idempotent accepted-message retry, strictly increasing sequence pagination, monotonic read updates, multi-dispatcher `SKIP LOCKED`, and lease recovery.

- [ ] **Step 2: Apply migrations to the isolated database and run the suite**

Run:

```bash
DATABASE_URL="$TEST_DATABASE_URL" ./node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma
RUN_DB_TESTS=1 npm run test --workspace @find-my-tech/backend -- src/__tests__/messaging-concurrency.db.test.ts
```

Expected: PASS. Stop immediately if `TEST_DATABASE_URL` is absent or matches the normal/production database.

- [ ] **Step 3: Document configuration and architecture**

Add `MESSAGING_ENABLED=false` to `.env.example` and document:

- persistent Node/WebSocket deployment requirement;
- `DATABASE_URL` dedicated-listener use;
- privacy-safe Brevo behavior and feature-flag rollout;
- local and isolated database test commands;
- request flow through REST/socket -> service -> model -> PostgreSQL;
- reconnect rule: reload inbox plus user-wide sequence catch-up.

- [ ] **Step 4: Run full automated verification**

Run:

```bash
./node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma
./node_modules/.bin/prisma validate --schema backend/prisma/schema.prisma
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every command passes. Classify any unrelated pre-existing failure with exact evidence before changing scope.

- [ ] **Step 5: Verify the real two-session workflow**

Start the configured app with `MESSAGING_ENABLED=true`. In separate customer and tech browser sessions, verify:

1. Customer opens a published profile, preserves a request draft through login, and submits once.
2. Tech receives the request badge/live update and the queued body-free email alert.
3. Tech accepts; both sessions update without reload.
4. Both participants exchange messages and multi-device unread totals converge.
5. Disconnect the recipient, send messages, reconnect, and confirm inbox reload plus sequence catch-up restores every message once.
6. Drop the sender connection before acknowledgment and retry with the same client request ID; confirm one database message.
7. Verify archive restoration, decline cooldown, block/unblock, responsive mobile panes, keyboard navigation, focus restoration, live regions, console errors, and network/socket failures.
8. Inspect application logs and event-bus payloads to confirm they contain IDs/metadata only and no message body, cookie, or email content.

- [ ] **Step 6: Review the complete diff against the approved spec**

Check that no attachment, presence, typing, visible read receipt, tech-initiation, booking-link, message edit/delete, or unrelated UI refactor entered the diff. Confirm existing booking/session/email tests still pass and the feature flag hides/disables every messaging entry point when false.

- [ ] **Step 7: Commit checkpoint, only with explicit authorization**

```bash
git add backend/src/__tests__/messaging-concurrency.db.test.ts README.md docs/architecture.md .env.example
git commit -m "test: verify messaging delivery workflow"
```
