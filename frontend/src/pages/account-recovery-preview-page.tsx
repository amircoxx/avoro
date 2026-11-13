import { useState } from "react";
import { useRouter } from "@/hooks/router";
import { AuthSplitShell } from "@/components/layout/account/auth-split-shell";
import { AccountRecoveryPanel, type RecoveryFlow } from "@/components/layout/account/account-recovery-panel";
import { AccountRecoveryError, type AccountRecoveryActions } from "@/components/layout/account/account-recovery-actions";

type Outcome = "success" | "expired" | "rate_limited" | "unavailable";

/** Development-only, in-memory preview. Never imported by production routing. */
export default function AccountRecoveryPreviewPage() {
  const [flow, setFlow] = useState<RecoveryFlow>("forgot");
  const [outcome, setOutcome] = useState<Outcome>("success");
  const [revision, setRevision] = useState(0);
  const router = useRouter();
  async function simulate() {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    if (outcome !== "success") throw new AccountRecoveryError(outcome, 5);
  }
  const actions: AccountRecoveryActions = { requestReset: simulate, resetPassword: simulate, verifyEmail: simulate, resendVerification: simulate };
  return (
    <AuthSplitShell titleId="recovery-preview-title" onClose={() => router.push("/")}>
      <div className="muse-recovery-preview">
        <p><strong>Frontend preview</strong> · No emails sent. No account changes.</p>
        <label>Screen<select value={flow} onChange={(event) => setFlow(event.target.value as RecoveryFlow)}><option value="forgot">Forgot password</option><option value="reset">Reset password</option><option value="verify">Verify email</option></select></label>
        <label>Response<select value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)}><option value="success">Success</option><option value="expired">Expired link</option><option value="rate_limited">Retry delay</option><option value="unavailable">Unavailable</option></select></label>
      </div>
      <AccountRecoveryPanel key={`${flow}:${outcome}:${revision}`} flow={flow} token="preview-only" initialEmail="" titleId="recovery-preview-title" actions={actions} onLogin={() => setRevision(revision + 1)} />
    </AuthSplitShell>
  );
}
