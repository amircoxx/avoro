import { type FormEvent, type JSX, useState } from "react";
import { KeyRound, Settings2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { type AuthUser } from "@/services/api";
import { changePassword, updateAccount } from "@/services/api";
import { AccountTextField } from "./account-text-field";

type SettingsSection = "general" | "password";

const emptyPasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

export function AccountSettingsModal({
  user,
  onClose,
  onUpdated
}: {
  user: AuthUser;
  onClose: () => void;
  onUpdated: (user: AuthUser) => void;
}): JSX.Element {
  const [form, setForm] = useState({ fullName: user.fullName ?? "", email: user.email });
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updatedUser = await updateAccount(form);
      onUpdated(updatedUser);
      toast.success("Account updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (passwordForm.newPassword.length < 12 || passwordForm.newPassword.length > 200) {
      toast.error("New password must be between 12 and 200 characters.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm(emptyPasswordForm);
      toast.success("Password updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password could not be updated");
    } finally {
      setIsChangingPassword(false);
    }
  }

  const accountLabel = user.role === "TECH" ? "Tech account" : "Customer account";

  return (
    <div className="muse-settings-overlay fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4">
      <button className="fixed inset-0 bg-black/45 backdrop-blur-sm" aria-label="Close account settings" onClick={onClose} />
      <div className="editorial-dialog muse-settings" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
        <aside className="muse-settings__rail" aria-label="Settings sections">
          <button type="button" onClick={onClose} className="muse-settings__close" aria-label="Close">
            <X aria-hidden="true" />
          </button>

          <div className="muse-settings__rail-heading">
            <p className="editorial-kicker">Account settings</p>
            <p>Preferences</p>
          </div>

          <nav className="muse-settings__nav" aria-label="Account settings">
            {activeSection === "general" ? (
              <button type="button" className="muse-settings__nav-item is-active" aria-current="page">
                <Settings2 aria-hidden="true" />
                <span>General</span>
              </button>
            ) : (
              <button type="button" className="muse-settings__nav-item" onClick={() => setActiveSection("general")}>
                <Settings2 aria-hidden="true" />
                <span>General</span>
              </button>
            )}
            {activeSection === "password" ? (
              <button type="button" className="muse-settings__nav-item is-active" aria-current="page">
                <KeyRound aria-hidden="true" />
                <span>Password</span>
              </button>
            ) : (
              <button type="button" className="muse-settings__nav-item" onClick={() => setActiveSection("password")}>
                <KeyRound aria-hidden="true" />
                <span>Password</span>
              </button>
            )}
          </nav>

          <div className="muse-settings__identity">
            <span className="muse-settings__identity-mark"><UserRound aria-hidden="true" /></span>
            <span>
              <strong>{user.fullName || "avoro member"}</strong>
              <small>{accountLabel}</small>
            </span>
          </div>
        </aside>

        <section className="muse-settings__content">
          <header className="muse-settings__header">
            <div>
              <p className="editorial-kicker">{activeSection === "general" ? "Your account" : "Account security"}</p>
              {activeSection === "general"
                ? <h2 id="account-settings-title">General</h2>
                : <h2 id="account-settings-title">Password</h2>}
            </div>
            <button type="button" onClick={onClose} className="muse-settings__mobile-close" aria-label="Close">
              <X aria-hidden="true" />
            </button>
          </header>

          <form onSubmit={activeSection === "general" ? handleSubmit : handlePasswordSubmit} className="muse-settings__form">
            <div className="muse-settings__scroll-region">
              <section className="muse-settings__account-card" aria-labelledby="account-overview-title">
                <span className="muse-settings__account-icon"><UserRound aria-hidden="true" /></span>
                <div>
                  <p className="editorial-kicker">Signed in as</p>
                  <h3 id="account-overview-title">{user.fullName || "avoro member"}</h3>
                  <p>{user.email}</p>
                </div>
                <span className="muse-settings__role">{accountLabel}</span>
              </section>

              {activeSection === "general" ? (
                <section className="muse-settings__details" aria-labelledby="personal-details-title">
                  <div className="muse-settings__section-heading">
                    <p className="editorial-kicker">Personal details</p>
                    <h3 id="personal-details-title">How you appear on avoro</h3>
                    <p>Keep your name and sign-in email current.</p>
                  </div>
                  <div className="muse-settings__fields">
                    <AccountTextField label="Full name" value={form.fullName} placeholder="Your name" onChange={(value) => setForm({ ...form, fullName: value })} />
                    <AccountTextField label="Email address" type="email" value={form.email} placeholder="you@example.com" onChange={(value) => setForm({ ...form, email: value })} />
                  </div>
                </section>
              ) : (
                <section className="muse-settings__details" aria-labelledby="password-details-title">
                  <div className="muse-settings__section-heading">
                    <p className="editorial-kicker">Password</p>
                    <h3 id="password-details-title">Change your password</h3>
                    <p>Use 12 to 200 characters. Other devices will be signed out.</p>
                  </div>
                  <div className="muse-settings__fields">
                    <AccountTextField
                      label="Current password"
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.currentPassword}
                      onChange={(value) => setPasswordForm({ ...passwordForm, currentPassword: value })}
                    />
                    <AccountTextField
                      label="New password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.newPassword}
                      onChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })}
                    />
                    <AccountTextField
                      label="Confirm new password"
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.confirmPassword}
                      onChange={(value) => setPasswordForm({ ...passwordForm, confirmPassword: value })}
                    />
                  </div>
                </section>
              )}
            </div>

            <div className="muse-settings__actions">
              <p>{activeSection === "general" ? "Changes apply to your avoro account." : "Your current session will stay signed in."}</p>
              <div>
                <button type="button" onClick={onClose} className="muse-settings__button muse-settings__button--secondary">Cancel</button>
                {activeSection === "general" ? (
                  <button type="submit" disabled={isSaving} className="muse-settings__button muse-settings__button--primary">{isSaving ? "Saving..." : "Save changes"}</button>
                ) : (
                  <button type="submit" disabled={isChangingPassword} className="muse-settings__button muse-settings__button--primary">{isChangingPassword ? "Changing..." : "Change password"}</button>
                )}
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
