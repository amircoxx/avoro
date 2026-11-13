import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { MessagingConnectionState } from "@/context/messaging-context";

const maximumCodePoints = 2_000;

export type MessageComposerProps = {
  connectionState: MessagingConnectionState;
  disabledReason?: string;
  onSend: (input: { body: string; clientRequestId: string }) => Promise<unknown>;
};

type Attempt = { body: string; clientRequestId: string };
type SendState = "idle" | "sending" | "uncertain" | "failed";

export function MessageComposer({ connectionState, disabledReason, onSend }: MessageComposerProps) {
  const [draft, setDraft] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const attemptGeneration = useRef(0);
  const draftRef = useRef(draft);
  const codePoints = Array.from(draft).length;
  const normalized = draft.trim();
  const isConnected = connectionState === "connected";
  const canSend = !disabledReason && isConnected && normalized.length > 0 && codePoints <= maximumCodePoints && sendState !== "sending" && sendState !== "uncertain";

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; attemptGeneration.current += 1; };
  }, []);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    const nextAttempt = attempt?.body === normalized ? attempt : { body: normalized, clientRequestId: crypto.randomUUID() };
    const generation = ++attemptGeneration.current;
    setAttempt(nextAttempt);
    setSendState("sending");
    setError("");
    const uncertainTimer = globalThis.setTimeout(() => {
      if (mounted.current && attemptGeneration.current === generation) setSendState("uncertain");
    }, 5_000);
    try {
      await onSend(nextAttempt);
      if (!mounted.current || attemptGeneration.current !== generation) return;
      if (draftRef.current.trim() === nextAttempt.body) {
        draftRef.current = "";
        setDraft("");
      }
      setAttempt(null);
      setSendState("idle");
    } catch (cause) {
      if (!mounted.current || attemptGeneration.current !== generation) return;
      setSendState("failed");
      setError(cause instanceof Error && cause.message ? cause.message : "Message could not be sent. Try again.");
    } finally {
      globalThis.clearTimeout(uncertainTimer);
    }
  }

  function onDraftChange(value: string) {
    draftRef.current = value;
    setDraft(value);
    setError("");
    if (attempt && value.trim() !== attempt.body && sendState === "failed") {
      setAttempt(null);
      setSendState("idle");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  const unavailable = disabledReason ?? (connectionState === "reconnecting" ? "Reconnecting… Your draft is saved." : connectionState === "session-invalid" ? "Sign in again to send this message." : connectionState === "disconnected" ? "Connect to send this message. Your draft is saved." : "");

  return (
    <form className="messages-composer" onSubmit={(event) => void submit(event)}>
      <label htmlFor="message-draft" className="sr-only">Message</label>
      <textarea
        id="message-draft"
        value={draft}
        rows={3}
        disabled={Boolean(disabledReason)}
        aria-describedby="message-composer-status message-character-count"
        aria-invalid={codePoints > maximumCodePoints || Boolean(error)}
        placeholder="Write a message"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="messages-composer__footer">
        <div id="message-composer-status" className="messages-composer__status">
          {error ? <p role="alert">{error}</p> : unavailable ? <p>{unavailable}</p> : sendState === "sending" ? <p aria-live="polite">Sending message…</p> : sendState === "uncertain" ? <p role="alert">Taking longer than expected. Keep this page open while we confirm.</p> : <p>Enter to send · Shift+Enter for a new line</p>}
        </div>
        <span id="message-character-count" className={codePoints > maximumCodePoints ? "messages-composer__count messages-composer__count--over" : "messages-composer__count"}>{codePoints.toLocaleString()} / 2,000</span>
        <button type="submit" className="editorial-button editorial-button--primary" disabled={!canSend}>{sendState === "failed" ? "Retry message" : "Send message"}</button>
      </div>
    </form>
  );
}
