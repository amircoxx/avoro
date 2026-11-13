export type ScheduleTab = "bookings" | "availability" | "services";

const tabs: Array<{ id: ScheduleTab; label: string; register: string }> = [
  { id: "bookings", label: "Bookings", register: "01" },
  { id: "availability", label: "Availability", register: "02" },
  { id: "services", label: "Services", register: "03" }
];

export function ScheduleTabs({ activeTab, onChange }: { activeTab: ScheduleTab; onChange: (tab: ScheduleTab) => void }) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    onChange(tabs[nextIndex].id);
  }

  return <div className="schedule-tabs" role="tablist" aria-label="Schedule workspace">
    {tabs.map((tab, index) => <button ref={(node) => { tabRefs.current[index] = node; }} key={tab.id} id={`schedule-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`schedule-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onKeyDown={(event) => moveTab(event, index)} onClick={() => onChange(tab.id)}><span>{tab.register}</span>{tab.label}</button>)}
  </div>;
}
import { useRef, type KeyboardEvent } from "react";
