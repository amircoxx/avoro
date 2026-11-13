/** Coordinates messaging REST snapshots with non-authoritative realtime events. */
import {
  acceptMessageRequest,
  archiveConversation,
  blockConversation,
  createMessageRequest,
  declineMessageRequest,
  getMessages,
  getUnreadSummary,
  listConversations,
  markMessagesRead,
  restoreConversation,
  syncMessages,
  unblockConversation,
  type ConversationDto,
  type ConversationListInput,
  type ConversationPageDto,
  type CreateMessageRequestInput,
  type CreateMessageRequestResult,
  type MessageDto,
  type MessagePageDto,
  type SendMessageInput,
  type SendMessageResult,
  type SyncPageDto,
  type UnreadSummaryDto
} from "@/services/api";
import { createMessagingSocket, type MessagingSocket } from "@/services/messaging-socket";

export type MessagingWorkspace = {
  conversations: ConversationDto[];
  messages: MessageDto[];
  unread: UnreadSummaryDto;
  nextConversationCursor: string | null;
  lastRestConfirmedSequence: string;
};

export type MessagingFacade = {
  loadWorkspace(): Promise<MessagingWorkspace>;
  loadConversationPage(input: ConversationListInput): Promise<ConversationPageDto>;
  loadOlderMessages(conversationId: string, beforeSequence?: string): Promise<MessagePageDto>;
  recoverAfterReconnect(lastRestConfirmedSequence: string): Promise<MessagingWorkspace>;
  createMessageRequest(input: CreateMessageRequestInput): Promise<CreateMessageRequestResult>;
  acceptMessageRequest(conversationId: string): Promise<ConversationDto>;
  declineMessageRequest(conversationId: string): Promise<ConversationDto>;
  markMessagesRead(conversationId: string, throughSequence: string): Promise<{ throughSequence: string }>;
  archiveConversation(conversationId: string): Promise<{ conversation: ConversationDto; archived: boolean }>;
  restoreConversation(conversationId: string): Promise<{ conversation: ConversationDto; archived: boolean }>;
  blockConversation(conversationId: string): Promise<ConversationDto>;
  unblockConversation(conversationId: string): Promise<ConversationDto>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  subscribe(listener: (workspace: MessagingWorkspace) => void): () => void;
  disconnect(): void;
};

type MessagingFacadeDependencies = {
  socket: MessagingSocket;
  loadConversations: typeof listConversations;
  loadUnreadSummary: typeof getUnreadSummary;
  getMessages: typeof getMessages;
  syncMessages: typeof syncMessages;
  createMessageRequest: typeof createMessageRequest;
  acceptMessageRequest: typeof acceptMessageRequest;
  declineMessageRequest: typeof declineMessageRequest;
  markMessagesRead: typeof markMessagesRead;
  archiveConversation: typeof archiveConversation;
  restoreConversation: typeof restoreConversation;
  blockConversation: typeof blockConversation;
  unblockConversation: typeof unblockConversation;
  sendMessage: MessagingSocket["sendMessage"];
};

