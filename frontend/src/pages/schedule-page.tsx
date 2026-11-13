/** Tech-only workspace for booking rules, working hours, and stable services. */
import { useEffect, useRef, useState } from "react";
import { useAccountAuth } from "@/context/account-auth-context";
import { defaultScheduleFacade, type ScheduleFacade, type ScheduleWorkspace } from "@/facades/schedule.facade";
import type { ScheduleSettings } from "@/services/api";
import { useRouter } from "@/hooks/router";
import { AvailabilityEditor } from "./schedule/availability-editor";
import { BookingsCalendar } from "./schedule/bookings-calendar";
import { ScheduleTabs, type ScheduleTab } from "./schedule/schedule-tabs";
import { ServicesEditor } from "./schedule/services-editor";

type OwnedWorkspace = { ownerId: string; workspace: ScheduleWorkspace };
type OwnedError = { ownerId: string; message: string };

export default function SchedulePage({ facade = defaultScheduleFacade, initialTab = "bookings", calendarNow }: { facade?: ScheduleFacade; initialTab?: ScheduleTab; calendarNow?: Date }) {
  const { authUser, isAuthLoading } = useAccountAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ScheduleTab>(initialTab);
  const [ownedWorkspace, setOwnedWorkspace] = useState<OwnedWorkspace | null>(null);
  const [loadError, setLoadError] = useState<OwnedError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestGeneration = useRef(0);
  const visibleWorkspace = ownedWorkspace && ownedWorkspace.ownerId === authUser?.id ? ownedWorkspace.workspace : null;
  const visibleError = loadError && loadError.ownerId === authUser?.id ? loadError.message : "";

  function applyCanonicalSettings(settings: ScheduleSettings) {
    const ownerId = authUser?.id;
    if (!ownerId) return;
    setOwnedWorkspace((current) => current?.ownerId === ownerId ? {
      ...current,
      workspace: {
        ...current.workspace,
        schedule: { ...current.workspace.schedule, settings }
      }
    } : current);
  }

  useEffect(() => {
    requestGeneration.current += 1;
    setOwnedWorkspace(null);
    setLoadError(null);
    setIsLoading(false);
    if (isAuthLoading) return;
    if (!authUser || authUser.role !== "TECH") {
      router.push("/");
      return;
    }
    const ownerId = authUser.id;
    const generation = ++requestGeneration.current;
    setIsLoading(true);
    void facade.loadScheduleWorkspace()
      .then((workspace) => {
        if (requestGeneration.current === generation) setOwnedWorkspace({ ownerId, workspace });
      })
      .catch((error) => {
        if (requestGeneration.current === generation) setLoadError({ ownerId, message: errorMessage(error, "Schedule workspace could not be loaded.") });
      })
      .finally(() => {
        if (requestGeneration.current === generation) setIsLoading(false);
      });
  }, [authUser?.id, authUser?.role, facade, isAuthLoading, router.push]);

  useEffect(() => () => { requestGeneration.current += 1; }, []);

  if (isAuthLoading || (isLoading && !visibleWorkspace)) {
    return <main className="editorial-page schedule-page"><p className="schedule-page__loading">Opening schedule register…</p></main>;
  }

  if (!authUser || authUser.role !== "TECH") return <main className="editorial-page schedule-page" />;

  if (!visibleWorkspace) {
    return <main className="editorial-page schedule-page schedule-page--empty"><div className="schedule-alert" role="alert">{visibleError || "Schedule workspace could not be loaded."}</div><button className="schedule-primary-action" type="button" onClick={() => window.location.reload()}>Retry</button></main>;
  }

  return (
    <main className="editorial-page schedule-page">
      <header className="schedule-page__masthead">
        <div><p className="editorial-kicker">Technician workbench</p><h1 className="editorial-display">Schedule register</h1></div>
        <p>Review appointments and set the services and working rules customers can book.</p>
      </header>
      <ScheduleTabs activeTab={activeTab} onChange={setActiveTab} />

      <div id="schedule-panel-bookings" role="tabpanel" aria-labelledby="schedule-tab-bookings" hidden={activeTab !== "bookings"}>
        {visibleWorkspace.schedule.settings ? <BookingsCalendar
          key={`bookings-${authUser.id}`}
          scopeKey={authUser.id}
          timeZone={visibleWorkspace.schedule.settings.timeZone}
          facade={facade}
          now={calendarNow}
        /> : <section className="schedule-bookings-placeholder"><p className="editorial-kicker">Booking register</p><h2>Set your business timezone</h2><p>Save schedule policies and working hours before opening the appointment calendar.</p><button className="schedule-primary-action" type="button" onClick={() => setActiveTab("availability")}>Set availability</button></section>}
      </div>
      <div id="schedule-panel-availability" role="tabpanel" aria-labelledby="schedule-tab-availability" hidden={activeTab !== "availability"}>
        <AvailabilityEditor key={`availability-${authUser.id}`} scopeKey={authUser.id} schedule={visibleWorkspace.schedule} facade={facade} onSettingsSaved={applyCanonicalSettings} />
      </div>
      <div id="schedule-panel-services" role="tabpanel" aria-labelledby="schedule-tab-services" hidden={activeTab !== "services"}>
        <ServicesEditor key={`services-${authUser.id}`} scopeKey={authUser.id} services={visibleWorkspace.services} facade={facade} />
      </div>
    </main>
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
