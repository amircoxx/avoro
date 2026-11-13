/** Declares the stable, body-safe messaging service contract. */
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
  canManageBlock: boolean;
  stateVersion: string;
};

export type UnreadSummaryDto = { unreadMessages: number; pendingRequests: number; total: number };
export type ConversationPageDto = { conversations: ConversationDto[]; nextCursor: string | null; syncSequence: string };
export type MessagePageDto = { messages: MessageDto[]; nextSequence: string | null; hasMore: boolean };
export type SyncPageDto = MessagePageDto & { unread: UnreadSummaryDto };
