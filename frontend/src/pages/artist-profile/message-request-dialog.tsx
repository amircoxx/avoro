import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";
import { useRouter } from "@/hooks/router";
import { useAccountAuth } from "@/context/account-auth-context";
import { useMessaging } from "@/context/messaging-context";
import { ApiClientError } from "@/services/api";
import { EditorialButton } from "@/components/ui/editorial-ui";
import type { MessagingFacade } from "@/facades/messaging.facade";

const requestLimit = 2_000;

type Submission = {
  generation: number;
  customerId: string;
  facade: MessagingFacade;
  techProfileId: string;
};

export function MessageRequestDialog({
  open,
  techProfileId,
  techName,
  trigger,
  onClose
}: {
  open: boolean;
  techProfileId: string;
  techName: string;
  trigger: HTMLButtonElement | null | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const { authUser, openAccountAuth } = useAccountAuth();
  const { facade, refreshUnread } = useMessaging();
  const [draft, setDraft] = useState("");
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetRequestIdOnDraftChange, setResetRequestIdOnDraftChange] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const submissionGeneration = useRef(0);
  const mountedRef = useRef(true);
  const currentIdentity = useRef({ open, customerId: authUser?.id ?? null, facade, techProfileId });
  currentIdentity.current = { open, customerId: authUser?.id ?? null, facade, techProfileId };
  const codePointCount = Array.from(draft).length;
  const isValidDraft = draft.trim().length > 0 && codePointCount <= requestLimit;
  const isCustomer = authUser?.role === "CUSTOMER";

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submissionGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    submissionGeneration.current += 1;
    setIsSubmitting(false);
    setClientRequestId(null);
    setResetRequestIdOnDraftChange(false);
  }, [authUser?.id, techProfileId]);

  useEffect(() => {
    submissionGeneration.current += 1;
    setIsSubmitting(false);
  }, [facade]);

  useEffect(() => {
    if (open) return;
    submissionGeneration.current += 1;
    setIsSubmitting(false);
  }, [open]);

  function closeDialog() {
    // Closing remains available during submission; a late completion is intentionally inert.
    submissionGeneration.current += 1;
    setIsSubmitting(false);
    onClose();
    trigger?.focus();
  }

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft);
    setError("");
    if (resetRequestIdOnDraftChange) {
      setClientRequestId(null);
      setResetRequestIdOnDraftChange(false);
    }
  }

  async function submitRequest() {
    if (!authUser) {
      openAccountAuth("login");
      return;
    }
    if (authUser.role !== "CUSTOMER" || !isValidDraft || !facade) return;

    const requestId = clientRequestId ?? crypto.randomUUID();
    const submission: Submission = {
      generation: ++submissionGeneration.current,
      customerId: authUser.id,
      facade,
      techProfileId
    };
    setClientRequestId(requestId);
    setIsSubmitting(true);
    setError("");
    try {
      const result = await facade.createMessageRequest({ techProfileId, body: draft, clientRequestId: requestId });
      if (!isCurrentSubmission(submission, currentIdentity, mountedRef, submissionGeneration)) return;
      setClientRequestId(null);
      void refreshUnread();
      router.push(`/messages?conversation=${encodeURIComponent(result.conversation.id)}`);
    } catch (cause) {
      if (!isCurrentSubmission(submission, currentIdentity, mountedRef, submissionGeneration)) return;
      const next = requestErrorMessage(cause);
      setError(next.message);
      setResetRequestIdOnDraftChange(next.resetRequestIdOnDraftChange);
    } finally {
      if (isCurrentSubmission(submission, currentIdentity, mountedRef, submissionGeneration)) setIsSubmitting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled)"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;

  const unavailableRole = authUser && !isCustomer;
  const sendLabel = !authUser ? "Log in to send" : isSubmitting ? "Sending request…" : "Send request";

  return (
    <div className="message-request-dialog__overlay" onKeyDown={onKeyDown}>
      <div className="message-request-dialog__backdrop" aria-hidden="true" onMouseDown={closeDialog} />
      <section className="message-request-dialog editorial-dialog" role="dialog" aria-modal="true" aria-labelledby="message-request-title" aria-describedby="message-request-description">
        <header className="message-request-dialog__header">
          <div>
            <p className="editorial-kicker">Start a conversation</p>
            <h2 id="message-request-title">Message {techName}</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close message request" className="message-request-dialog__close" onClick={closeDialog}>
            <X aria-hidden="true" />
          </button>
        </header>
        {unavailableRole ? (
          <p id="message-request-description" className="message-request-dialog__copy">Only customer accounts can send a message request. You cannot message your own tech profile from this account.</p>
        ) : (
          <>
            <p id="message-request-description" className="message-request-dialog__copy">Send one introduction. {techName} can accept before the conversation opens.</p>
            <label className="message-request-dialog__label" htmlFor="message-request-body">Your introduction</label>
            <textarea
              id="message-request-body"
              value={draft}
              onInput={(event) => updateDraft(event.currentTarget.value)}
              placeholder="Share what you are looking for."
              disabled={isSubmitting}
            />
            <div className="message-request-dialog__footer">
              <span className={codePointCount > requestLimit ? "message-request-dialog__count message-request-dialog__count--over" : "message-request-dialog__count"}>{codePointCount} / {requestLimit}</span>
              <span>Plain text only</span>
            </div>
            {error ? <p className="message-request-dialog__error" role="alert">{error}</p> : null}
            <div className="message-request-dialog__actions">
              <button type="button" onClick={closeDialog}>Cancel</button>
              <EditorialButton type="button" disabled={Boolean(authUser && (!isValidDraft || isSubmitting || !facade))} onClick={() => void submitRequest()}>{error && clientRequestId ? "Try again" : sendLabel}</EditorialButton>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function requestErrorMessage(cause: unknown) {
  if (!(cause instanceof ApiClientError)) return { message: "Your message request could not be sent. Try again.", resetRequestIdOnDraftChange: false };
  switch (cause.code) {
    case "request_pending":
      return { message: "Your message request is still waiting for a response.", resetRequestIdOnDraftChange: false };
    case "request_cooldown":
      return { message: cooldownMessage(cause.details?.nextAllowedAt), resetRequestIdOnDraftChange: false };
    case "messaging_blocked":
      return { message: "Messaging is unavailable for this profile.", resetRequestIdOnDraftChange: false };
    case "forbidden":
      return { message: "You cannot send a message request to your own profile.", resetRequestIdOnDraftChange: false };
    case "not_found":
      return { message: "This profile is not available for messaging.", resetRequestIdOnDraftChange: false };
    case "validation_error":
    case "message_too_long":
    case "bad_request":
      return { message: cause.message, resetRequestIdOnDraftChange: true };
    default:
      return { message: cause.message || "Your message request could not be sent. Try again.", resetRequestIdOnDraftChange: false };
  }
}

function isCurrentSubmission(
  submission: Submission,
  currentIdentity: MutableRefObject<{ open: boolean; customerId: string | null; facade: MessagingFacade | null; techProfileId: string }>,
  mountedRef: MutableRefObject<boolean>,
  submissionGeneration: MutableRefObject<number>
) {
  const current = currentIdentity.current;
  return mountedRef.current
    && current.open
    && submissionGeneration.current === submission.generation
    && current.customerId === submission.customerId
    && current.facade === submission.facade
    && current.techProfileId === submission.techProfileId;
}

function cooldownMessage(value: string | number | undefined) {
  if (typeof value !== "string") return "You can send another message request after the cooldown ends.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "You can send another message request after the cooldown ends.";
  return `You can send another message request on ${new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date)}.`;
}
