import { X } from "lucide-react";
import { useEffect, useRef, type JSX, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import authVisual from "@/assets/landing/edit-artist.jpg";

export type AuthSplitAlternateAction = {
  label: string;
  onClick: () => void;
};

/** Shared screenshot-faithful frame for every create-account and login overlay. */
export function AuthSplitShell({
  titleId,
  onClose,
  alternateAction,
  initialFocusRef,
  children
}: {
  titleId: string;
  onClose: () => void;
  alternateAction?: AuthSplitAlternateAction;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const mountedInitialFocusRef = useRef(initialFocusRef);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    (mountedInitialFocusRef.current?.current ?? dialogRef.current)?.focus();

    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeIsDialog = active === dialogRef.current;
    if (event.shiftKey && (active === first || activeIsDialog || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || activeIsDialog || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="muse-auth-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <button type="button" className="muse-auth-overlay__backdrop" aria-label="Close auth dialog" onClick={onClose} />
      <div ref={dialogRef} className="muse-auth editorial-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={handleDialogKeyDown}>
        <section className="muse-auth__visual" aria-label="avoro beauty artist at work">
          <img src={authVisual} alt="Beauty artist carefully finishing a manicure" />
          <div className="muse-auth__visual-shade" aria-hidden="true" />
          <div className="muse-auth__brand muse-auth__brand--light">
            <strong>avoro</strong>
          </div>
          <div className="muse-auth__visual-copy">
            <p>Beauty, booked beautifully.</p>
            <h2>Find your next<br />favorite tech.</h2>
            <span>Discover independent artists and book with confidence.</span>
          </div>
        </section>

        <section className="muse-auth__panel">
          <div className="muse-auth__panel-topbar">
            <div className="muse-auth__brand muse-auth__brand--dark">
              <strong>avoro</strong>
            </div>
            {alternateAction ? (
              <button type="button" className="muse-auth__mode-shortcut" onClick={alternateAction.onClick}>
                {alternateAction.label}
              </button>
            ) : null}
            <button type="button" className="muse-auth__close" onClick={onClose} aria-label="Close">
              <X aria-hidden="true" />
            </button>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}

function getFocusableElements(dialog: HTMLElement | null) {
  if (!dialog) return [];
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getAttribute("aria-hidden") !== "true");
}
