import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AvailabilityWindow,
  Schedule,
  ScheduleSettings,
  ScheduleWarning,
  ScheduleWriteResult,
  WeeklyAvailabilityInput,
  WeeklyAvailabilityWindow
} from "@/services/api";
import type { ScheduleFacade } from "@/facades/schedule.facade";
import { OverrideEditor } from "./override-editor";

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  timeZone: "America/New_York",
  minimumNoticeMinutes: 120,
  maximumAdvanceDays: 60,
  bufferMinutes: 15,
  cancellationCutoffMinutes: 1440
};

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const suggestedTimeZones = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
const runtimeTimeZones = (() => {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
  const supported = supportedValuesOf ? supportedValuesOf("timeZone") : [];
  return [...new Set([...suggestedTimeZones, ...supported])];
})();

export function validateAvailabilityWindow(window: AvailabilityWindow): string | null {
  if (!Number.isInteger(window.startMinute) || !Number.isInteger(window.endMinute) || window.startMinute < 0 || window.startMinute > 1439 || window.endMinute < 1 || window.endMinute > 1440) {
    return "Periods must stay within one local day.";
  }
  if (window.startMinute % 30 !== 0 || window.endMinute % 30 !== 0) return "Times must align to 30-minute boundaries.";
  if (window.endMinute <= window.startMinute) return "End time must be after start time.";
  return null;
}

export function normalizeWeeklyAvailability(input: WeeklyAvailabilityInput[]): { value: WeeklyAvailabilityInput[] | null; error: string | null } {
  const sortedDays = input
    .map((day) => ({ ...day, windows: [...day.windows].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute) }))
    .filter((day) => day.windows.length > 0)
    .sort((a, b) => a.weekday - b.weekday);
  for (const day of sortedDays) {
    for (const window of day.windows) {
      const error = validateAvailabilityWindow(window);
      if (error) return { value: null, error: `${weekdays[day.weekday] ?? "Day"}: ${error}` };
    }
    for (let index = 1; index < day.windows.length; index += 1) {
      if (day.windows[index].startMinute < day.windows[index - 1].endMinute) {
        return { value: null, error: `${weekdays[day.weekday] ?? "Day"} periods cannot overlap.` };
      }
    }
  }
  return { value: sortedDays, error: null };
}

