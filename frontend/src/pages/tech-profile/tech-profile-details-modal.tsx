import { X } from "lucide-react";
import { type FormEvent, useEffect, useRef } from "react";
import LocationAutocomplete from "@/components/common/location-autocomplete";
import type { LocationSuggestion, TechOnboardingForm } from "@/services/api";

export type TechProfileDetailsModalProps = {
  form: TechOnboardingForm;
  location: LocationSuggestion | null;
  isSaving: boolean;
  onChange: (next: TechOnboardingForm) => void;
  onLocationChange: (next: LocationSuggestion | null) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

export function TechProfileDetailsModal({
  form,
  location,
  isSaving,
  onChange,
  onLocationChange,
  onClose,
  onSave
}: TechProfileDetailsModalProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button type="button" disabled={isSaving} className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close profile editor" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="tech-profile-details-title" className="editorial-dialog relative my-4 w-full max-w-2xl overflow-hidden bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-[#FDF7F4] px-6 py-5 sm:px-8 sm:py-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-rose-700">Public tech profile</p>
            <h2 ref={titleRef} id="tech-profile-details-title" tabIndex={-1} className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              Edit profile
            </h2>
          </div>
          <button type="button" disabled={isSaving} onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSave}>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-6 sm:px-8">
            <fieldset disabled={isSaving} className="space-y-5">
              <TextField label="Business name" value={form.businessName} placeholder="Gloss Room" onChange={(value) => onChange({ ...form, businessName: value })} />
              <TextField label="Display name" value={form.displayName} placeholder="Your display name" onChange={(value) => onChange({ ...form, displayName: value })} />
              <label className="block text-sm font-medium text-foreground">
                Bio
                <textarea aria-label="Bio" value={form.bio} placeholder="Tell clients what you specialize in." onChange={(event) => onChange({ ...form, bio: event.target.value })} className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50" />
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Profile email" type="email" value={form.email} placeholder="booking@example.com" onChange={(value) => onChange({ ...form, email: value })} />
                <TextField label="Phone" value={form.phone} placeholder="555-0100" onChange={(value) => onChange({ ...form, phone: value })} />
              </div>
              <TextField label="Instagram URL" value={form.instagramUrl} placeholder="https://instagram.com/yourhandle" onChange={(value) => onChange({ ...form, instagramUrl: value })} />
              <TextField label="Specialties" value={form.specialties} placeholder="Gel-X, nail art, lash extensions" onChange={(value) => onChange({ ...form, specialties: value })} />
              <label className="block text-sm font-medium text-foreground">
                City
                <div className="mt-1.5 rounded-xl border border-border bg-white px-4 py-2.5 focus-within:border-primary/50">
                  <LocationAutocomplete placeholder="Charlotte, NC" selectedLabel={location?.label ?? ""} inputClassName="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" onSelect={onLocationChange} onClear={() => onLocationChange(null)} />
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground">
                <input aria-label="Publish this profile in search" type="checkbox" checked={form.isPublished} onChange={(event) => onChange({ ...form, isPublished: event.target.checked })} className="h-4 w-4 accent-rose-600" />
                Publish this profile in search
              </label>
            </fieldset>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-border px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
            <button type="button" disabled={isSaving} onClick={onClose} className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60">Cancel</button>
            <button type="submit" disabled={isSaving} className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-rose-700 disabled:opacity-60">{isSaving ? "Saving..." : "Save profile"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      <input aria-label={label} type={type} value={value} placeholder={placeholder} onInput={(event) => onChange(event.currentTarget.value)} className="mt-1.5 w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50" />
    </label>
  );
}
