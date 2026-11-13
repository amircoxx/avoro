/** Browser requests for the server-owned customer/tech messaging contract. */
import { apiUrl, readApiResponse } from "./client";
import type {
  ConversationDto,
  ConversationListInput,
  ConversationPageDto,
  CreateMessageRequestInput,
  CreateMessageRequestResult,
  MessagePageDto,
  MessagePageInput,
  MessagingStatus,
  SyncMessagesInput,
  SyncPageDto,
  UnreadSummaryDto
} from "./messaging-types";

const jsonRequest = (method: "POST", body: unknown): RequestInit => ({
  method,
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const authenticatedGet = (): RequestInit => ({ credentials: "include" });

export async function getMessagingStatus(): Promise<MessagingStatus> {
  const response = await fetch(apiUrl("/api/messaging/status"));
  return readApiResponse<MessagingStatus>(response, "Messaging status could not be loaded");
}

export async function createMessageRequest(input: CreateMessageRequestInput): Promise<CreateMessageRequestResult> {
  const response = await fetch(apiUrl("/api/messaging/requests"), jsonRequest("POST", input));
  return readApiResponse<CreateMessageRequestResult>(response, "Message request could not be sent");
}

export async function listConversations(input: ConversationListInput = {}): Promise<ConversationPageDto> {
  const response = await fetch(apiUrl(`/api/messaging/conversations${queryString({
    archived: input.archived === undefined ? undefined : String(input.archived),
    status: input.status,
    cursor: input.cursor,
    limit: input.limit?.toString()
  })}`), authenticatedGet());
  return readApiResponse<ConversationPageDto>(response, "Conversations could not be loaded");
}

export async function getUnreadSummary(): Promise<UnreadSummaryDto> {
  const response = await fetch(apiUrl("/api/messaging/unread-summary"), authenticatedGet());
  return readApiResponse<UnreadSummaryDto>(response, "Unread summary could not be loaded");
}

export async function syncMessages(input: SyncMessagesInput): Promise<SyncPageDto> {
  const response = await fetch(apiUrl(`/api/messaging/sync${queryString({
    afterSequence: input.afterSequence,
    limit: input.limit?.toString()
  })}`), authenticatedGet());
  return readApiResponse<SyncPageDto>(response, "Messages could not be synchronized");
}

export async function getMessages(conversationId: string, input: MessagePageInput = {}): Promise<MessagePageDto> {
  const response = await fetch(apiUrl(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/messages${queryString({
    beforeSequence: input.beforeSequence,
    afterSequence: input.afterSequence,
    limit: input.limit?.toString()
  })}`), authenticatedGet());
  return readApiResponse<MessagePageDto>(response, "Messages could not be loaded");
}

export async function acceptMessageRequest(conversationId: string): Promise<ConversationDto> {
  return updateConversation(conversationId, "accept", "Message request could not be accepted");
}

export async function declineMessageRequest(conversationId: string): Promise<ConversationDto> {
  return updateConversation(conversationId, "decline", "Message request could not be declined");
}

export async function markMessagesRead(conversationId: string, throughSequence: string): Promise<{ throughSequence: string }> {
  const response = await fetch(apiUrl(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/read`), jsonRequest("POST", { throughSequence }));
  return readApiResponse<{ throughSequence: string }>(response, "Messages could not be marked read");
}

export async function archiveConversation(conversationId: string): Promise<{ conversation: ConversationDto; archived: boolean }> {
  const response = await fetch(apiUrl(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/archive`), jsonRequest("POST", {}));
  return readApiResponse<{ conversation: ConversationDto; archived: boolean }>(response, "Conversation could not be archived");
}

export async function restoreConversation(conversationId: string): Promise<{ conversation: ConversationDto; archived: boolean }> {
  const response = await fetch(apiUrl(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/archive`), { method: "DELETE", credentials: "include" });
  return readApiResponse<{ conversation: ConversationDto; archived: boolean }>(response, "Conversation could not be restored");
}

export async function blockConversation(conversationId: string): Promise<ConversationDto> {
  const response = await fetch(apiUrl("/api/messaging/blocks"), jsonRequest("POST", { conversationId }));
  const data = await readApiResponse<{ conversation: ConversationDto }>(response, "Conversation could not be blocked");
  return data.conversation;
}

export async function unblockConversation(conversationId: string): Promise<ConversationDto> {
  const response = await fetch(apiUrl(`/api/messaging/blocks/${encodeURIComponent(conversationId)}`), { method: "DELETE", credentials: "include" });
  const data = await readApiResponse<{ conversation: ConversationDto }>(response, "Conversation could not be unblocked");
  return data.conversation;
}

async function updateConversation(conversationId: string, action: "accept" | "decline", fallback: string): Promise<ConversationDto> {
  const response = await fetch(apiUrl(`/api/messaging/conversations/${encodeURIComponent(conversationId)}/${action}`), jsonRequest("POST", {}));
  const data = await readApiResponse<{ conversation: ConversationDto }>(response, fallback);
  return data.conversation;
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}
