import { CalendarClock, CalendarDays, CreditCard, Heart, LogOut, Menu, MessageCircle, Settings, UserRound, X } from "lucide-react";
import { type JSX, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePathname, useRouter } from "@/hooks/router";
import { type AuthUser } from "@/services/api";
import { SavedTechsModal } from "../common/saved-techs-modal";
import { useAccountAuth } from "../../context/account-auth-context";
import { AccountAuthModal } from "./account/account-auth-modal";
import { AccountSettingsModal } from "./account/account-settings-modal";
import { useMessaging } from "../../context/messaging-context";

export function SiteHeader(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const { mode: authModalMode, authUser, openAccountAuth, closeAccountAuth, completeAuthentication, signOut: signOutAccount } = useAccountAuth();
  const { enabled: messagingEnabled, unread } = useMessaging();
  const [open, setOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavedTechsOpen, setIsSavedTechsOpen] = useState(false);
  const isActive = (path: string) => pathname === path;
  const techNavLabel = authUser?.role === "TECH" ? "My Profile" : "For Techs";
  const techNavPath = authUser?.role === "TECH" ? "/tech-profile" : "/for-techs";
  const canUseMessaging = messagingEnabled && (authUser?.role === "CUSTOMER" || authUser?.role === "TECH");

  async function signOut() {
    try {
      await signOutAccount();
      toast.success("Signed out.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out");
    }
  }

  const navLink = (label: string, path: string) => <button type="button" onClick={() => { router.push(path); setOpen(false); }} className={`editorial-nav-link ${isActive(path) ? "is-active" : ""}`}>{label}</button>;

  return <>
    <nav aria-label="Primary navigation" className="editorial-header">
      <div className="editorial-header__inner">
        <div className="editorial-header__left">
          {navLink("Home", "/")}
          {navLink("Discover", "/discover")}
          {navLink("How It Works", "/how-it-works")}
        </div>
        <button type="button" onClick={() => router.push("/")} className="editorial-wordmark">avoro</button>
        <div className="editorial-header__right">
          {navLink(techNavLabel, techNavPath)}{authUser?.role !== "TECH" ? navLink("Plans for Techs", "/pricing") : null}
          <HeaderAuthActions authUser={authUser} pathname={pathname} showMessages={canUseMessaging} unreadTotal={unread.total} onLogin={() => openAccountAuth("login")} onRegister={() => openAccountAuth("register")} onSettings={() => setIsSettingsOpen(true)} onSavedTechs={() => setIsSavedTechsOpen(true)} onBookings={() => router.push("/bookings")} onSchedule={() => router.push("/schedule")} onPlans={() => router.push("/pricing")} onMessages={() => router.push("/messages")} onSignOut={() => void signOut()} />
        </div>
        <button
          type="button"
          className="editorial-menu-toggle"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-navigation"
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open ? <div id="mobile-navigation" className="editorial-mobile-nav">
        {navLink("Home", "/")}{navLink("Discover", "/discover")}{navLink("How It Works", "/how-it-works")}{navLink(techNavLabel, techNavPath)}{authUser?.role !== "TECH" ? navLink("Plans for Techs", "/pricing") : null}
        <div className="editorial-mobile-nav__account">{authUser ? <div>{canUseMessaging ? <MessagesMenuItem unreadTotal={unread.total} onClick={() => { router.push("/messages"); setOpen(false); }} /> : null}{authUser.role === "CUSTOMER" ? <><button type="button" onClick={() => { router.push("/bookings"); setOpen(false); }}><CalendarDays aria-hidden="true" />My bookings</button><button type="button" onClick={() => { setIsSavedTechsOpen(true); setOpen(false); }}><Heart aria-hidden="true" />Saved techs</button></> : authUser.role === "TECH" ? <><button type="button" onClick={() => { router.push("/schedule"); setOpen(false); }}><CalendarClock aria-hidden="true" />Schedule</button><button type="button" onClick={() => { router.push("/pricing"); setOpen(false); }}><CreditCard aria-hidden="true" />Plans &amp; billing</button></> : null}<div className="editorial-mobile-nav__split"><button type="button" onClick={() => { setIsSettingsOpen(true); setOpen(false); }}>Settings</button><button type="button" onClick={() => { setOpen(false); void signOut(); }}>Sign out</button></div></div> : <div className="editorial-mobile-nav__split"><button type="button" onClick={() => { openAccountAuth("login"); setOpen(false); }}>Log in</button><button type="button" className="is-primary" onClick={() => { openAccountAuth("register"); setOpen(false); }}>Create account</button></div>}</div>
      </div> : null}
    </nav>
    {authModalMode ? <AccountAuthModal initialMode={authModalMode} onClose={closeAccountAuth} onAuthenticated={completeAuthentication} /> : null}
    {isSettingsOpen && authUser ? <AccountSettingsModal user={authUser} onClose={() => setIsSettingsOpen(false)} onUpdated={(user) => { completeAuthentication(user); setIsSettingsOpen(false); }} /> : null}
    {isSavedTechsOpen && authUser?.role === "CUSTOMER" ? <SavedTechsModal onClose={() => setIsSavedTechsOpen(false)} onDiscover={() => { setIsSavedTechsOpen(false); router.push("/discover"); }} onOpenProfile={(techId) => { setIsSavedTechsOpen(false); router.push(`/artists/${techId}`); }} /> : null}
  </>;
}

