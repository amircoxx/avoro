/** Owns composition of the persistent application shell. */
"use client";

import { Toaster } from "sonner";
import { AccountAuthProvider } from "../../context/account-auth-context";
import { MessagingProvider } from "../../context/messaging-context";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export default function BeautyShell({ children }: { children: React.ReactNode }) {
  return (
    <AccountAuthProvider>
      <MessagingProvider>
        <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <Toaster position="top-center" richColors />
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </MessagingProvider>
    </AccountAuthProvider>
  );
}
