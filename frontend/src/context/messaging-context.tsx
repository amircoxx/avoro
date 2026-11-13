"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createMessagingFacade, type MessagingFacade, type MessagingWorkspace } from "@/facades/messaging.facade";
import { getMessagingStatus, type UnreadSummaryDto } from "@/services/api";
import { createMessagingSocket, type MessagingSocket } from "@/services/messaging-socket";
import { useAccountAuth } from "./account-auth-context";

export type MessagingConnectionState = "connected" | "reconnecting" | "disconnected" | "session-invalid";

export type MessagingContextValue = {
  available: boolean;
  enabled: boolean;
  unread: UnreadSummaryDto;
  connectionState: MessagingConnectionState;
  live: MessagingSocket | null;
  facade: MessagingFacade | null;
  workspace: MessagingWorkspace | null;
  refreshUnread: () => Promise<void>;
};

type ActiveMessagingSession = {
  generation: number;
  facade: MessagingFacade;
  socket: MessagingSocket;
};

const emptyUnread: UnreadSummaryDto = { unreadMessages: 0, pendingRequests: 0, total: 0 };
const MessagingContext = createContext<MessagingContextValue | null>(null);

export function MessagingProvider({ children }: { children: ReactNode }) {
  const { authUser } = useAccountAuth();
  const [serverEnabled, setServerEnabled] = useState(false);
  const [unread, setUnread] = useState<UnreadSummaryDto>(emptyUnread);
  const [connectionState, setConnectionState] = useState<MessagingConnectionState>("disconnected");
  const [live, setLive] = useState<MessagingSocket | null>(null);
  const [facade, setFacade] = useState<MessagingFacade | null>(null);
  const [workspace, setWorkspace] = useState<MessagingWorkspace | null>(null);
  const connectionGeneration = useRef(0);
  const activeSession = useRef<ActiveMessagingSession | null>(null);
  const lastRestConfirmedSequence = useRef("0");

  useEffect(() => {
    let active = true;
    void getMessagingStatus()
      .then((status) => { if (active) setServerEnabled(status.enabled); })
      .catch(() => { if (active) setServerEnabled(false); });
    return () => { active = false; };
  }, []);

  const refreshUnread = useCallback(async () => {
    const session = activeSession.current;
    if (!session) return;
    const workspace = await session.facade.loadWorkspace();
    if (activeSession.current !== session || connectionGeneration.current !== session.generation) return;
    applyWorkspace(workspace, lastRestConfirmedSequence, setUnread);
  }, []);

  const authUserId = authUser?.id;
  const authUserRole = authUser?.role;
  const isEligible = serverEnabled && (authUserRole === "CUSTOMER" || authUserRole === "TECH");

  useEffect(() => {
    const generation = ++connectionGeneration.current;
    activeSession.current = null;
    lastRestConfirmedSequence.current = "0";
    setUnread(emptyUnread);
    setConnectionState("disconnected");
    setLive(null);
    setFacade(null);
    setWorkspace(null);
    if (!isEligible || !authUserId) return;

    const socket = createMessagingSocket();
    const facade = createMessagingFacade({ socket });
    const session = { generation, facade, socket };
    activeSession.current = session;
    setLive(socket);
    setFacade(facade);
    const stopWorkspace = facade.subscribe((nextWorkspace) => {
      if (activeSession.current !== session || connectionGeneration.current !== generation) return;
      applyWorkspace(nextWorkspace, lastRestConfirmedSequence, setUnread, setWorkspace);
    });
    let bootstrapped = false;
    let connectedAtLeastOnce = false;
    let initialCatchUpStarted = false;
    let recoveryInFlight = false;
    let recoveryPending = false;
    const recoverAfterReconnect = () => {
      if (recoveryInFlight) {
        recoveryPending = true;
        return;
      }
      recoveryInFlight = true;
      void facade.recoverAfterReconnect(lastRestConfirmedSequence.current)
        .then((workspace) => {
          if (activeSession.current === session && connectionGeneration.current === generation) applyWorkspace(workspace, lastRestConfirmedSequence, setUnread, setWorkspace);
        })
        .catch(() => undefined)
        .finally(() => {
          recoveryInFlight = false;
          if (!recoveryPending || activeSession.current !== session || connectionGeneration.current !== generation) {
            recoveryPending = false;
            return;
          }
          recoveryPending = false;
          recoverAfterReconnect();
        });
    };
    const recoverInitialHandshakeGap = () => {
      if (!bootstrapped || !connectedAtLeastOnce || initialCatchUpStarted) return;
      initialCatchUpStarted = true;
      recoverAfterReconnect();
    };
    const onUnread = socket.onUnread((nextUnread) => {
      if (bootstrapped && activeSession.current === session && connectionGeneration.current === generation) setUnread(nextUnread);
    });
    const onConnection = socket.onConnection((nextConnectionState) => {
      if (activeSession.current !== session || connectionGeneration.current !== generation) return;
      setConnectionState(nextConnectionState);
      if (nextConnectionState !== "connected") return;
      if (!connectedAtLeastOnce) {
        connectedAtLeastOnce = true;
        recoverInitialHandshakeGap();
        return;
      }
      if (!bootstrapped) {
        return;
      }
      if (!initialCatchUpStarted) {
        recoverInitialHandshakeGap();
        return;
      }
      recoverAfterReconnect();
    });

    void facade.loadWorkspace()
      .then((workspace) => {
        if (activeSession.current !== session || connectionGeneration.current !== generation) return;
        applyWorkspace(workspace, lastRestConfirmedSequence, setUnread, setWorkspace);
        bootstrapped = true;
        recoverInitialHandshakeGap();
      })
      .catch(() => undefined);

    return () => {
      onUnread();
      onConnection();
      stopWorkspace();
      facade.disconnect();
      activeSession.current = activeSession.current === session ? null : activeSession.current;
    };
  }, [authUserId, authUserRole, isEligible]);

  const value = useMemo<MessagingContextValue>(() => ({
    available: serverEnabled,
    enabled: isEligible,
    unread,
    connectionState,
    facade,
    live,
    refreshUnread,
    workspace
  }), [connectionState, facade, isEligible, live, refreshUnread, serverEnabled, unread, workspace]);

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

function applyWorkspace(workspace: MessagingWorkspace, lastSequence: { current: string }, setUnread: (unread: UnreadSummaryDto) => void, setWorkspace?: (workspace: MessagingWorkspace) => void) {
  lastSequence.current = workspace.lastRestConfirmedSequence;
  setUnread(workspace.unread);
  setWorkspace?.(workspace);
}

export function useMessaging(): MessagingContextValue {
  const context = useContext(MessagingContext);
  if (!context) throw new Error("useMessaging must be used within MessagingProvider");
  return context;
}
