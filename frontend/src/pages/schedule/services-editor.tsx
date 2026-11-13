import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ScheduleService, ScheduleServiceWrite } from "@/services/api";
import type { ScheduleFacade } from "@/facades/schedule.facade";

export type ServiceDraft = {
  name: string;
  description: string;
  durationMinutes: string;
  priceDollars: string;
  isActive: boolean;
};

type ServiceValidation = {
  value: ScheduleServiceWrite | null;
  error: string | null;
  field?: keyof ServiceDraft;
};

const emptyDraft: ServiceDraft = { name: "", description: "", durationMinutes: "", priceDollars: "", isActive: true };

export function dollarsToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fractional = (match[2] ?? "").padEnd(2, "0");
  if (!Number.isSafeInteger(whole)) return null;
  const cents = whole * 100 + Number(fractional || "0");
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToDollarInput(cents: number) {
  const whole = Math.floor(cents / 100);
  const fractional = String(cents % 100).padStart(2, "0");
  return `${whole}.${fractional}`;
}

export function isIncompleteService(service: ScheduleService) {
  return !service.name.trim()
    || service.durationMinutes === null
    || !Number.isInteger(service.durationMinutes)
    || service.durationMinutes < 5
    || service.durationMinutes > 720
    || service.startingPriceCents === null
    || !Number.isInteger(service.startingPriceCents)
    || service.startingPriceCents < 0
    || service.startingPriceCents > 500000;
}

export function serviceToWrite(service: ScheduleService, isActive: boolean): ScheduleServiceWrite | null {
  if (isIncompleteService(service)) return null;
  const { durationMinutes, startingPriceCents } = service;
  if (durationMinutes === null || startingPriceCents === null) return null;
  return {
    name: service.name,
    description: service.description,
    durationMinutes,
    startingPriceCents,
    isActive
  };
}

export function validateServiceDraft(draft: ServiceDraft): ServiceValidation {
  const name = draft.name.trim();
  if (!name) return { value: null, error: "Complete the service name before saving.", field: "name" };
  if (name.length > 120) return { value: null, error: "Service name must be 120 characters or fewer.", field: "name" };
  if (draft.description.trim().length > 1000) return { value: null, error: "Description must be 1,000 characters or fewer.", field: "description" };
  if (!/^\d+$/.test(draft.durationMinutes.trim())) return { value: null, error: "Complete duration with a whole number of minutes.", field: "durationMinutes" };
  const durationMinutes = Number(draft.durationMinutes);
  if (durationMinutes < 5 || durationMinutes > 720) return { value: null, error: "Complete duration with 5–720 minutes.", field: "durationMinutes" };
  const startingPriceCents = dollarsToCents(draft.priceDollars);
  if (startingPriceCents === null) return { value: null, error: "Complete price with dollars and up to two decimal places.", field: "priceDollars" };
  if (startingPriceCents > 500000) return { value: null, error: "Starting price cannot exceed $5,000.00.", field: "priceDollars" };
  return {
    value: { name, description: draft.description.trim(), durationMinutes, startingPriceCents, isActive: draft.isActive },
    error: null
  };
}

