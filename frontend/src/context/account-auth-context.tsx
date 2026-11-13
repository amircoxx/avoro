"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentUser, logoutUser, type AuthUser } from "@/services/api";

export type AccountAuthMode = "login" | "register";

type AccountAuthContextValue = {
  mode: AccountAuthMode | null;
  authUser: AuthUser | null;
  isAuthLoading: boolean;
  openAccountAuth: (mode: AccountAuthMode) => void;
  closeAccountAuth: () => void;
  completeAuthentication: (user: AuthUser) => void;
  signOut: () => Promise<void>;
};

const AccountAuthContext = createContext<AccountAuthContextValue | null>(null);

export function AccountAuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AccountAuthMode | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const sessionGeneration = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const generation = ++sessionGeneration.current;
    void getCurrentUser()
      .then((user) => { if (isMounted && sessionGeneration.current === generation) setAuthUser(user); })
      .catch(() => { if (isMounted && sessionGeneration.current === generation) setAuthUser(null); })
      .finally(() => { if (isMounted && sessionGeneration.current === generation) setIsAuthLoading(false); });
    return () => { isMounted = false; };
  }, []);

  const value = useMemo<AccountAuthContextValue>(() => ({
    mode,
    authUser,
    isAuthLoading,
    openAccountAuth: setMode,
    closeAccountAuth: () => setMode(null),
    completeAuthentication: (user) => {
      sessionGeneration.current += 1;
      setAuthUser(user);
      setIsAuthLoading(false);
      setMode(null);
    },
    signOut: async () => {
      sessionGeneration.current += 1;
      await logoutUser();
      setAuthUser(null);
      setIsAuthLoading(false);
      setMode(null);
    }
  }), [authUser, isAuthLoading, mode]);

  return <AccountAuthContext.Provider value={value}>{children}</AccountAuthContext.Provider>;
}

export function useAccountAuth(): AccountAuthContextValue {
  const context = useContext(AccountAuthContext);
  if (!context) throw new Error("useAccountAuth must be used within AccountAuthProvider");
  return context;
}
