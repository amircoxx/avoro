/** Pure editor-state helpers kept outside the page's network orchestration. */
import type { ProfileMediaDraft, ProfileMediaRole } from "@/pages/tech-profile/profile-media-draft";
import type { LocationSuggestion, TechOnboardingForm } from "@/services/api";

export function isTechProfileDirty(
  form: TechOnboardingForm,
  location: LocationSuggestion | null,
  draft: ProfileMediaDraft,
  savedForm: TechOnboardingForm,
  savedLocation: LocationSuggestion | null,
  savedDraft: Pick<ProfileMediaDraft, "pendingUploads" | "removedMediaIds">
): boolean {
  return JSON.stringify(form) !== JSON.stringify(savedForm) ||
    JSON.stringify(location) !== JSON.stringify(savedLocation) ||
    JSON.stringify(draft.pendingUploads) !== JSON.stringify(savedDraft.pendingUploads) ||
    JSON.stringify(draft.removedMediaIds) !== JSON.stringify(savedDraft.removedMediaIds);
}

export function shouldSaveTechProfile(form: TechOnboardingForm): boolean {
  return [form.businessName, form.displayName, form.bio, form.email, form.phone, form.instagramUrl, form.specialties].some((value) => value.trim().length > 0);
}

export function revokeObjectUrls(objectUrls: string[]): void {
  objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
}

export function mediaRoleLabel(role: ProfileMediaRole | null): string {
  if (role === "profile") return "profile picture";
  if (role === "background") return "background";
  if (role === "gallery") return "portfolio";
  return "profile";
}
