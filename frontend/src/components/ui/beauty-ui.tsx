/** Small reusable presentation primitives shared by marketplace screens. */
"use client";

import { ArrowUpRight, Heart, MapPin, Star } from "lucide-react";
import { useRouter } from "@/hooks/router";
import type { Artist } from "@/services/api";

export function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${sz} ${i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`}
        />
      ))}
    </div>
  );
}

export function Chip({
  label,
  variant = "rose"
}: {
  label: string;
  variant?: "rose" | "violet" | "muted";
}) {
  const v = {
    rose: "bg-rose-50 text-rose-700 border border-rose-100",
    violet: "bg-violet-50 text-violet-700 border border-violet-100",
    muted: "bg-muted text-muted-foreground border border-border"
  }[variant];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${v}`}>
      {label}
    </span>
  );
}

export function ArtistCard({
  artist,
  saved,
  isSaving = false,
  onToggleSaved
}: {
  artist: Artist;
  saved: boolean;
  isSaving?: boolean;
  onToggleSaved: () => void;
}) {
  const router = useRouter();
  const isLash = artist.type === "Lash Tech";
  const profileUrl = artist.backendId ? `/artists/${encodeURIComponent(artist.backendId)}` : `/artists/${artist.id}`;
  const photo = artist.photo.trim();

  return (
    <article
      className="editorial-artist-card group cursor-pointer overflow-hidden border border-border bg-card transition-colors duration-300"
      onClick={() => router.push(profileUrl)}
    >
      <div className="editorial-artist-card__portrait relative aspect-[4/3] overflow-hidden bg-rose-100">
        {photo ? (
          <img
            src={photo}
            alt={artist.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          />
        ) : null}
        <div className="editorial-artist-card__image-shade absolute inset-0" />

        <div className="absolute top-3 left-3 flex gap-1.5">
          {artist.type ? (
            <span
              className="editorial-card-label text-xs font-semibold px-2.5 py-1 bg-black/80 text-white"
            >
              {artist.type}
            </span>
          ) : null}
          {artist.featured ? (
            <span className="editorial-card-label text-xs font-semibold px-2.5 py-1 bg-[#f4efe6] text-black">
              Top Rated
            </span>
          ) : null}
        </div>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleSaved();
          }}
          disabled={isSaving}
          className="editorial-artist-card__save absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black backdrop-blur-sm transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-60"
          aria-label={saved ? "Unsave" : "Save"}
        >
          <Heart className={`h-4 w-4 transition-colors ${saved ? "fill-black text-black" : "text-gray-600"}`} />
        </button>
      </div>

      <div className="editorial-artist-card__body">
        <div className="editorial-artist-card__heading">
          <div>
            <p className="editorial-kicker">{artist.specialty || artist.type || "Beauty professional"}</p>
            <h3 className="editorial-display text-3xl text-foreground">{artist.name}</h3>
          </div>
          <span className="editorial-artist-card__price">
            {artist.priceLabel}
          </span>
        </div>

        <div className="editorial-artist-card__proof" aria-label={`${artist.rating} rating from ${artist.reviewCount} reviews`}>
          <span>
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {artist.reviewCount > 0 ? artist.rating : "New"}
          </span>
          <span>{artist.reviewCount} review{artist.reviewCount === 1 ? "" : "s"}</span>
        </div>

        <div className="editorial-artist-card__location">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{[artist.location, artist.distance].filter(Boolean).join(" · ")}</span>
        </div>
      </div>

      <footer className="editorial-artist-card__footer">
        <div className="editorial-artist-card__tags">
          {artist.tags.slice(0, 2).map((tag) => (
            <Chip key={tag} label={tag} variant={isLash ? "violet" : "rose"} />
          ))}
          {artist.tags.length === 0 ? <span className="editorial-kicker">View portfolio</span> : null}
        </div>
        <span className="editorial-artist-card__profile-action">
          View profile <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </footer>
    </article>
  );
}