export function AvailabilityEditor({ scopeKey, schedule, facade, onSettingsSaved }: {
  scopeKey: string;
  schedule: Schedule;
  facade: ScheduleFacade;
  onSettingsSaved?: (settings: ScheduleSettings) => void;
}) {
  const [settings, setSettings] = useState(schedule.settings ?? DEFAULT_SCHEDULE_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(schedule.settings);
  const [weekly, setWeekly] = useState(() => expandWeekly(schedule.weeklyAvailability));
  const [savedWeekly, setSavedWeekly] = useState(() => expandWeekly(schedule.weeklyAvailability));
  const [warnings, setWarnings] = useState<ScheduleWarning[]>([]);
  const [settingsError, setSettingsError] = useState("");
  const [weeklyError, setWeeklyError] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);
  const settingsGeneration = useRef(0);
  const weeklyGeneration = useRef(0);
  const activeScope = useRef(scopeKey);
  const settingsAlertRef = useRef<HTMLDivElement>(null);
  const weeklyAlertRef = useRef<HTMLDivElement>(null);
  const latestSchedule = useRef(schedule);
  latestSchedule.current = schedule;

  useEffect(() => {
    const ownerSchedule = latestSchedule.current;
    activeScope.current = scopeKey;
    settingsGeneration.current += 1;
    weeklyGeneration.current += 1;
    const nextWeekly = expandWeekly(ownerSchedule.weeklyAvailability);
    setSettings(ownerSchedule.settings ?? DEFAULT_SCHEDULE_SETTINGS);
    setSavedSettings(ownerSchedule.settings);
    setWeekly(nextWeekly);
    setSavedWeekly(nextWeekly);
    setWarnings([]);
    setSettingsError("");
    setWeeklyError("");
    setIsSavingSettings(false);
    setIsSavingWeekly(false);
  }, [scopeKey]);

  useEffect(() => { if (settingsError) settingsAlertRef.current?.focus(); }, [settingsError]);
  useEffect(() => { if (weeklyError) weeklyAlertRef.current?.focus(); }, [weeklyError]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const validation = validateSettings(settings);
    if (validation) {
      setSettingsError(validation);
      return;
    }
    const generation = ++settingsGeneration.current;
    const owner = activeScope.current;
    setIsSavingSettings(true);
    setSettingsError("");
    try {
      const result = await facade.saveSettings(settings);
      if (settingsGeneration.current !== generation || activeScope.current !== owner) return;
      setSettings(result.settings);
      setSavedSettings(result.settings);
      setWarnings(result.warnings);
      onSettingsSaved?.(result.settings);
    } catch (error) {
      if (settingsGeneration.current === generation && activeScope.current === owner) setSettingsError(errorMessage(error, "Schedule policies could not be saved."));
    } finally {
      if (settingsGeneration.current === generation && activeScope.current === owner) setIsSavingSettings(false);
    }
  }

  async function saveWeekly(event: FormEvent) {
    event.preventDefault();
    const validation = normalizeWeeklyAvailability(weekly);
    if (!validation.value) {
      setWeeklyError(validation.error ?? "Weekly availability is invalid.");
      return;
    }
    const generation = ++weeklyGeneration.current;
    const owner = activeScope.current;
    setIsSavingWeekly(true);
    setWeeklyError("");
    try {
      const result = await facade.saveWeeklyAvailability(validation.value);
      if (weeklyGeneration.current !== generation || activeScope.current !== owner) return;
      const canonical = expandWeekly(result.weeklyAvailability);
      setWeekly(canonical);
      setSavedWeekly(canonical);
      setWarnings(result.warnings);
    } catch (error) {
      if (weeklyGeneration.current === generation && activeScope.current === owner) setWeeklyError(errorMessage(error, "Weekly availability could not be saved."));
    } finally {
      if (weeklyGeneration.current === generation && activeScope.current === owner) setIsSavingWeekly(false);
    }
  }

  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const weeklyDirty = JSON.stringify(weekly) !== JSON.stringify(savedWeekly);
  const timeZones = runtimeTimeZones.includes(settings.timeZone) ? runtimeTimeZones : [settings.timeZone, ...runtimeTimeZones];
  const warningTimeZone = savedSettings?.timeZone ?? settings.timeZone;

  return (
    <div className="schedule-availability-workbench">
      <div className="schedule-availability-workbench__main">
        <section className="schedule-panel" aria-labelledby="weekly-hours-heading">
          <header className="schedule-panel__heading">
            <div><p className="editorial-kicker">Recurring register</p><h2 id="weekly-hours-heading">Weekly hours</h2></div>
            <p>Starts and ends use 30-minute boundaries. Add separate periods for breaks.</p>
          </header>
          <form onSubmit={saveWeekly}>
            <div className="schedule-week">
              {weekly.map((day) => <div className="schedule-day" key={day.weekday}>
                <div className="schedule-day__label"><span>{String(day.weekday + 1).padStart(2, "0")}</span><strong>{weekdays[day.weekday]}</strong><small>{day.windows.length ? `${day.windows.length} period${day.windows.length === 1 ? "" : "s"}` : "Unavailable"}</small></div>
                <div className="schedule-periods">
                  {day.windows.map((window, index) => <div className="schedule-period" key={`${index}-${window.startMinute}-${window.endMinute}`}>
                    <label><span>Start</span><TimeSelect minute={window.startMinute} onChange={(value) => updateWeeklyWindow(day.weekday, index, "startMinute", value, setWeekly)} /></label>
                    <span aria-hidden="true">—</span>
                    <label><span>End</span><TimeSelect minute={window.endMinute} isEnd onChange={(value) => updateWeeklyWindow(day.weekday, index, "endMinute", value, setWeekly)} /></label>
                    <button type="button" aria-label={`Remove ${weekdays[day.weekday]} period ${index + 1}`} onClick={() => setWeekly((current) => current.map((item) => item.weekday === day.weekday ? { ...item, windows: item.windows.filter((_, itemIndex) => itemIndex !== index) } : item))}>Remove</button>
                  </div>)}
                  <button className="schedule-text-action" type="button" onClick={() => setWeekly((current) => current.map((item) => item.weekday === day.weekday ? { ...item, windows: [...item.windows, { startMinute: 540, endMinute: 1020 }] } : item))}>+ Add period</button>
                </div>
              </div>)}
            </div>
            {weeklyError ? <div ref={weeklyAlertRef} className="schedule-alert" role="alert" tabIndex={-1}>{weeklyError}</div> : null}
            <footer className="schedule-form-footer"><span>{weeklyDirty ? "Unsaved weekly changes" : "Weekly hours saved"}</span><button className="schedule-primary-action" type="submit" disabled={isSavingWeekly}>{isSavingWeekly ? "Saving…" : "Save weekly hours"}</button></footer>
          </form>
        </section>
      </div>

      <aside className="schedule-availability-workbench__rail">
        <section className="schedule-panel" aria-labelledby="schedule-policies-heading">
          <header className="schedule-panel__heading"><div><p className="editorial-kicker">Booking rules</p><h2 id="schedule-policies-heading">Policies</h2></div></header>
          <form className="schedule-policies" onSubmit={saveSettings}>
            <label className="schedule-field"><span>Business timezone</span><select value={settings.timeZone} onChange={(event) => setSettings({ ...settings, timeZone: event.target.value })}>{timeZones.map((timeZone) => <option key={timeZone} value={timeZone}>{timeZone}</option>)}</select><small>IANA timezone used for new availability. Existing bookings keep their saved timezone.</small></label>
            <PolicyField label="Minimum notice" unit="minutes" help="How soon a customer may book." value={settings.minimumNoticeMinutes} onChange={(value) => setSettings({ ...settings, minimumNoticeMinutes: value })} />
            <PolicyField label="Booking horizon" unit="days" help="How far ahead the calendar opens." value={settings.maximumAdvanceDays} onChange={(value) => setSettings({ ...settings, maximumAdvanceDays: value })} />
            <PolicyField label="Appointment buffer" unit="minutes" help="Blocked time after every service." value={settings.bufferMinutes} onChange={(value) => setSettings({ ...settings, bufferMinutes: value })} />
            <PolicyField label="Cancellation cutoff" unit="minutes before start" help="When customer self-cancellation closes." value={settings.cancellationCutoffMinutes} onChange={(value) => setSettings({ ...settings, cancellationCutoffMinutes: value })} />
            {settingsError ? <div ref={settingsAlertRef} className="schedule-alert" role="alert" tabIndex={-1}>{settingsError}</div> : null}
            <footer className="schedule-form-footer"><span>{settingsDirty ? "Unsaved policy changes" : "Policies saved"}</span><button className="schedule-primary-action" type="submit" disabled={isSavingSettings}>{isSavingSettings ? "Saving…" : "Save policies"}</button></footer>
          </form>
        </section>
        <OverrideEditor scopeKey={scopeKey} overrides={schedule.overrides} onSave={facade.saveOverride} onDelete={facade.deleteOverride} onWarnings={setWarnings} />
      </aside>

      {warnings.length ? <section className="schedule-warnings" aria-live="polite"><p className="editorial-kicker">Saved with booking notes</p><h2>Existing appointments need review</h2><ul>{warnings.map((warning) => <li key={`${warning.bookingId}-${warning.startAt}`}>
        <strong>{warning.bookingId}</strong>
        <span>Current schedule: <time dateTime={warning.startAt}>{formatScheduleWarningTimestamp(warning.startAt, warningTimeZone)}</time> ({warningTimeZone})</span>
        {warning.timeZoneSnapshot !== warningTimeZone ? <span>Booking snapshot: <time dateTime={warning.startAt}>{formatScheduleWarningTimestamp(warning.startAt, warning.timeZoneSnapshot)}</time> ({warning.timeZoneSnapshot})</span> : null}
        <span>{warning.message}</span>
      </li>)}</ul></section> : null}
    </div>
  );
}