export function ServicesEditor({ scopeKey, services: initialServices, facade }: { scopeKey: string; services: ScheduleService[]; facade: ScheduleFacade }) {
  const [services, setServices] = useState(initialServices);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);
  const [savedDraft, setSavedDraft] = useState<ServiceDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const requestGeneration = useRef(0);
  const activeScope = useRef(scopeKey);
  const alertRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<keyof ServiceDraft, HTMLInputElement | HTMLTextAreaElement>>>({});

  useEffect(() => {
    activeScope.current = scopeKey;
    requestGeneration.current += 1;
    setServices(initialServices);
    setEditingId(null);
    setDraft(emptyDraft);
    setSavedDraft(emptyDraft);
    setError("");
    setIsSaving(false);
  }, [scopeKey, initialServices]);

  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);

  function beginNew() {
    const next = { ...emptyDraft };
    setEditingId("new");
    setDraft(next);
    setSavedDraft(next);
    setError("");
  }

  function beginEdit(service: ScheduleService) {
    const next = serviceToDraft(service);
    setEditingId(service.id);
    setDraft(next);
    setSavedDraft(next);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    const validation = validateServiceDraft(draft);
    if (!validation.value) {
      setError(validation.error ?? "Service is incomplete.");
      if (validation.field) fieldRefs.current[validation.field]?.focus();
      return;
    }
    const generation = ++requestGeneration.current;
    const owner = activeScope.current;
    const targetId = editingId;
    setIsSaving(true);
    setError("");
    try {
      const result = targetId === "new" ? await facade.createService(validation.value) : await facade.updateService(targetId, validation.value);
      if (requestGeneration.current !== generation || activeScope.current !== owner) return;
      setServices((current) => targetId === "new" ? [...current, result] : current.map((service) => service.id === result.id ? result : service));
      const canonical = serviceToDraft(result);
      setDraft(canonical);
      setSavedDraft(canonical);
      setEditingId(null);
    } catch (saveError) {
      if (requestGeneration.current === generation && activeScope.current === owner) setError(errorMessage(saveError, "Service could not be saved."));
    } finally {
      if (requestGeneration.current === generation && activeScope.current === owner) setIsSaving(false);
    }
  }

  async function setActive(service: ScheduleService, isActive: boolean) {
    const input = serviceToWrite(service, isActive);
    if (!input) {
      beginEdit(service);
      setDraft((current) => ({ ...current, isActive }));
      setError(`Complete the service duration and price before ${isActive ? "reactivating" : "deactivating"} it.`);
      return;
    }
    const generation = ++requestGeneration.current;
    const owner = activeScope.current;
    setIsSaving(true);
    setError("");
    try {
      const result = await facade.updateService(service.id, input);
      if (requestGeneration.current !== generation || activeScope.current !== owner) return;
      setServices((current) => current.map((item) => item.id === result.id ? result : item));
    } catch (saveError) {
      if (requestGeneration.current === generation && activeScope.current === owner) setError(errorMessage(saveError, `Service could not be ${isActive ? "reactivated" : "deactivated"}.`));
    } finally {
      if (requestGeneration.current === generation && activeScope.current === owner) setIsSaving(false);
    }
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);

  return (
    <section className="schedule-panel schedule-services" aria-labelledby="schedule-services-heading">
      <header className="schedule-panel__heading schedule-services__heading">
        <div><p className="editorial-kicker">Service register</p><h2 id="schedule-services-heading">Services</h2><p>Stable records keep past bookings accurate. Deactivate a service instead of deleting it.</p></div>
        <button className="schedule-primary-action" type="button" onClick={beginNew}>Add service</button>
      </header>

      {error ? <div ref={alertRef} className="schedule-alert schedule-services__alert" role="alert" tabIndex={-1}>{error}</div> : null}

      {editingId ? <form className="schedule-service-form" onSubmit={submit}>
        <header><p className="editorial-kicker">{editingId === "new" ? "New record" : "Edit record"}</p><h3>{editingId === "new" ? "Add a service" : "Update service"}</h3></header>
        <div className="schedule-service-form__grid">
          <label className="schedule-field"><span>Service name</span><input ref={(node) => { fieldRefs.current.name = node ?? undefined; }} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="schedule-field"><span>Duration</span><div className="schedule-field__unit"><input ref={(node) => { fieldRefs.current.durationMinutes = node ?? undefined; }} inputMode="numeric" value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /><span>minutes</span></div><small>Whole minutes, from 5 to 720.</small></label>
          <label className="schedule-field"><span>Starting price</span><div className="schedule-field__unit"><span>$</span><input ref={(node) => { fieldRefs.current.priceDollars = node ?? undefined; }} inputMode="decimal" value={draft.priceDollars} onChange={(event) => setDraft({ ...draft, priceDollars: event.target.value })} /><span>USD</span></div><small>Use dollars and no more than two decimal places.</small></label>
          <label className="schedule-field schedule-service-form__description"><span>Description</span><textarea ref={(node) => { fieldRefs.current.description = node ?? undefined; }} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="schedule-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /><span>Active and visible for booking</span></label>
        </div>
        <footer className="schedule-form-footer"><span>{isDirty ? "Unsaved service changes" : "No unsaved changes"}</span><div><button className="schedule-text-action" type="button" disabled={isSaving} onClick={() => { requestGeneration.current += 1; setEditingId(null); setError(""); }}>Cancel</button><button className="schedule-primary-action" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save service"}</button></div></footer>
      </form> : null}

      {services.length ? <ul className="schedule-service-list">
        {services.map((service, index) => {
          const incomplete = isIncompleteService(service);
          return <li key={service.id} className={!service.isActive ? "is-inactive" : ""}>
            <span className="schedule-service-list__index">{String(index + 1).padStart(2, "0")}</span>
            <div className="schedule-service-list__copy"><div><h3>{service.name || "Unnamed legacy service"}</h3>{incomplete ? <span className="schedule-status is-warning">Incomplete</span> : <span className={`schedule-status ${service.isActive ? "is-active" : ""}`}>{service.isActive ? "Active" : "Inactive"}</span>}</div><p>{service.description || "No description"}</p></div>
            <dl><div><dt>Duration</dt><dd>{service.durationMinutes !== null && service.durationMinutes >= 5 ? `${service.durationMinutes} min` : "Needs duration"}</dd></div><div><dt>From</dt><dd>{service.startingPriceCents !== null && service.startingPriceCents >= 0 ? `$${centsToDollarInput(service.startingPriceCents)}` : "Needs price"}</dd></div></dl>
            <div className="schedule-service-list__actions"><button type="button" aria-label={`Edit ${service.name || "unnamed legacy service"}`} onClick={() => beginEdit(service)}>Edit</button><button type="button" aria-label={`${service.isActive ? "Deactivate" : "Reactivate"} ${service.name || "unnamed legacy service"}`} disabled={isSaving} onClick={() => void setActive(service, !service.isActive)}>{service.isActive ? "Deactivate" : "Reactivate"}</button></div>
          </li>;
        })}
      </ul> : <div className="schedule-panel__empty"><p>No services yet.</p><button className="schedule-text-action" type="button" onClick={beginNew}>Add your first service</button></div>}
    </section>
  );
}

function serviceToDraft(service: ScheduleService): ServiceDraft {
  return {
    name: service.name,
    description: service.description,
    durationMinutes: service.durationMinutes !== null && service.durationMinutes >= 5 ? String(service.durationMinutes) : "",
    priceDollars: service.startingPriceCents !== null && service.startingPriceCents >= 0 ? centsToDollarInput(service.startingPriceCents) : "",
    isActive: service.isActive
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
