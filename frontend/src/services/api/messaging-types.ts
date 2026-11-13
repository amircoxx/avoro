/** Browser-safe messaging DTOs. Sequence values remain decimal strings to avoid number precision loss. */
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

export type MessagingStatus = { enabled: boolean };
export type CreateMessageRequestInput = { techProfileId: string; body: string; clientRequestId: string };
export type CreateMessageRequestResult = { conversation: ConversationDto; message: MessageDto };
export type SendMessageInput = { conversationId: string; body: string; clientRequestId: string };
export type SendMessageResult = { message: MessageDto; conversation: ConversationDto };
export type ConversationListInput = {
  status?: ConversationDto["status"];
  archived?: boolean;
  cursor?: string;
  limit?: number;
};
export type MessagePageInput = { beforeSequence?: string; afterSequence?: string; limit?: number };
export type SyncMessagesInput = { afterSequence: string; limit?: number };
