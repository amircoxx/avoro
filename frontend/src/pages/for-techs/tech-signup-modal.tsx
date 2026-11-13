import type { ReactNode } from "react";
import { AuthSplitShell, type AuthSplitAlternateAction } from "@/components/layout/account/auth-split-shell";

/** Keeps modal framing presentational while its page owns onboarding state and mutations. */
export function TechSignupModal({
  onClose,
  alternateAction,
  children
}: {
  onClose: () => void;
  alternateAction?: AuthSplitAlternateAction;
  children: ReactNode;
}) {
  return (
    <AuthSplitShell titleId="tech-signup-title" onClose={onClose} alternateAction={alternateAction}>
      {children}
    </AuthSplitShell>
  );
}