export function formatScheduleWarningTimestamp(startAt: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(new Date(startAt));
  } catch {
    return new Date(startAt).toISOString();
  }
}

function PolicyField({ label, unit, help, value, onChange }: { label: string; unit: string; help: string; value: number; onChange: (value: number) => void }) {
  return <label className="schedule-field"><span>{label}</span><div className="schedule-field__unit"><input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{unit}</span></div><small>{help}</small></label>;
}

function validateSettings(settings: ScheduleSettings) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: settings.timeZone }).format();
  } catch {
    return "Choose a valid IANA timezone.";
  }
  if (!Number.isInteger(settings.minimumNoticeMinutes) || settings.minimumNoticeMinutes < 0 || settings.minimumNoticeMinutes > 43200) return "Minimum notice must be 0–43,200 minutes.";
  if (!Number.isInteger(settings.maximumAdvanceDays) || settings.maximumAdvanceDays < 1 || settings.maximumAdvanceDays > 365) return "Booking horizon must be 1–365 days.";
  if (!Number.isInteger(settings.bufferMinutes) || settings.bufferMinutes < 0 || settings.bufferMinutes > 240) return "Buffer must be 0–240 minutes.";
  if (!Number.isInteger(settings.cancellationCutoffMinutes) || settings.cancellationCutoffMinutes < 0 || settings.cancellationCutoffMinutes > 43200) return "Cancellation cutoff must be 0–43,200 minutes.";
  return null;
}

function expandWeekly(windows: WeeklyAvailabilityWindow[]): WeeklyAvailabilityInput[] {
  return weekdays.map((_, weekday) => ({
    weekday,
    windows: windows.filter((window) => window.weekday === weekday).map(({ startMinute, endMinute }) => ({ startMinute, endMinute }))
  }));
}

function updateWeeklyWindow(weekday: number, index: number, field: keyof AvailabilityWindow, value: number, setter: React.Dispatch<React.SetStateAction<WeeklyAvailabilityInput[]>>) {
  setter((current) => current.map((day) => day.weekday === weekday ? { ...day, windows: day.windows.map((window, itemIndex) => itemIndex === index ? { ...window, [field]: value } : window) } : day));
}

export function minuteToTime(minute: number) {
  if (minute === 1440) return "24:00";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function TimeSelect({ minute, isEnd = false, onChange }: { minute: number; isEnd?: boolean; onChange: (minute: number) => void }) {
  const first = isEnd ? 30 : 0;
  const last = isEnd ? 1440 : 1410;
  const options = Array.from({ length: (last - first) / 30 + 1 }, (_, index) => first + index * 30);
  return <select value={minute} onChange={(event) => onChange(Number(event.target.value))}>
    {options.map((value) => <option key={value} value={value}>{minuteToTime(value)}</option>)}
  </select>;
}

export function timeToMinute(value: string, allowEndOfDay = false) {
  if (allowEndOfDay && value === "24:00") return 1440;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