export function createMessagingFacade(overrides: Partial<MessagingFacadeDependencies> = {}): MessagingFacade {
  const socket = overrides.socket ?? createMessagingSocket();
  const dependencies: MessagingFacadeDependencies = {
    socket,
    loadConversations: listConversations,
    loadUnreadSummary: getUnreadSummary,
    getMessages,
    syncMessages,
    createMessageRequest,
    acceptMessageRequest,
    declineMessageRequest,
    markMessagesRead,
    archiveConversation,
    restoreConversation,
    blockConversation,
    unblockConversation,
    sendMessage: socket.sendMessage.bind(socket),
    ...overrides
  };
  const conversations = new Map<string, ConversationDto>();
  const messages = new Map<string, MessageDto>();
  const bufferedEvents: Array<() => void> = [];
  let unread: UnreadSummaryDto = { unreadMessages: 0, pendingRequests: 0, total: 0 };
  let nextConversationCursor: string | null = null;
  let lastRestConfirmedSequence = "0";
  let initialSnapshotRecorded = false;
  let buffering = false;
  let workspaceOperation: Promise<void> | undefined;
  let stopMessage: (() => void) | undefined;
  let stopConversation: (() => void) | undefined;
  let stopUnread: (() => void) | undefined;
  const workspaceListeners = new Set<(workspace: MessagingWorkspace) => void>();

  const mergeMessage = (message: MessageDto) => {
    if (messages.has(message.id)) return false;
    messages.set(message.id, message);
    return true;
  };
  const mergeConversation = (incoming: ConversationDto) => {
    const existing = conversations.get(incoming.id);
    let changed = false;
    if (!existing || (conversationIsAtLeastAsRecent(incoming, existing) && !sameConversation(incoming, existing))) {
      conversations.set(incoming.id, incoming);
      changed = true;
    }
    if (incoming.lastMessage) changed = mergeMessage(incoming.lastMessage) || changed;
    return changed;
  };
  const enqueueOrMerge = (merge: () => void) => {
    if (buffering) bufferedEvents.push(merge);
    else merge();
  };
  const drainBufferedEvents = () => {
    for (const merge of bufferedEvents.splice(0)) merge();
  };
  const ensureSocketSubscriptions = () => {
    if (stopMessage) return;
    stopMessage = dependencies.socket.onMessage((message) => enqueueOrMerge(() => { if (mergeMessage(message)) publish(); }));
    stopConversation = dependencies.socket.onConversation((conversation) => enqueueOrMerge(() => { if (mergeConversation(conversation)) publish(); }));
    stopUnread = dependencies.socket.onUnread((summary) => enqueueOrMerge(() => { unread = summary; publish(); }));
  };
  const stopSocketSubscriptions = () => {
    stopMessage?.();
    stopConversation?.();
    stopUnread?.();
    stopMessage = undefined;
    stopConversation = undefined;
    stopUnread = undefined;
  };

  const snapshot = (): MessagingWorkspace => ({
    conversations: [...conversations.values()].sort(compareConversations),
    messages: [...messages.values()].sort(compareMessages),
    unread,
    nextConversationCursor,
    lastRestConfirmedSequence
  });
  const publish = () => {
    if (buffering) return;
    const current = snapshot();
    for (const listener of workspaceListeners) listener(current);
  };
  const mergeInbox = (page: ConversationPageDto) => {
    for (const conversation of page.conversations) mergeConversation(conversation);
    nextConversationCursor = page.nextCursor;
  };
  const loadCompleteConversationState = async () => {
    const canonical = new Map<string, ConversationDto>();
    for (const archived of [false, true]) {
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      for (let pageNumber = 0; pageNumber < 1_000; pageNumber += 1) {
        const page = await dependencies.loadConversations({ archived, limit: 30, ...(cursor ? { cursor } : {}) });
        for (const conversation of page.conversations) canonical.set(conversation.id, conversation);
        if (!page.nextCursor) break;
        if (seenCursors.has(page.nextCursor)) throw new Error("Messaging conversation recovery cursor did not advance");
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
        if (pageNumber === 999) throw new Error("Messaging conversation recovery exceeded its page limit");
      }
    }
    conversations.clear();
    for (const conversation of canonical.values()) {
      conversations.set(conversation.id, conversation);
      if (conversation.lastMessage) mergeMessage(conversation.lastMessage);
    }
    nextConversationCursor = null;
  };
  const withBufferedSocketEvents = async <T>(work: () => Promise<T>) => {
    buffering = true;
    try {
      return await work();
    } finally {
      buffering = false;
      drainBufferedEvents();
    }
  };
  const advanceRestCursor = (sequence: string) => {
    if (BigInt(sequence) > BigInt(lastRestConfirmedSequence)) lastRestConfirmedSequence = sequence;
  };
  const serializeWorkspaceOperation = <T>(work: () => Promise<T>): Promise<T> => {
    const previous = workspaceOperation;
    const result = previous ? previous.then(work, work) : work();
    const completion = result.then(() => undefined, () => undefined);
    workspaceOperation = completion;
    void result.then(() => {
      if (workspaceOperation === completion) workspaceOperation = undefined;
    }, () => {
      if (workspaceOperation === completion) workspaceOperation = undefined;
    });
    return result;
  };

  return {
    loadWorkspace() {
      return serializeWorkspaceOperation(async () => {
        ensureSocketSubscriptions();
        await withBufferedSocketEvents(async () => {
          dependencies.socket.connect();
          const [inbox, nextUnread] = await Promise.all([
            dependencies.loadConversations({ archived: false, limit: 30 }),
            dependencies.loadUnreadSummary()
          ]);
          mergeInbox(inbox);
          unread = nextUnread;
          if (!initialSnapshotRecorded) {
            advanceRestCursor(inbox.syncSequence);
            initialSnapshotRecorded = true;
          }
        });
        publish();
        return snapshot();
      });
    },
    async loadConversationPage(input) {
      const page = await dependencies.loadConversations(input);
      for (const conversation of page.conversations) mergeConversation(conversation);
      publish();
      return page;
    },
    async loadOlderMessages(conversationId, beforeSequence) {
      const page = await dependencies.getMessages(conversationId, { beforeSequence, limit: 50 });
      for (const message of page.messages) mergeMessage(message);
      publish();
      return page;
    },
    recoverAfterReconnect(recoveryCursor) {
      return serializeWorkspaceOperation(async () => {
        ensureSocketSubscriptions();
        await withBufferedSocketEvents(async () => {
          const unreadPromise = dependencies.loadUnreadSummary();
          await loadCompleteConversationState();
          unread = await unreadPromise;
          let cursor = greaterSequence(lastRestConfirmedSequence, recoveryCursor);
          let hasMore = true;
          while (hasMore) {
            const page: SyncPageDto = await dependencies.syncMessages({ afterSequence: cursor, limit: 100 });
            for (const message of page.messages) mergeMessage(message);
            unread = page.unread;
            hasMore = page.hasMore;
            if (page.nextSequence) {
              if (BigInt(page.nextSequence) > BigInt(cursor)) cursor = page.nextSequence;
              else if (hasMore) throw new Error("Messaging sync page did not advance its sequence");
              advanceRestCursor(page.nextSequence);
            } else if (hasMore) {
              throw new Error("Messaging sync page was missing its next sequence");
            }
          }
        });
        publish();
        return snapshot();
      });
    },
    async createMessageRequest(input) {
      const result = await dependencies.createMessageRequest(input);
      mergeMessage(result.message);
      mergeConversation(result.conversation);
      publish();
      return result;
    },
    async acceptMessageRequest(conversationId) {
      const conversation = await dependencies.acceptMessageRequest(conversationId);
      mergeConversation(conversation);
      publish();
      return conversation;
    },
    async declineMessageRequest(conversationId) {
      const conversation = await dependencies.declineMessageRequest(conversationId);
      mergeConversation(conversation);
      publish();
      return conversation;
    },
    markMessagesRead: (conversationId, throughSequence) => dependencies.markMessagesRead(conversationId, throughSequence),
    async archiveConversation(conversationId) {
      const result = await dependencies.archiveConversation(conversationId);
      mergeConversation(result.conversation);
      publish();
      return result;
    },
    async restoreConversation(conversationId) {
      const result = await dependencies.restoreConversation(conversationId);
      mergeConversation(result.conversation);
      publish();
      return result;
    },
    async blockConversation(conversationId) {
      const conversation = await dependencies.blockConversation(conversationId);
      mergeConversation(conversation);
      publish();
      return conversation;
    },
    async unblockConversation(conversationId) {
      const conversation = await dependencies.unblockConversation(conversationId);
      mergeConversation(conversation);
      publish();
      return conversation;
    },
    async sendMessage(input) {
      const result = await dependencies.sendMessage(input);
      mergeMessage(result.message);
      mergeConversation(result.conversation);
      publish();
      return result;
    },
    subscribe(listener) {
      workspaceListeners.add(listener);
      listener(snapshot());
      return () => workspaceListeners.delete(listener);
    },
    disconnect() {
      stopSocketSubscriptions();
      dependencies.socket.disconnect();
    }
  };
}

