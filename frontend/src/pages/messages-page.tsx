import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useAccountAuth } from "@/context/account-auth-context";
import { useMessaging } from "@/context/messaging-context";
import type { MessagingFacade, MessagingWorkspace } from "@/facades/messaging.facade";
import { useRouter, useSearchParams } from "@/hooks/router";
import type { ConversationDto, MessageDto } from "@/services/api";
import { ConversationList, type ConversationFilter } from "./messages/conversation-list";
import { ConversationPanel } from "./messages/conversation-panel";

type OwnedWorkspace = MessagingWorkspace & { ownerId: string };
type HistoryState = Record<string, { nextSequence: string | null; hasMore: boolean; loaded: boolean }>;
type Confirmation = { kind: "decline" | "manage-block"; conversationId: string; name: string };
type FilterPages = Record<ConversationFilter, { loaded: boolean; nextCursor: string | null; loading: boolean; error: string }>;

const emptyWorkspace: MessagingWorkspace = { conversations: [], messages: [], unread: { unreadMessages: 0, pendingRequests: 0, total: 0 }, nextConversationCursor: null, lastRestConfirmedSequence: "0" };

export default function MessagesPage({ facade: facadeOverride }: { facade?: MessagingFacade }) {
  const { authUser, isAuthLoading } = useAccountAuth();
  const { enabled, unread, connectionState, facade: sharedFacade, workspace: sharedWorkspace, refreshUnread } = useMessaging();
  const facade = facadeOverride ?? sharedFacade;
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedConversationId = validConversationId(searchParams.get("conversation"));
  const [ownedWorkspace, setOwnedWorkspace] = useState<OwnedWorkspace | null>(null);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [isMobile, setIsMobile] = useState(() => globalThis.window?.matchMedia?.("(max-width: 768px)").matches ?? false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [filterPages, setFilterPages] = useState<FilterPages>(() => emptyFilterPages());
  const requestGeneration = useRef(0);
  const historyGeneration = useRef(0);
  const actionGeneration = useRef(0);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileBackRef = useRef<HTMLButtonElement>(null);
  const activeOwnerId = useRef<string | null>(authUser?.id ?? null);
  const seenIncoming = useRef(new Set<string>());
  const highestIncomingSequence = useRef(0n);
  const ownedWorkspaceRef = useRef<OwnedWorkspace | null>(null);
  const readState = useRef(new Map<string, { confirmed: bigint; target: bigint; pending: boolean }>());
  const requestedSelectionSettled = useRef(false);
  const requestedLookupStarted = useRef(false);
  const requestedQueryGeneration = useRef(0);
  const workspace = ownedWorkspace?.ownerId === authUser?.id ? ownedWorkspace : null;
  const conversations = workspace?.conversations ?? emptyWorkspace.conversations;
  const messages = workspace?.messages ?? emptyWorkspace.messages;
  activeOwnerId.current = authUser?.id ?? null;

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 768px)");
    if (!media) return;
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    requestGeneration.current += 1;
    historyGeneration.current += 1;
    actionGeneration.current += 1;
    setOwnedWorkspace(null);
    setHistory({});
    setSelectedId(null);
    setFilter("all");
    setLoadError("");
    setActionError("");
    setAnnouncement("");
    setMobileConversationOpen(false);
    setFilterPages(emptyFilterPages());
    seenIncoming.current.clear();
    highestIncomingSequence.current = 0n;
    ownedWorkspaceRef.current = null;
    readState.current.clear();
    requestedSelectionSettled.current = false;
    requestedLookupStarted.current = false;
    if (isAuthLoading) return;
    if (!authUser || authUser.role === "ADMIN") {
      router.push("/");
      return;
    }
    if (!enabled && !facadeOverride) return;
    if (facade) {
      const generation = requestGeneration.current;
      const stop = facade.subscribe((next) => {
        if (requestGeneration.current !== generation) return;
        applyWorkspace(authUser.id, next);
      });
      void loadWorkspace(authUser.id, facade);
      return stop;
    }
  }, [authUser?.id, authUser?.role, enabled, facade, facadeOverride, isAuthLoading]);

  useEffect(() => {
    if (!authUser || facadeOverride || !sharedWorkspace) return;
    applyWorkspace(authUser.id, sharedWorkspace);
  }, [authUser?.id, facadeOverride, sharedWorkspace]);

  useEffect(() => () => {
    requestGeneration.current += 1;
    historyGeneration.current += 1;
    actionGeneration.current += 1;
  }, []);

  useEffect(() => {
    requestedQueryGeneration.current += 1;
    requestedSelectionSettled.current = false;
    requestedLookupStarted.current = false;
  }, [requestedConversationId]);

  const visibleConversations = useMemo(() => conversations.filter((conversation) => filter === "archived" ? Boolean(conversation.archivedAt) : !conversation.archivedAt && (filter !== "requests" || conversation.status === "PENDING")), [conversations, filter]);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const selectedMessages = useMemo(() => messages.filter((message) => message.conversationId === selectedId).sort(compareMessages), [messages, selectedId]);

  useEffect(() => {
    if (!workspace) return;
    if (requestedConversationId && !requestedSelectionSettled.current) {
      const requested = conversations.find((conversation) => conversation.id === requestedConversationId);
      if (requested) {
        requestedSelectionSettled.current = true;
        setFilter(requested.archivedAt ? "archived" : "all");
        setSelectedId(requested.id);
        return;
      }
      if (!requestedLookupStarted.current && facade) {
        requestedLookupStarted.current = true;
        const generation = requestGeneration.current;
        const queryGeneration = requestedQueryGeneration.current;
        void findConversationAcrossInbox(facade, requestedConversationId)
          .then((found) => {
            if (requestGeneration.current !== generation || requestedQueryGeneration.current !== queryGeneration) return;
            if (found) {
              setFilter(found.archivedAt ? "archived" : "all");
              setSelectedId(found.id);
            } else {
              requestedSelectionSettled.current = true;
              setSelectedId(visibleConversations[0]?.id ?? null);
            }
          })
          .catch(() => {
            if (requestGeneration.current !== generation || requestedQueryGeneration.current !== queryGeneration) return;
            requestedSelectionSettled.current = true;
            setSelectedId(visibleConversations[0]?.id ?? null);
          });
      }
      return;
    }
    if (selectedId && visibleConversations.some((conversation) => conversation.id === selectedId)) return;
    setSelectedId(visibleConversations[0]?.id ?? null);
    setMobileConversationOpen(false);
  }, [conversations, facade, requestedConversationId, selectedId, visibleConversations, workspace]);

  useEffect(() => {
    if (mobileConversationOpen) mobileBackRef.current?.focus();
  }, [mobileConversationOpen, selectedId]);

  useEffect(() => {
    if (!facade || filter === "all" || filterPages[filter].loaded || filterPages[filter].loading || filterPages[filter].error) return;
    void loadConversationPage(filter);
  }, [facade, filter, filterPages]);

  useEffect(() => {
    if (!facade || !selectedConversation || history[selectedConversation.id]?.loaded) return;
    void loadHistory(selectedConversation.id, selectedConversation.lastMessage?.sequence);
  }, [facade, selectedConversation?.id, selectedConversation?.lastMessage?.sequence, history]);

  useEffect(() => {
    if (!facade || !selectedConversation || selectedMessages.length === 0 || !authUser) return;
    if (isMobile && !mobileConversationOpen) return;
    const throughSequence = selectedMessages[selectedMessages.length - 1].sequence;
    const markVisibleRead = () => {
      if (document.visibilityState === "hidden" || (typeof document.hasFocus === "function" && !document.hasFocus())) return;
      void advanceRead(authUser.id, selectedConversation.id, throughSequence, facade);
    };
    markVisibleRead();
    window.addEventListener("focus", markVisibleRead);
    document.addEventListener("visibilitychange", markVisibleRead);
    return () => { window.removeEventListener("focus", markVisibleRead); document.removeEventListener("visibilitychange", markVisibleRead); };
  }, [authUser?.id, facade, isMobile, mobileConversationOpen, selectedConversation?.id, selectedMessages]);

  function applyWorkspace(ownerId: string, next: MessagingWorkspace) {
    const current = ownedWorkspaceRef.current;
    if (current?.ownerId === ownerId) {
      const incoming = next.messages.filter((message) => message.senderUserId !== ownerId && !seenIncoming.current.has(message.id) && BigInt(message.sequence) > highestIncomingSequence.current);
      const newest = incoming.sort(compareMessages).at(-1);
      if (newest) {
        const sender = next.conversations.find((conversation) => conversation.id === newest.conversationId)?.counterpart.displayName ?? "New message";
        setAnnouncement(`${sender}: ${newest.body}`);
      }
    }
    for (const message of next.messages) {
      seenIncoming.current.add(message.id);
      if (message.senderUserId !== ownerId && BigInt(message.sequence) > highestIncomingSequence.current) highestIncomingSequence.current = BigInt(message.sequence);
    }
    const owned = { ...next, ownerId };
    ownedWorkspaceRef.current = owned;
    setOwnedWorkspace(owned);
  }

  async function loadWorkspace(ownerId: string, targetFacade = facade) {
    if (!targetFacade) return;
    const generation = requestGeneration.current;
    setIsLoading(true);
    setLoadError("");
    try {
      const next = await targetFacade.loadWorkspace();
      if (requestGeneration.current === generation) {
        applyWorkspace(ownerId, next);
        setFilterPages((current) => ({ ...current, all: { loaded: true, nextCursor: next.nextConversationCursor, loading: false, error: "" } }));
      }
    } catch (cause) {
      if (requestGeneration.current === generation) setLoadError(errorMessage(cause, "Your conversations could not be loaded."));
    } finally {
      if (requestGeneration.current === generation) setIsLoading(false);
    }
  }

  async function loadConversationPage(targetFilter: ConversationFilter, cursor?: string) {
    if (!facade) return;
    const ownerId = authUser?.id;
    const generation = requestGeneration.current;
    setFilterPages((current) => ({ ...current, [targetFilter]: { ...current[targetFilter], loading: true, error: "" } }));
    try {
      const page = await facade.loadConversationPage({ archived: targetFilter === "archived", status: targetFilter === "requests" ? "PENDING" : undefined, cursor, limit: 30 });
      if (!ownerId || authUser?.id !== ownerId || requestGeneration.current !== generation) return;
      setFilterPages((current) => ({ ...current, [targetFilter]: { loaded: true, nextCursor: page.nextCursor, loading: false, error: "" } }));
    } catch (cause) {
      if (requestGeneration.current === generation) setFilterPages((current) => ({ ...current, [targetFilter]: { ...current[targetFilter], loading: false, error: errorMessage(cause, "More conversations could not be loaded.") } }));
    }
  }

  async function advanceRead(ownerId: string, conversationId: string, throughSequence: string, targetFacade: MessagingFacade) {
    const generation = requestGeneration.current;
    const key = `${ownerId}:${conversationId}`;
    const state = readState.current.get(key) ?? { confirmed: 0n, target: 0n, pending: false };
    state.target = state.target > BigInt(throughSequence) ? state.target : BigInt(throughSequence);
    readState.current.set(key, state);
    if (state.pending || state.confirmed >= state.target) return;
    state.pending = true;
    const requested = state.target;
    setActionError("");
    try {
      const result = await targetFacade.markMessagesRead(conversationId, requested.toString());
      if (requestGeneration.current !== generation || authUser?.id !== ownerId) return;
      const acknowledged = BigInt(result.throughSequence);
      if (acknowledged <= state.confirmed && state.target > acknowledged) {
        state.pending = false;
        setActionError("Messages could not be fully marked as read. Focus the conversation to retry.");
        return;
      }
      state.confirmed = acknowledged;
      state.pending = false;
      void refreshUnread();
      if (state.target > state.confirmed) void advanceRead(ownerId, conversationId, state.target.toString(), targetFacade);
    } catch (cause) {
      if (requestGeneration.current !== generation || authUser?.id !== ownerId) return;
      state.pending = false;
      setActionError(errorMessage(cause, "Messages could not be marked as read. Focus the conversation to retry."));
    }
  }

  async function loadHistory(conversationId: string, beforeSequence?: string) {
    if (!facade) return;
    const generation = ++historyGeneration.current;
    setIsLoadingOlder(Boolean(beforeSequence));
    try {
      const page = await facade.loadOlderMessages(conversationId, beforeSequence);
      if (historyGeneration.current !== generation) return;
      setHistory((current) => ({ ...current, [conversationId]: { nextSequence: page.nextSequence, hasMore: page.hasMore, loaded: true } }));
    } catch (cause) {
      if (historyGeneration.current === generation) setActionError(errorMessage(cause, "Earlier messages could not be loaded."));
    } finally {
      if (historyGeneration.current === generation) setIsLoadingOlder(false);
    }
  }

  async function applyConversationAction(action: () => Promise<ConversationDto | { conversation: ConversationDto }>): Promise<boolean> {
    const generation = ++actionGeneration.current;
    const ownerId = authUser?.id;
    setActionError("");
    try {
      await action();
      if (actionGeneration.current !== generation || !ownerId || activeOwnerId.current !== ownerId) return false;
      void refreshUnread();
      return true;
    } catch (cause) {
      if (actionGeneration.current === generation && ownerId && activeOwnerId.current === ownerId) setActionError(errorMessage(cause, "The conversation could not be updated."));
      return false;
    }
  }

  async function acceptSelectedConversation() {
    if (!facade || !selectedConversation) return;
    if (await applyConversationAction(() => facade.acceptMessageRequest(selectedConversation.id))) setFilter("all");
  }

  async function restoreSelectedConversation() {
    if (!facade || !selectedConversation) return;
    if (await applyConversationAction(() => facade.restoreConversation(selectedConversation.id))) setFilter("all");
  }

  function openConfirmation(kind: Confirmation["kind"], trigger: HTMLButtonElement) {
    if (!selectedConversation) return;
    confirmTriggerRef.current = trigger;
    setConfirmation({ kind, conversationId: selectedConversation.id, name: selectedConversation.counterpart.displayName });
  }

  function closeConfirmation() { flushSync(() => setConfirmation(null)); confirmTriggerRef.current?.focus(); }
  async function confirmAction(blockAction?: "block" | "unblock") {
    if (!confirmation || !facade) return;
    const current = confirmation;
    closeConfirmation();
    await applyConversationAction(() => current.kind === "decline"
      ? facade.declineMessageRequest(current.conversationId)
      : blockAction === "unblock"
        ? facade.unblockConversation(current.conversationId)
        : facade.blockConversation(current.conversationId));
  }

  if (isAuthLoading) return <main className="editorial-page messages-page"><p className="messages-page__loading">Loading messages…</p></main>;
  if (!authUser || authUser.role === "ADMIN") return <main className="editorial-page messages-page"><p className="messages-page__loading">Opening your account…</p></main>;
  if (!enabled && !facadeOverride) return <main aria-labelledby="messages-title" className="editorial-page messages-page"><h1 id="messages-title" className="editorial-display">Messages</h1><div className="messages-page__empty"><h2>Messages are unavailable</h2><p>This feature is not enabled for this account yet.</p></div></main>;

  return (
    <main aria-labelledby="messages-title" className="editorial-page messages-page">
      <header className="messages-page__masthead"><div><p className="editorial-kicker">Service conversations</p><h1 id="messages-title" className="editorial-display">Messages</h1></div><p>Review requests, keep details together, and respond when the conversation is open.</p></header>
      {loadError ? <div className="messages-page__alert" role="alert"><span>{loadError}</span><button type="button" className="editorial-button editorial-button--secondary" onClick={() => void loadWorkspace(authUser.id)}>Try again</button></div> : null}
      {actionError ? <div className="messages-page__alert" role="alert">{actionError}</div> : null}
      {isLoading ? <p className="messages-page__loading" aria-live="polite">Loading messages…</p> : null}
      {workspace ? (
        <div className={`messages-workspace${mobileConversationOpen ? " messages-workspace--conversation-open" : ""}`} aria-busy={isLoading}>
          <ConversationList conversations={visibleConversations} selectedId={selectedId} filter={filter} pendingCount={unread.pendingRequests} role={authUser.role} onFilter={setFilter} onSelect={(id, trigger) => { mobileTriggerRef.current = trigger; setSelectedId(id); setMobileConversationOpen(true); }} />
          <ConversationPanel key={`${authUser.id}:${selectedConversation?.id ?? "none"}`} backRef={mobileBackRef} conversation={selectedConversation} messages={selectedMessages} authUser={authUser} connectionState={connectionState} canLoadOlder={Boolean(selectedConversation && history[selectedConversation.id]?.hasMore)} isLoadingOlder={isLoadingOlder} onBack={() => { flushSync(() => setMobileConversationOpen(false)); mobileTriggerRef.current?.focus(); }} onLoadOlder={() => { if (selectedConversation) void loadHistory(selectedConversation.id, history[selectedConversation.id]?.nextSequence ?? undefined); }} onAccept={() => void acceptSelectedConversation()} onDecline={(trigger) => openConfirmation("decline", trigger)} onArchive={() => { if (facade && selectedConversation) void applyConversationAction(() => facade.archiveConversation(selectedConversation.id)); }} onRestore={() => void restoreSelectedConversation()} onManageBlock={(trigger) => openConfirmation("manage-block", trigger)} onSend={async (input) => { if (!facade || !selectedConversation || !authUser) return; const ownerId = authUser.id; const conversationId = selectedConversation.id; const generation = requestGeneration.current; await facade.sendMessage({ ...input, conversationId }); if (requestGeneration.current === generation && authUser.id === ownerId) void refreshUnread(); }} />
        </div>
      ) : null}
      {filterPages[filter].error ? <div className="messages-page__alert" role="alert"><span>{filterPages[filter].error}</span><button type="button" className="editorial-button editorial-button--secondary" onClick={() => void loadConversationPage(filter)}>Retry {filter === "archived" ? "archived" : filter === "requests" ? "request" : "inbox"} conversations</button></div> : null}
      {filterPages[filter].nextCursor ? <button type="button" className="editorial-button editorial-button--secondary" disabled={filterPages[filter].loading} onClick={() => void loadConversationPage(filter, filterPages[filter].nextCursor ?? undefined)}>{filterPages[filter].loading ? "Loading more conversations…" : "Load more conversations"}</button> : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {confirmation ? <ConfirmDialog confirmation={confirmation} confirmRef={confirmButtonRef} onClose={closeConfirmation} onConfirm={(action) => void confirmAction(action)} /> : null}
    </main>
  );
}

