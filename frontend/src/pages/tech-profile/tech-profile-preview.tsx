/** Minimal owner profile editor focused on details and media that can be changed. */
import { Copy, Heart, Pencil, Plus, X } from "lucide-react";
import { type ChangeEvent, type JSX, type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { BackgroundHero } from "@/components/ui/background-hero";
import { EditorialButton } from "@/components/ui/editorial-ui";
import { PortfolioRail } from "@/components/ui/portfolio-rail";
import type { LocationSuggestion, TechOnboardingForm, TechProfileMedia } from "@/services/api";
import type { ProfileMediaRole } from "./profile-media-draft";

const PROFILE_MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";

export type TechProfilePreviewEditing = {
  disabled: boolean;
  onAdd: (file: File, role: ProfileMediaRole) => void;
  onRemove: (mediaId: string) => void;
  onEditDetails?: () => void;
  editButtonRef?: RefObject<HTMLButtonElement | null>;
};

type TechProfilePreviewProps = {
  form: TechOnboardingForm;
  location: LocationSuggestion | null;
  media: TechProfileMedia;
  rating: number;
  reviewCount: number;
  referralCode: string;
  editing?: TechProfilePreviewEditing;
};

export function TechProfilePreview({ form, media, referralCode, editing }: TechProfilePreviewProps): JSX.Element {
  const profileInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [isSaved, setIsSaved] = useState(false);
  const profileName = form.businessName.trim() || form.displayName.trim() || "Your profile";
  const galleryImages = [...media.galleryImages].sort((left, right) => left.sortOrder - right.sortOrder);

  function selectMedia(event: ChangeEvent<HTMLInputElement>, role: ProfileMediaRole) {
    const file = event.currentTarget.files?.[0];
    if (file) editing?.onAdd(file, role);
    event.currentTarget.value = "";
  }

  async function handleCopyReferralCode() {
    if (!referralCode) {
      toast.error("Save your profile before getting a referral code.");
      return;
    }
    await navigator.clipboard.writeText(referralCode);
    toast.success("Referral code copied to clipboard!");
  }

  return (
    <section aria-label="Public profile preview" className="editorial-page editorial-profile-preview editorial-profile-minimal border border-border">
      <div className="editorial-profile-cover relative overflow-hidden bg-rose-100">
        {media.backgroundImage ? <BackgroundHero src={media.backgroundImage.imageUrl} alt={`${profileName} cover`} /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        {editing ? (
          <button type="button" aria-label="Change background image" disabled={editing.disabled} onClick={() => backgroundInput.current?.click()} className="absolute bottom-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 text-foreground shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="editorial-profile-minimal__body mx-auto max-w-5xl px-5">
        <div className="editorial-profile-minimal__toolbar" aria-label="Profile owner actions">
          <div className="editorial-profile-portrait relative shrink-0 overflow-visible rounded-full border-4 border-white bg-rose-100">
            <div className="h-full overflow-hidden rounded-full">
              {media.profileImage ? <img src={media.profileImage.imageUrl} alt={profileName} className="h-full w-full object-cover" /> : null}
            </div>
            {editing ? (
              <button type="button" aria-label="Change profile picture" disabled={editing.disabled} onClick={() => profileInput.current?.click()} className="absolute -bottom-2 -right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-black text-white shadow-md hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="editorial-profile-minimal__actions">
            {editing ? (
              <>
                <div className="editorial-profile-minimal__referral">
                  <span>Referral code</span>
                  <strong>{referralCode || "Available after saving"}</strong>
                </div>
                <EditorialButton onClick={handleCopyReferralCode} disabled={editing.disabled} variant="secondary" aria-label="Copy referral code">
                  <Copy className="h-4 w-4" aria-hidden="true" /> Copy
                </EditorialButton>
                {editing.onEditDetails ? (
                  <button ref={editing.editButtonRef} type="button" aria-label="Edit profile" disabled={editing.disabled} onClick={editing.onEditDetails} className="editorial-button editorial-button--primary">
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Edit profile
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <EditorialButton>Book now</EditorialButton>
                <button type="button" aria-label="Save profile" aria-pressed={isSaved} onClick={() => setIsSaved((current) => !current)} className={`group inline-flex h-11 w-11 items-center justify-center rounded-full border ${isSaved ? "border-primary bg-rose-50 text-primary" : "border-border bg-white text-muted-foreground hover:border-primary hover:text-primary"}`}>
                  <Heart className={`h-5 w-5 ${isSaved ? "fill-current" : "fill-transparent group-hover:fill-current"}`} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <section className="editorial-profile-minimal__portfolio" aria-labelledby="owner-portfolio-heading">
          <div className="editorial-profile-minimal__heading">
            <div><p className="editorial-kicker">Your work</p><h2 id="owner-portfolio-heading" className="editorial-display">Portfolio</h2></div>
            <p>{galleryImages.length} of 12 photos</p>
          </div>
          {galleryImages.length || editing ? (
            <PortfolioRail
              className="editorial-profile-minimal__gallery"
              images={galleryImages.map((image, index) => ({
                id: image.id,
                src: image.imageUrl,
                alt: image.altText ?? `Portfolio ${index + 1}`
              }))}
              renderOverlay={editing ? (image, index) => (
                <button type="button" aria-label={`Remove portfolio photo ${index + 1}`} disabled={editing.disabled} onClick={() => editing.onRemove(image.id)} className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : undefined}
              trailingItem={editing && galleryImages.length < 12 ? (
                <button type="button" aria-label="Add portfolio photo" disabled={editing.disabled} onClick={() => galleryInput.current?.click()} className="editorial-profile-gallery__add editorial-profile-minimal__gallery-card aspect-square border border-dashed border-border bg-white text-muted-foreground hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-60">
                  <Plus className="mx-auto h-6 w-6" aria-hidden="true" /><span>Add work</span>
                </button>
              ) : undefined}
            />
          ) : <div className="editorial-profile-empty">Add portfolio photos to show clients your work.</div>}
        </section>
      </div>

      {editing ? (
        <>
          <input ref={profileInput} type="file" accept={PROFILE_MEDIA_ACCEPT} className="sr-only" aria-label="Choose profile picture" disabled={editing.disabled} onChange={(event) => selectMedia(event, "profile")} />
          <input ref={backgroundInput} type="file" accept={PROFILE_MEDIA_ACCEPT} className="sr-only" aria-label="Choose background image" disabled={editing.disabled} onChange={(event) => selectMedia(event, "background")} />
          <input ref={galleryInput} type="file" accept={PROFILE_MEDIA_ACCEPT} className="sr-only" aria-label="Choose portfolio photo" disabled={editing.disabled} onChange={(event) => selectMedia(event, "gallery")} />
        </>
      ) : null}
    </section>
  );
}
