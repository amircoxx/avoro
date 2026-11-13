import { type FormEvent, type JSX, type Ref, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { loginUser, registerUser, type AuthUser } from "@/services/api";
import { savePendingReferralCode } from "@/utils/pending-referral";
import { AuthSplitShell } from "./auth-split-shell";
import { AccountRecoveryPanel } from "./account-recovery-panel";

type AuthModalMode = "login" | "register";

export function AccountAuthModal({ initialMode, onClose, onAuthenticated }: {
  initialMode: AuthModalMode;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}): JSX.Element {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [role, setRole] = useState<"CUSTOMER" | "TECH">("CUSTOMER");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", referralCode: "" });
  const [isReferralCodeVisible, setIsReferralCodeVisible] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRecovering) (mode === "login" ? emailRef.current : fullNameRef.current)?.focus();
  }, [mode, isRecovering]);

  function selectMode(nextMode: AuthModalMode) {
    setIsRecovering(false);
    setMode(nextMode);
    setIsPasswordVisible(false);
    if (nextMode === "login") setIsReferralCodeVisible(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const user = mode === "register"
        ? await registerUser({ email: form.email, password: form.password, fullName: form.fullName || undefined, role, referralCode: form.referralCode || undefined })
        : await loginUser({ email: form.email, password: form.password });
      if (mode === "register" && role === "TECH") savePendingReferralCode(form.referralCode);
      onAuthenticated(user);
      toast.success(mode === "register" ? "Account created." : "Signed in.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AuthSplitShell
      titleId="account-auth-title"
      onClose={onClose}
      initialFocusRef={mode === "login" ? emailRef : fullNameRef}
      alternateAction={isRecovering ? undefined : {
        label: mode === "login" ? "Create account" : "Log in",
        onClick: () => selectMode(mode === "login" ? "register" : "login")
      }}
    >
      {isRecovering ? <AccountRecoveryPanel flow="forgot" titleId="account-auth-title" initialEmail={form.email} onLogin={() => setIsRecovering(false)} /> : <div className={`muse-auth__form-wrap ${mode === "register" ? "is-register" : "is-login"}`}>
            <div className="muse-auth__heading">
              <p>{mode === "login" ? "Your beauty network awaits" : "A more personal way to book"}</p>
              <h2 id="account-auth-title">{mode === "login" ? "Welcome back to avoro" : "Create your avoro account"}</h2>
              <span>{mode === "login" ? "Sign in to continue to your account." : "Join as a client or a beauty professional."}</span>
            </div>

            <form onSubmit={handleSubmit} className="muse-auth__form">
              {mode === "register" ? (
                <>
                  <AuthField inputRef={fullNameRef} label="Full name" name="fullName" value={form.fullName} placeholder="Your name" autoComplete="name" onChange={(value) => setForm({ ...form, fullName: value })} />
                  <fieldset className="muse-auth__role-field">
                    <legend>Account type</legend>
                    <div className="muse-auth__role-options">
                      {(["CUSTOMER", "TECH"] as const).map((nextRole) => (
                        <button key={nextRole} type="button" aria-pressed={role === nextRole} onClick={() => { setRole(nextRole); if (nextRole === "CUSTOMER") setIsReferralCodeVisible(false); }}>
                          {nextRole === "TECH" ? "Beauty tech" : "Client"}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {mode === "register" && role === "TECH" ? (
                    <div className="muse-auth__referral">
                      {isReferralCodeVisible ? <AuthField label="Referral code" name="referralCode" value={form.referralCode} placeholder="avoro-123" required={false} onChange={(value) => setForm({ ...form, referralCode: value })} />
                        : <button type="button" onClick={() => setIsReferralCodeVisible(true)}>Have a referral code?</button>}
                    </div>
                  ) : null}
                </>
              ) : null}

              <AuthField inputRef={emailRef} label="Email address" name="email" type="email" value={form.email} placeholder="you@example.com" autoComplete="email" onChange={(value) => setForm({ ...form, email: value })} />
              <AuthField label="Password" name="password" type={isPasswordVisible ? "text" : "password"} value={form.password} placeholder={mode === "register" ? "At least 12 characters" : "Your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} onChange={(value) => setForm({ ...form, password: value })} trailing={(
                <button type="button" onClick={() => setIsPasswordVisible((visible) => !visible)} aria-label={isPasswordVisible ? "Hide password" : "Show password"}>
                  {isPasswordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              )} />

              {mode === "login" ? (
                <div className="muse-auth__recovery-row">
                <label className="muse-auth__remember">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                  <span>Remember me</span>
                </label>
                <button type="button" className="muse-recovery__link" onClick={() => { setForm({ ...form, password: "" }); setIsRecovering(true); }}>Forgot password?</button>
                </div>
              ) : null}

              <button type="submit" disabled={isSaving} className="muse-auth__submit">
                {isSaving ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
              </button>
            </form>

            <p className="muse-auth__switch-copy">
              {mode === "login" ? "New to avoro?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => selectMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Create account" : "Log in"}
              </button>
            </p>
      </div>}
    </AuthSplitShell>
  );
}

function AuthField({ inputRef, label, name, type = "text", value, placeholder, autoComplete, required = true, onChange, trailing }: {
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  name: string;
  type?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  onChange: (value: string) => void;
  trailing?: JSX.Element;
}): JSX.Element {
  return (
    <label className="muse-auth__field">
      <span>{label}</span>
      <span className="muse-auth__input-wrap">
        <input ref={inputRef} name={name} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} required={required} onChange={(event) => onChange(event.target.value)} />
        {trailing ? <span className="muse-auth__field-action">{trailing}</span> : null}
      </span>
    </label>
  );
}