function ConfirmDialog({ confirmation, confirmRef, onClose, onConfirm }: { confirmation: Confirmation; confirmRef: RefObject<HTMLButtonElement | null>; onClose: () => void; onConfirm: (action?: "block" | "unblock") => void }) {
  useEffect(() => { confirmRef.current?.focus(); }, [confirmRef]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("section button:not(:disabled)"));
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  const decline = confirmation.kind === "decline";
  return <div className="messages-dialog__overlay" onKeyDown={onKeyDown}><div className="messages-dialog__backdrop" aria-hidden="true" onClick={onClose} /><section className="messages-dialog editorial-dialog" role="dialog" aria-modal="true" aria-labelledby="messages-confirm-title"><p className="editorial-kicker">Conversation control</p><h2 id="messages-confirm-title">{decline ? "Decline this request?" : "Manage message restriction"}</h2><p>{decline ? "The customer will not be able to continue this conversation during the cooldown." : `Choose whether your account blocks messages with ${confirmation.name}. The current restriction remains private.`}</p><div className="messages-dialog__actions"><button type="button" onClick={onClose}>Keep conversation</button>{decline ? <button ref={confirmRef} type="button" className="editorial-button editorial-button--danger" onClick={() => onConfirm()}>Decline request</button> : <><button ref={confirmRef} type="button" className="editorial-button editorial-button--danger" onClick={() => onConfirm("block")}>Block messages</button><button type="button" className="editorial-button editorial-button--secondary" onClick={() => onConfirm("unblock")}>Remove my block</button></>}</div></section></div>;
}

function compareMessages(left: MessageDto, right: MessageDto) { const leftSequence = BigInt(left.sequence); const rightSequence = BigInt(right.sequence); return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : left.id.localeCompare(right.id); }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
function emptyFilterPages(): FilterPages { return { all: { loaded: false, nextCursor: null, loading: false, error: "" }, requests: { loaded: false, nextCursor: null, loading: false, error: "" }, archived: { loaded: false, nextCursor: null, loading: false, error: "" } }; }
function validConversationId(value: string | null) { return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }

async function findConversationAcrossInbox(facade: MessagingFacade, conversationId: string) {
  for (const archived of [false, true]) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let pageNumber = 0; pageNumber < 1_000; pageNumber += 1) {
      const page = await facade.loadConversationPage({ archived, limit: 30, ...(cursor ? { cursor } : {}) });
      const found = page.conversations.find((conversation) => conversation.id === conversationId);
      if (found) return found;
      if (!page.nextCursor) break;
      if (seen.has(page.nextCursor)) throw new Error("Messaging conversation lookup cursor did not advance");
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
      if (pageNumber === 999) throw new Error("Messaging conversation lookup exceeded its page limit");
    }
  }
  return null;
}
