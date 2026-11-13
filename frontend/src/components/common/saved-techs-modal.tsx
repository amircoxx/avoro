/** Customer-facing dialog for browsing, opening, and removing saved tech profiles. */
"use client";

import { Heart, MapPin, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getSavedTechs,
  removeSavedTech,
  type PublicTechProfile
} from "@/services/api";

type SavedTechsModalProps = {
  onClose: () => void;
  onDiscover: () => void;
  onOpenProfile: (techId: string) => void;
};

type SavedTechsListProps = {
  techs: PublicTechProfile[];
  onOpenProfile: (techId: string) => void;
  onRemove: (tech: PublicTechProfile) => void;
  removingId: string | null;
};

export function SavedTechsModal({ onClose, onDiscover, onOpenProfile }: SavedTechsModalProps) {
  const [techs, setTechs] = useState<PublicTechProfile[] | null>(null);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadSavedTechs() {
    setError("");
    setTechs(null);
    try {
      setTechs(await getSavedTechs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saved techs could not be loaded");
    }
  }

  useEffect(() => {
    void loadSavedTechs();
  }, []);

  async function removeTech(tech: PublicTechProfile) {
    setRemovingId(tech.id);
    try {
      await removeSavedTech(tech.id);
      setTechs((current) => current?.filter((item) => item.id !== tech.id) ?? []);
      toast.success(`Removed ${tech.businessName} from saved techs.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Saved tech could not be removed");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close saved techs" onClick={onClose} />
      <section className="editorial-dialog relative my-4 w-full max-w-2xl overflow-hidden bg-white" role="dialog" aria-modal="true" aria-labelledby="saved-techs-title">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-[#FDF7F4] px-6 py-5 sm:px-8 sm:py-6">
          <div>
            <h2 id="saved-techs-title" className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              Saved techs
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close saved techs"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-6 sm:px-8">
          {techs === null && !error ? (
            <p className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">Loading saved techs...</p>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
              <p className="text-sm font-medium text-rose-800">{error}</p>
              <button onClick={() => void loadSavedTechs()} className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-rose-100">
                Try again
              </button>
            </div>
          ) : null}

          {techs?.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-primary">
                <Heart className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-bold text-foreground">No saved techs yet</h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">Keep your favorite artists handy while you decide who to book.</p>
              <button onClick={onDiscover} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-rose-700">
                Discover techs
              </button>
            </div>
          ) : null}

          {techs && techs.length > 0 ? (
            <SavedTechsList techs={techs} onOpenProfile={onOpenProfile} onRemove={removeTech} removingId={removingId} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function SavedTechsList({ techs, onOpenProfile, onRemove, removingId }: SavedTechsListProps) {
  return (
    <div className="space-y-3">
      {techs.map((tech) => {
        const image = tech.profileImage?.imageUrl;
        return (
          <article key={tech.id} className="flex gap-4 rounded-2xl border border-border bg-white p-3 sm:p-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-rose-100 text-primary">
              {image ? <img src={image} alt={tech.businessName} className="h-full w-full object-cover" /> : <Heart className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold text-foreground">{tech.businessName}</h3>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{tech.specialties[0] || "Beauty tech"}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-primary" />{tech.publicLocationLabel}</span>
                <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{tech.averageRating.toFixed(1)} ({tech.reviewCount})</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onOpenProfile(tech.id)} className="rounded-lg bg-[var(--editorial-ink)] px-3 py-2 text-xs font-bold text-[var(--editorial-paper)] transition-colors hover:bg-black">
                  View profile
                </button>
                <button
                  onClick={() => onRemove(tech)}
                  disabled={removingId === tech.id}
                  aria-label={`Remove ${tech.businessName}`}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  {removingId === tech.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