function HeaderAuthActions({ authUser, pathname, showMessages, unreadTotal, onLogin, onRegister, onSettings, onSavedTechs, onBookings, onSchedule, onPlans, onMessages, onSignOut }: { authUser: AuthUser | null; pathname: string; showMessages: boolean; unreadTotal: number; onLogin: () => void; onRegister: () => void; onSettings: () => void; onSavedTechs: () => void; onBookings: () => void; onSchedule: () => void; onPlans: () => void; onMessages: () => void; onSignOut: () => void; }): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => { if (!menuOpen) return; function handleOutsideClick(event: MouseEvent) { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); } document.addEventListener("mousedown", handleOutsideClick); return () => document.removeEventListener("mousedown", handleOutsideClick); }, [menuOpen]);
  if (authUser) return <div ref={menuRef} className="editorial-account"><button type="button" onClick={() => setMenuOpen((current) => !current)} className="editorial-account__trigger" aria-expanded={menuOpen} aria-haspopup="menu"><UserRound aria-hidden="true" /><span>{authUser.fullName || authUser.email}</span></button>{menuOpen ? <div className="editorial-account__menu" role="menu"><div className="editorial-account__identity"><p>{authUser.fullName || "avoro account"}</p><p>{authUser.email}</p></div>{showMessages ? <MessagesMenuItem unreadTotal={unreadTotal} onClick={() => { setMenuOpen(false); onMessages(); }} isMenuItem /> : null}{authUser.role === "CUSTOMER" ? <><button type="button" onClick={() => { setMenuOpen(false); onBookings(); }} role="menuitem"><CalendarDays aria-hidden="true" />My bookings</button><button type="button" onClick={() => { setMenuOpen(false); onSavedTechs(); }} role="menuitem"><Heart aria-hidden="true" />Saved techs</button></> : authUser.role === "TECH" ? <><button type="button" onClick={() => { setMenuOpen(false); onSchedule(); }} role="menuitem"><CalendarClock aria-hidden="true" />Schedule</button><button type="button" onClick={() => { setMenuOpen(false); onPlans(); }} role="menuitem"><CreditCard aria-hidden="true" />Plans &amp; billing</button></> : null}<button type="button" onClick={() => { setMenuOpen(false); onSettings(); }} role="menuitem"><Settings aria-hidden="true" />Account settings</button><button type="button" onClick={() => { setMenuOpen(false); onSignOut(); }} role="menuitem"><LogOut aria-hidden="true" />Sign out</button></div> : null}</div>;
  return <div className="editorial-auth-actions"><button type="button" onClick={onLogin}>Log in</button><button type="button" className="is-primary" onClick={onRegister}>Create account</button></div>;
}

function MessagesMenuItem({ unreadTotal, onClick, isMenuItem = false }: { unreadTotal: number; onClick: () => void; isMenuItem?: boolean }): JSX.Element {
  return <button type="button" onClick={onClick} aria-label={`Messages, ${unreadTotal} unread`} role={isMenuItem ? "menuitem" : undefined}><MessageCircle aria-hidden="true" /><span>Messages</span>{unreadTotal > 0 ? <span className="editorial-unread-badge" aria-hidden="true">{unreadTotal}</span> : null}</button>;
}
