import type { MessagingConnectionState } from "@/context/messaging-context";
import type { MouseEvent, RefObject } from "react";
import type { AuthUser, ConversationDto, MessageDto } from "@/services/api";
import { MessageComposer } from "./message-composer";

export function ConversationPanel({ conversation, messages, authUser, connectionState, backRef, canLoadOlder, isLoadingOlder, onBack, onLoadOlder, onAccept, onDecline, onArchive, onRestore, onManageBlock, onSend }: {
  conversation: ConversationDto | null;
  messages: MessageDto[];
  authUser: Pick<AuthUser, "id" | "role">;
  connectionState: MessagingConnectionState;
  backRef: RefObject<HTMLButtonElement | null>;
  canLoadOlder: boolean;
  isLoadingOlder: boolean;
  onBack: () => void;
  onLoadOlder: () => void;
  onAccept: () => void;
  onDecline: (trigger: HTMLButtonElement) => void;
  onArchive: () => void;
  onRestore: () => void;
  onManageBlock: (trigger: HTMLButtonElement) => void;
  onSend: (input: { body: string; clientRequestId: string }) => Promise<unknown>;
}) {
  if (!conversation) return <section className="messages-pane messages-pane--detail messages-conversation--empty"><p className="editorial-kicker">Conversation</p><h2>Select a conversation</h2><p>Choose a person from the inbox to review the request and message history.</p></section>;
  const isPendingTechRequest = authUser.role === "TECH" && conversation.status === "PENDING" && !conversation.isBlocked;
  const composerReason = conversation.isBlocked ? "Messaging is unavailable for this conversation." : conversation.status === "PENDING" ? "This request must be accepted before you can reply." : conversation.status === "DECLINED" ? "This request was declined. Messaging is unavailable." : undefined;
  return (
    <section className="messages-pane messages-pane--detail" aria-labelledby="conversation-title">
      <header className="messages-conversation__header">
        <button ref={backRef} type="button" className="messages-conversation__back" aria-label="Back to conversations" onClick={onBack}>← Back to conversations</button>
        <div className="messages-conversation__identity"><span className="messages-conversation__eyebrow">Conversation with</span><h2 id="conversation-title">{conversation.counterpart.displayName}</h2><ConnectionLabel state={connectionState} /></div>
        <div className="messages-conversation__utilities">
          {conversation.archivedAt ? <button type="button" onClick={onRestore}>Restore conversation</button> : <button type="button" onClick={onArchive}>Archive conversation</button>}
          {conversation.canManageBlock ? <button type="button" onClick={(event: MouseEvent<HTMLButtonElement>) => onManageBlock(event.currentTarget)}>Manage message restriction</button> : null}
        </div>
      </header>
      <div className={`message-request-band message-request-band--${conversation.status.toLowerCase()}`}>
        <div><span>{conversation.status === "ACCEPTED" ? "Conversation open" : conversation.status === "DECLINED" ? "Request declined" : "Request pending"}</span><p>{requestDescription(conversation, authUser.role)}</p></div>
        {isPendingTechRequest ? <div className="message-request-band__actions"><button type="button" className="editorial-button editorial-button--primary" onClick={onAccept}>Accept request</button><button type="button" className="editorial-button editorial-button--secondary" onClick={(event: MouseEvent<HTMLButtonElement>) => onDecline(event.currentTarget)}>Decline request</button></div> : null}
      </div>
      <div className="messages-history" aria-label={`Messages with ${conversation.counterpart.displayName}`}>
        {canLoadOlder ? <button type="button" className="messages-history__older" disabled={isLoadingOlder} onClick={onLoadOlder}>{isLoadingOlder ? "Loading earlier messages…" : "Load earlier messages"}</button> : null}
        {messages.length === 0 ? <div className="messages-history__empty"><p>No messages yet.</p></div> : messages.map((message, index) => <MessageWithDay key={message.id} message={message} previous={messages[index - 1]} own={message.senderUserId === authUser.id} />)}
      </div>
      <MessageComposer connectionState={connectionState} disabledReason={composerReason} onSend={onSend} />
    </section>
  );
}

function MessageWithDay({ message, previous, own }: { message: MessageDto; previous?: MessageDto; own: boolean }) {
  const day = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date(message.createdAt));
  const previousDay = previous ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date(previous.createdAt)) : null;
  return <>{day !== previousDay ? <div className="messages-history__day" role="separator" aria-label={day}><span aria-hidden="true">{day}</span></div> : null}<MessageBubble message={message} own={own} /></>;
}

function MessageBubble({ message, own }: { message: MessageDto; own: boolean }) {
  return <article className={own ? "messages-bubble messages-bubble--own" : "messages-bubble"} data-message-id={message.id}><p>{message.body}</p><time dateTime={message.createdAt}>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</time></article>;
}
function ConnectionLabel({ state }: { state: MessagingConnectionState }) { const copy = state === "connected" ? "Connected" : state === "reconnecting" ? "Reconnecting" : state === "session-invalid" ? "Session expired" : "Disconnected"; return <span className={`messages-connection messages-connection--${state}`}>{copy}</span>; }
function requestDescription(conversation: ConversationDto, role: AuthUser["role"]) { if (conversation.status === "ACCEPTED") return "Both participants can reply in this private service conversation."; if (conversation.status === "DECLINED") return "Replies are unavailable unless a new request is allowed after the cooldown."; return role === "TECH" ? "Review the introduction before opening this conversation." : "The technician needs to accept your introduction before either of you can reply."; }
