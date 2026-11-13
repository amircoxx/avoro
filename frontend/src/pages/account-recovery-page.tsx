import { useAccountAuth } from "@/context/account-auth-context";
import { useRouter, useSearchParams } from "@/hooks/router";
import { AuthSplitShell } from "@/components/layout/account/auth-split-shell";
import { AccountRecoveryPanel, type RecoveryFlow } from "@/components/layout/account/account-recovery-panel";

/** Email landing screens. The backend owner supplies links and connects the callbacks. */
export default function AccountRecoveryPage({ flow }: { flow: RecoveryFlow }) {
  const params = useSearchParams();
  const router = useRouter();
  const { openAccountAuth } = useAccountAuth();
  const token = params.get("token") || undefined;
  function login() {
    router.push("/", { replace: true });
    openAccountAuth("login");
  }
  return (
    <AuthSplitShell titleId="account-recovery-title" onClose={() => router.push("/", { replace: true })}>
      <AccountRecoveryPanel key={`${flow}:${token ?? ""}`} flow={flow} token={token} titleId="account-recovery-title" onLogin={login} />
    </AuthSplitShell>
  );
}