function compareMessages(left: MessageDto, right: MessageDto) {
  const leftSequence = BigInt(left.sequence);
  const rightSequence = BigInt(right.sequence);
  return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : left.id.localeCompare(right.id);
}

function compareConversations(left: ConversationDto, right: ConversationDto) {
  return right.lastMessageAt.localeCompare(left.lastMessageAt) || right.id.localeCompare(left.id);
}

function conversationIsAtLeastAsRecent(incoming: ConversationDto, existing: ConversationDto) {
  const incomingVersion = BigInt(incoming.stateVersion);
  const existingVersion = BigInt(existing.stateVersion);
  if (incomingVersion !== existingVersion) return incomingVersion > existingVersion;
  return false;
}

function sameConversation(left: ConversationDto, right: ConversationDto) {
  return left.status === right.status
    && left.lastMessage?.id === right.lastMessage?.id
    && left.lastMessage?.sequence === right.lastMessage?.sequence
    && left.lastMessageAt === right.lastMessageAt
    && left.unreadCount === right.unreadCount
    && left.archivedAt === right.archivedAt
    && left.isBlocked === right.isBlocked
    && left.canManageBlock === right.canManageBlock
    && left.stateVersion === right.stateVersion;
}

function greaterSequence(left: string, right: string) {
  return BigInt(left) >= BigInt(right) ? left : right;
}

export const defaultMessagingFacade = createMessagingFacade();
