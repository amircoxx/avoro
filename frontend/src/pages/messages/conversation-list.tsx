import type { ConversationDto } from "@/services/api";

export type ConversationFilter = "all" | "requests" | "archived";

export function ConversationList({ conversations, selectedId, filter, pendingCount, role, onFilter, onSelect }: {
  conversations: ConversationDto[];
  selectedId: string | null;
  filter: ConversationFilter;
  pendingCount: number;
  role: "CUSTOMER" | "TECH";
  onFilter: (filter: ConversationFilter) => void;
  onSelect: (conversationId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <aside className="messages-pane messages-pane--list" aria-labelledby="conversation-inbox-title">
      <div className="messages-list__heading">
        <div><p className="editorial-kicker">Private messages</p><h2 id="conversation-inbox-title">Conversation inbox</h2></div>
        <span>{conversations.length}</span>
      </div>
      <div className="messages-list__filters" aria-label="Conversation filters">
        <button type="button" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>Inbox</button>
        {role === "TECH" ? <button type="button" aria-label={`Requests, ${pendingCount} pending`} aria-pressed={filter === "requests"} onClick={() => onFilter("requests")}>Requests <span>{pendingCount}</span></button> : null}
        <button type="button" aria-pressed={filter === "archived"} onClick={() => onFilter("archived")}>Archived</button>
      </div>
      {conversations.length === 0 ? <div className="messages-list__empty"><h3>No conversations here</h3><p>{filter === "requests" ? "New customer requests will appear here." : filter === "archived" ? "Archived conversations will appear here." : "Start from a technician profile to begin a conversation."}</p></div> : (
        <ul className="messages-list" aria-label="Conversations">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button type="button" className="messages-list__row" aria-label={`Open conversation with ${conversation.counterpart.displayName}`} aria-current={selectedId === conversation.id ? "true" : undefined} onClick={(event) => onSelect(conversation.id, event.currentTarget)}>
                <span className="messages-list__avatar" aria-hidden="true">{initials(conversation.counterpart.displayName)}</span>
                <span className="messages-list__copy">
                  <span className="messages-list__meta"><strong>{conversation.counterpart.displayName}</strong><time dateTime={conversation.lastMessageAt}>{shortDate(conversation.lastMessageAt)}</time></span>
                  <span className="messages-list__preview">{conversation.lastMessage?.body ?? "No messages yet"}</span>
                  <span className="messages-list__state">{statusLabel(conversation)}</span>
                </span>
                {conversation.unreadCount > 0 ? <span className="messages-list__unread"><span aria-hidden="true" />{conversation.unreadCount} unread</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function statusLabel(conversation: ConversationDto) {
  if (conversation.isBlocked) return "Blocked";
  if (conversation.status === "PENDING") return "Request pending";
  if (conversation.status === "DECLINED") return "Request declined";
  return conversation.archivedAt ? "Archived" : "Accepted";
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function shortDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
