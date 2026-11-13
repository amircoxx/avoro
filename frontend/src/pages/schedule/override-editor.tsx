import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AvailabilityOverride, AvailabilityOverrideWrite, AvailabilityWindow, ScheduleWarning, ScheduleWriteResult } from "@/services/api";
import { TimeSelect, validateAvailabilityWindow } from "./availability-editor";

type OverrideDraft = { kind: "unavailable" | "custom"; windows?: AvailabilityWindow[] };

export function validateOverride(input: OverrideDraft): { value: AvailabilityOverrideWrite | null; error: string | null } {
  if (input.kind === "unavailable") return { value: { kind: "unavailable" }, error: null };
  if (!input.windows?.length) return { value: null, error: "Add at least one custom period." };
  const sorted = [...input.windows].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  for (const window of sorted) {
    const error = validateAvailabilityWindow(window);
    if (error) return { value: null, error };
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMinute < sorted[index - 1].endMinute) {
      return { value: null, error: "Custom periods cannot overlap." };
    }
  }
  return { value: { kind: "custom", windows: sorted }, error: null };
}

export function OverrideEditor({
  scopeKey,
  overrides,
  onSave,
  onDelete,
  onWarnings
}: {
  scopeKey: string;
  overrides: AvailabilityOverride[];
  onSave: (localDate: string, input: AvailabilityOverrideWrite) => Promise<ScheduleWriteResult<AvailabilityOverride>>;
  onDelete: (localDate: string) => Promise<ScheduleWriteResult<{ localDate: string }>>;
  onWarnings: (warnings: ScheduleWarning[]) => void;
}) {
  const [savedOverrides, setSavedOverrides] = useState(overrides);
  const [localDate, setLocalDate] = useState("");
  const [kind, setKind] = useState<"unavailable" | "custom">("unavailable");
  const [windows, setWindows] = useState<AvailabilityWindow[]>([{ startMinute: 540, endMinute: 1020 }]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const requestGeneration = useRef(0);
  const activeScope = useRef(scopeKey);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeScope.current = scopeKey;
    requestGeneration.current += 1;
    setSavedOverrides(overrides);
    setLocalDate("");
    setKind("unavailable");
    setWindows([{ startMinute: 540, endMinute: 1020 }]);
    setError("");
    setIsSaving(false);
  }, [scopeKey, overrides]);

  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

  function editOverride(override: AvailabilityOverride) {
    setLocalDate(override.localDate);
    setKind(override.kind);
    setWindows(override.windows.length ? override.windows : [{ startMinute: 540, endMinute: 1020 }]);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!localDate) {
      setError("Choose a date for the override.");
      return;
    }
    const validation = validateOverride({ kind, windows });
    if (!validation.value) {
      setError(validation.error ?? "Override is invalid.");
      return;
    }
    const generation = ++requestGeneration.current;
    const owner = activeScope.current;
    setIsSaving(true);
    setError("");
    try {
      const result = await onSave(localDate, validation.value);
      if (requestGeneration.current !== generation || activeScope.current !== owner) return;
      const canonical = { localDate: result.localDate, kind: result.kind, windows: result.windows };
      setSavedOverrides((current) => [...current.filter((item) => item.localDate !== result.localDate), canonical].sort((a, b) => a.localDate.localeCompare(b.localDate)));
      setKind(canonical.kind);
      setWindows(canonical.windows.length ? canonical.windows : [{ startMinute: 540, endMinute: 1020 }]);
      onWarnings(result.warnings);
    } catch (saveError) {
      if (requestGeneration.current === generation && activeScope.current === owner) setError(errorMessage(saveError, "Override could not be saved."));
    } finally {
      if (requestGeneration.current === generation && activeScope.current === owner) setIsSaving(false);
    }
  }

  async function clearOverride(date: string) {
    const generation = ++requestGeneration.current;
    const owner = activeScope.current;
    setIsSaving(true);
    setError("");
    try {
      const result = await onDelete(date);
      if (requestGeneration.current !== generation || activeScope.current !== owner) return;
      setSavedOverrides((current) => current.filter((item) => item.localDate !== result.localDate));
      if (localDate === result.localDate) setLocalDate("");
      onWarnings(result.warnings);
    } catch (deleteError) {
      if (requestGeneration.current === generation && activeScope.current === owner) setError(errorMessage(deleteError, "Override could not be cleared."));
    } finally {
      if (requestGeneration.current === generation && activeScope.current === owner) setIsSaving(false);
    }
  }

  return (
    <section className="schedule-panel schedule-overrides" aria-labelledby="schedule-overrides-heading">
      <header className="schedule-panel__heading">
        <div><p className="editorial-kicker">Date register</p><h2 id="schedule-overrides-heading">Overrides</h2></div>
        <p>Replace recurring hours for one local date.</p>
      </header>
      {savedOverrides.length ? <ul className="schedule-overrides__list">
        {savedOverrides.map((override) => <li key={override.localDate}>
          <button type="button" onClick={() => editOverride(override)}><strong>{override.localDate}</strong><span>{override.kind === "unavailable" ? "Unavailable all day" : `${override.windows.length} custom period${override.windows.length === 1 ? "" : "s"}`}</span></button>
          <button type="button" aria-label={`Clear override ${override.localDate}`} disabled={isSaving} onClick={() => void clearOverride(override.localDate)}>Clear</button>
        </li>)}
      </ul> : <p className="schedule-panel__empty">No date overrides saved.</p>}

      <form className="schedule-override-form" onSubmit={submit}>
        <label className="schedule-field"><span>Date</span><input type="date" value={localDate} onChange={(event) => setLocalDate(event.target.value)} /></label>
        <fieldset>
          <legend>Override type</legend>
          <label><input type="radio" name="override-kind" checked={kind === "unavailable"} onChange={() => setKind("unavailable")} />Unavailable all day</label>
          <label><input type="radio" name="override-kind" checked={kind === "custom"} onChange={() => setKind("custom")} />Custom hours</label>
        </fieldset>
        {kind === "custom" ? <div className="schedule-periods">
          {windows.map((window, index) => <div className="schedule-period" key={`${index}-${window.startMinute}-${window.endMinute}`}>
            <label><span>Start</span><TimeSelect minute={window.startMinute} onChange={(value) => updateWindow(index, "startMinute", value, setWindows)} /></label>
            <span aria-hidden="true">—</span>
            <label><span>End</span><TimeSelect minute={window.endMinute} isEnd onChange={(value) => updateWindow(index, "endMinute", value, setWindows)} /></label>
            <button type="button" aria-label={`Remove custom period ${index + 1}`} onClick={() => setWindows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>)}
          <button className="schedule-text-action" type="button" onClick={() => setWindows((current) => [...current, { startMinute: 540, endMinute: 1020 }])}>+ Add custom period</button>
        </div> : null}
        {error ? <div ref={alertRef} className="schedule-alert" role="alert" tabIndex={-1}>{error}</div> : null}
        <button className="schedule-primary-action" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save override"}</button>
      </form>
    </section>
  );
}

function updateWindow(index: number, field: keyof AvailabilityWindow, value: number, setter: React.Dispatch<React.SetStateAction<AvailabilityWindow[]>>) {
  setter((current) => current.map((window, itemIndex) => itemIndex === index ? { ...window, [field]: value } : window));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
