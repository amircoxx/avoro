/** Public tech-profile screen: loads a profile and coordinates saves and review submission. */
"use client";

import { CalendarDays, Heart, MapPin, MessageCircle } from "lucide-react";
import { useParams, useRouter } from "@/hooks/router";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type PublicTechProfile
} from "@/services/api";
import { loadArtistProfile, submitArtistReview, toggleArtistSavedTech } from "@/facades/artist-profile.facade";
import { Stars } from "@/components/ui/beauty-ui";
import { BackgroundHero } from "@/components/ui/background-hero";
import { type Artist } from "@/services/api";
import { useAccountAuth } from "@/context/account-auth-context";
import { useMessaging } from "@/context/messaging-context";
import { ProfileTabs, type ProfileTab } from "./artist-profile/profile-tabs";
import { ProfileOverview } from "./artist-profile/profile-overview";
import { ReviewForm } from "./artist-profile/review-form";
import { EditorialButton } from "@/components/ui/editorial-ui";
import { MessageRequestDialog } from "./artist-profile/message-request-dialog";

type Tab = ProfileTab;

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [saved, setSaved] = useState(false);
  const [isSavingTech, setIsSavingTech] = useState(false);
  const [backendArtist, setBackendArtist] = useState<Artist | null>(null);
  const [backendProfile, setBackendProfile] = useState<PublicTechProfile | null>(null);
  const { authUser: currentUser } = useAccountAuth();
  const { available: messagingAvailable } = useMessaging();
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isMessageRequestOpen, setIsMessageRequestOpen] = useState(false);
  const messageRequestTriggerRef = useRef<HTMLButtonElement>(null);
  const id = params.id;

  useEffect(() => {
    if (!id) {
      setIsLoadingProfile(false);
      return;
    }
    const techId = id;
    let isMounted = true;

    async function loadBackendArtist() {
      try {
        const { artist, profile, isSaved } = await loadArtistProfile(techId);
        if (isMounted) {
          setBackendProfile(profile);
          setBackendArtist(artist);
          setSaved(isSaved);
        }
      } catch (error) {
        if (isMounted) setLoadError(error instanceof Error ? error.message : "Artist not found");
      } finally {
        if (isMounted) setIsLoadingProfile(false);
      }
    }

    void loadBackendArtist();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const artist = backendArtist;

  if (!artist) {
    if (isLoadingProfile) {
      return (
        <div className="editorial-page editorial-profile min-h-screen flex items-center justify-center">
          <p className="editorial-display text-3xl text-foreground">Loading artist profile…</p>
        </div>
      );
    }

    return (
      <div className="editorial-page editorial-profile min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="editorial-display text-3xl text-foreground">{loadError || "Artist not found."}</p>
        <EditorialButton onClick={() => router.push("/discover")}>
          Browse artists
        </EditorialButton>
      </div>
    );
  }

  const services = artist.services;
  const reviews = artist.reviews;
  const primaryActionLabel = backendProfile?.bookingEnabled ? "Book now" : "Booking unavailable";
  const isBookingUnavailable = !backendProfile?.bookingEnabled;
  const canRequestMessage = messagingAvailable && Boolean(backendProfile);

  function handlePrimaryAction() {
    if (!backendProfile?.bookingEnabled) return;
    router.push(`/artists/${backendProfile.id}/book`);
  }

  async function handleReviewSubmit(event: FormEvent) {
    event.preventDefault();
    if (!backendProfile) return;
    if (!currentUser) {
      toast.error("Log in as a customer to leave a review.");
      return;
    }
    if (currentUser.role !== "CUSTOMER") {
      toast.error("Tech accounts cannot review artist profiles.");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const { profile, artist } = await submitArtistReview(backendProfile.id, reviewForm);
      setBackendProfile(profile);
      setBackendArtist(artist);
      setReviewForm({ rating: 5, comment: "" });
      toast.success("Review saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review could not be saved");
    } finally {
      setIsSubmittingReview(false);
    }
  }

  async function toggleSavedTech() {
    if (!backendProfile) return;
    if (!currentUser) {
      toast.error("Log in as a customer to save techs.");
      return;
    }
    if (currentUser.role !== "CUSTOMER") {
      toast.error("Only customer accounts can save techs.");
      return;
    }

    setIsSavingTech(true);
    try {
      const result = await toggleArtistSavedTech(backendProfile.id, saved);
      setSaved(result.saved);
      toast.success(result.saved ? `${backendProfile.businessName} saved!` : "Removed from saved techs.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Saved tech could not be updated");
    } finally {
      setIsSavingTech(false);
    }
  }

  return (
    <div className="editorial-page editorial-profile min-h-screen">
      <div className="mx-auto max-w-6xl px-5 pt-6 pb-1">
        <button
          onClick={() => router.push("/discover")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          ← Back to results
        </button>
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="editorial-profile-cover relative overflow-hidden border border-border bg-rose-100">
          {backendProfile?.backgroundImage ? (
            <BackgroundHero src={artist.cover} alt={`${artist.name} cover`} />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <header className="editorial-profile-identity relative z-10 bg-white border border-border">
          <div className="editorial-profile-identity__main">
            <div className="editorial-profile-portrait shrink-0 overflow-hidden rounded-full border-4 border-white bg-rose-100">
              {backendProfile?.profileImage && artist.photo ? (
                <img src={artist.photo} alt={artist.name} className="w-full h-full object-cover" />
              ) : null}
            </div>

            <div className="editorial-profile-identity__content min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="editorial-display text-5xl text-foreground">
                      {artist.name}
                    </h1>
                    {artist.type ? (
                      <span className="editorial-card-label border border-black px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest">
                        {artist.type}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{artist.specialty} · {artist.handle}</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Stars rating={artist.rating} size="md" />
                      <span className="text-sm font-semibold">{artist.rating}</span>
                      <span className="text-sm text-muted-foreground">({artist.reviewCount} reviews)</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      {artist.location}
                    </div>
                  </div>
                </div>

                <div className="editorial-profile-actions">
                  <EditorialButton
                    onClick={handlePrimaryAction}
                    disabled={isBookingUnavailable}
                    className="flex items-center gap-2"
                  >
                    <CalendarDays className="w-4 h-4" />
                    {primaryActionLabel}
                  </EditorialButton>
                  {canRequestMessage ? (
                    <EditorialButton
                      ref={messageRequestTriggerRef}
                      onClick={() => setIsMessageRequestOpen(true)}
                      variant="secondary"
                      className="flex items-center justify-center gap-2"
                    >
                      <MessageCircle aria-hidden="true" className="w-4 h-4" />
                      Message this tech
                    </EditorialButton>
                  ) : null}
                  <EditorialButton
                    onClick={() => void toggleSavedTech()}
                    disabled={isSavingTech}
                    variant="secondary"
                    className="flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Heart className={`w-4 h-4 ${saved ? "fill-rose-500 text-rose-500" : ""}`} />
                    {saved ? "Saved" : "Save"}
                  </EditorialButton>
                </div>
              </div>
            </div>
          </div>

          <div className="editorial-profile-identity__ledger">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Price range</p>
              <p className="text-lg font-bold font-mono">{artist.priceLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Service area</p>
              <p className="text-sm font-medium">{artist.location} region</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Specialties</p>
              <p className="text-sm font-medium">{artist.tags.length > 0 ? artist.tags.join(" · ") : "Ask the artist"}</p>
            </div>
          </div>
        </header>

        <ProfileTabs activeTab={tab} artist={artist} onTabChange={setTab} />

        <div className="pb-16">
          {tab === "overview" ? <ProfileOverview artist={artist} profile={backendProfile} primaryActionLabel={primaryActionLabel} primaryActionDisabled={isBookingUnavailable} onPrimaryAction={handlePrimaryAction} /> : null}

          {tab === "services" ? (
            <div className="editorial-panel bg-white border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/30">
                <h3 className="font-semibold text-foreground text-sm">Services &amp; Pricing</h3>
              </div>
              {services.length > 0 ? (
                <>
                  {services.map((service) => (
                    <div key={service.name} className="flex items-center justify-between px-6 py-4 border-b border-border last:border-0 hover:bg-rose-50/40 transition-colors">
                      <span className="text-sm text-foreground">{service.name}</span>
                      <span className="text-sm font-semibold font-mono text-foreground">{service.price}</span>
                    </div>
                  ))}
                  <div className="px-6 py-4 bg-muted/20">
                    <p className="text-xs text-muted-foreground">
                      * Prices may vary based on length, design complexity, and nail condition. Always confirm with the artist before booking.
                    </p>
                  </div>
                </>
              ) : (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  This tech has not listed services yet.
                </p>
              )}
            </div>
          ) : null}

          {tab === "reviews" ? (
            <div className="space-y-4">
              {backendProfile ? (
                <ReviewForm
                  rating={reviewForm.rating}
                  comment={reviewForm.comment}
                  isSubmitting={isSubmittingReview}
                  onRatingChange={(rating) => setReviewForm({ ...reviewForm, rating })}
                  onCommentChange={(comment) => setReviewForm({ ...reviewForm, comment })}
                  onSubmit={handleReviewSubmit}
                />
              ) : null}
              {reviews.map((review, i) => (
                <div key={`${review.date}-${i}`} className="editorial-panel bg-white border border-border p-5">
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">{review.date}</span>
                  </div>
                  <Stars rating={review.rating} />
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.text}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {backendProfile ? (
        <MessageRequestDialog
          open={isMessageRequestOpen}
          techProfileId={backendProfile.id}
          techName={backendProfile.displayName}
          trigger={messageRequestTriggerRef.current}
          onClose={() => setIsMessageRequestOpen(false)}
        />
      ) : null}
    </div>
  );
}
