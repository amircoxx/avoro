import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Eye, EyeOff, KeyRound, Mail, Link2Off } from "lucide-react";
import { accountRecoveryActions, AccountRecoveryError, type AccountRecoveryActions } from "./account-recovery-actions";
import "./account-recovery.css";

export type RecoveryFlow = "forgot" | "reset" | "verify";
type RecoveryStep = RecoveryFlow | "resend" | "sent" | "reset-done" | "verified" | "invalid";

export function AccountRecoveryPanel({ flow, token, initialEmail = "", titleId, onLogin, actions = accountRecoveryActions }: {
  flow: RecoveryFlow;
  token?: string;
  initialEmail?: string;
  titleId: string;
  onLogin(): void;
  actions?: Partial<AccountRecoveryActions>;
}) {
  const [step, setStep] = useState<RecoveryStep>(flow === "reset" && !token ? "invalid" : flow === "verify" && !token ? "resend" : flow);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const submitting = useRef(false);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const emailStep = step === "forgot" || step === "resend";
  const done = step === "reset-done" || step === "verified";

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { (inputRef.current ?? headingRef.current)?.focus(); }, [step]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function changeStep(next: RecoveryStep) {
    setError("");
    setStep(next);
    setPassword("");
    setConfirmation("");
    setVisible(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || Date.now() < retryAt) return;
    setError("");
    if (emailStep && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      inputRef.current?.focus();
      return;
    }
    if (step === "reset") {
      if (password.length < 12 || password.length > 200) {
        setError("Use between 12 and 200 characters for your new password.");
        inputRef.current?.focus();
        return;
      }
      if (password !== confirmation) {
        setError("Your passwords do not match.");
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    try {
      const callbacks = { ...accountRecoveryActions, ...actions };
      if (step === "forgot") await callbacks.requestReset(email.trim());
      else if (step === "resend") await callbacks.resendVerification(email.trim());
      else if (step === "reset" && token) await callbacks.resetPassword({ token, newPassword: password });
      else if (step === "verify" && token) await callbacks.verifyEmail(token);
      else return;
      if (alive.current) changeStep(emailStep ? "sent" : step === "reset" ? "reset-done" : "verified");
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof AccountRecoveryError && cause.code === "expired") {
        changeStep("invalid");
      } else if (cause instanceof AccountRecoveryError && cause.code === "rate_limited") {
        const seconds = Number.isFinite(cause.retryAfterSeconds) ? Math.max(1, cause.retryAfterSeconds) : 60;
        setNow(Date.now());
        setRetryAt(Date.now() + seconds * 1000);
        setError("Too many attempts. Please wait before trying again.");
      } else {
        setError(cause instanceof AccountRecoveryError && cause.code === "unavailable"
          ? "This service is not available yet. Please try again later."
          : "We could not complete your request. Please try again.");
      }
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const titles: Record<RecoveryStep, string> = {
    forgot: "Forgot your password?", reset: "A fresh start", verify: "Confirm your email",
    resend: "Verify your email", sent: "Check your inbox", "reset-done": "Password updated",
    verified: "Email verified", invalid: "This link cannot be used"
  };
  const descriptions: Record<RecoveryStep, string> = {
    forgot: "Enter the email you use for avoro. We’ll help you get back to your account.",
    reset: "Choose a new password to get back to your beauty network.",
    verify: "Confirm your email address to keep your avoro account within reach.",
    resend: "Enter your account email to request a fresh verification link.",
    sent: flow === "verify" ? "If an account matches this email and needs verification, you’ll receive a verification link shortly." : "If an account matches this email, you’ll receive a password reset link shortly.",
    "reset-done": "Your new password is ready. Log in to return to your account.",
    verified: "Your email address is confirmed. You can return to your account.",
    invalid: "The link may have expired, already been used, or be incomplete. Request a new one to continue."
  };
  const Icon = done ? Check : step === "invalid" ? Link2Off : step === "forgot" || step === "reset" ? KeyRound : Mail;

  return (
    <div className="muse-auth__form-wrap muse-recovery">
      <div className="muse-recovery__symbol"><Icon aria-hidden="true" /></div>
      <div className="muse-auth__heading">
        <p>YOUR ACCOUNT, WITH CARE</p>
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>{titles[step]}</h2>
        <span>{descriptions[step]}</span>
      </div>
      {step === "sent" ? (
        <div className="muse-recovery__receipt" role="status">
          <strong>{email.trim()}</strong>
          <p>Check your spam folder, too. Use the newest link if you’ve requested more than one.</p>
          <button type="button" className="muse-recovery__link" onClick={() => changeStep(flow === "verify" ? "resend" : "forgot")}>Try again or change email</button>
        </div>
      ) : step === "invalid" ? (
        <button type="button" className="muse-auth__submit muse-recovery__primary" onClick={() => changeStep(flow === "verify" ? "resend" : "forgot")}>Request a new link</button>
      ) : !done ? (
        <form className="muse-auth__form" onSubmit={submit} noValidate aria-busy={busy}>
          {emailStep ? (
            <label className="muse-auth__field">
              <span>Email address</span>
              <input ref={inputRef} name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} aria-describedby={error ? `${titleId}-error` : undefined} />
            </label>
          ) : step === "reset" ? (
            <>
              <label className="muse-auth__field">
                <span>New password</span>
                <span className="muse-auth__input-wrap">
                  <input ref={inputRef} name="newPassword" type={visible ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={200} disabled={busy} aria-describedby={`${titleId}-hint${error ? ` ${titleId}-error` : ""}`} />
                  <span className="muse-auth__field-action"><button type="button" aria-label={visible ? "Hide passwords" : "Show passwords"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span>
                </span>
              </label>
              <p id={`${titleId}-hint`} className="muse-recovery__hint">Use 12–200 characters. A few unrelated words can make a memorable password.</p>
              <label className="muse-auth__field">
                <span>Confirm new password</span>
                <input name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required maxLength={200} disabled={busy} aria-describedby={error ? `${titleId}-error` : undefined} />
              </label>
            </>
          ) : null}
          {error ? <p className="muse-recovery__error" role="alert" id={`${titleId}-error`}>{error}</p> : null}
          <button type="submit" className="muse-auth__submit" disabled={busy || retrySeconds > 0}>
            {busy ? "Please wait…" : retrySeconds > 0 ? `Try again in ${retrySeconds}s` : step === "forgot" ? "Send reset link" : step === "resend" ? "Send verification link" : step === "reset" ? "Update password" : "Verify email"}
          </button>
        </form>
      ) : null}
      <p className="muse-auth__switch-copy"><button type="button" onClick={onLogin}>Back to log in</button></p>
    </div>
  );
}
