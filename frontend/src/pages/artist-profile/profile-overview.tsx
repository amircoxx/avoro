import { BadgeCheck, MapPin, Scissors, Sparkles } from "lucide-react";
import type { Artist, PublicTechProfile } from "@/services/api";
import { EditorialButton } from "@/components/ui/editorial-ui";
import { ProfileContact } from "./profile-contact";
import { PortfolioRail } from "@/components/ui/portfolio-rail";

export function ProfileOverview({
  artist,
  profile,
  primaryActionLabel,
  primaryActionDisabled,
  onPrimaryAction
}: {
  artist: Artist;
  profile: PublicTechProfile | null;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  onPrimaryAction: () => void;
}) {
  const firstName = artist.name.split(" ")[0];
  const email = profile?.email?.trim();
  const phone = profile?.phone?.trim();
  const instagramUrl = profile?.instagramUrl?.trim();
  const specialties = artist.tags.length > 0 ? artist.tags : profile?.specialties ?? [];

  return (
    <div className="editorial-profile-layout">
      <div className="editorial-profile-dossier">
        <section className="editorial-profile-about" aria-labelledby="profile-about-heading">
          <p className="editorial-kicker">Artist statement</p>
          <h2 id="profile-about-heading" className="editorial-display">About {firstName}</h2>
          <p>{artist.bio || "This artist has not added a biography yet."}</p>
        </section>

        <ProfileContact artist={artist} email={email} phone={phone} instagramUrl={instagramUrl} />

        <section className="editorial-profile-section" aria-labelledby="profile-insights-heading">
          <div className="editorial-profile-section__heading">
            <div>
              <p className="editorial-kicker">At a glance</p>
              <h2 id="profile-insights-heading" className="editorial-display">Profile insights</h2>
            </div>
          </div>
          <div className="editorial-profile-insights">
            <article>
              <BadgeCheck aria-hidden="true" />
              <div>
                <h3>{artist.reviewCount > 0 ? `${artist.rating} average rating` : "New to avoro"}</h3>
                <p>{artist.reviewCount > 0 ? `Across ${artist.reviewCount} client review${artist.reviewCount === 1 ? "" : "s"}.` : "Be among the first clients to leave a review."}</p>
              </div>
            </article>
            <article>
              <MapPin aria-hidden="true" />
              <div>
                <h3>Local specialist</h3>
                <p>Serving clients around {artist.location}.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="editorial-profile-section" aria-labelledby="profile-experience-heading">
          <div className="editorial-profile-section__heading">
            <div>
              <p className="editorial-kicker">Practice details</p>
              <h2 id="profile-experience-heading" className="editorial-display">Experience</h2>
            </div>
          </div>
          <div className="editorial-profile-experience">
            <div>
              <span>Discipline</span>
              <strong>{artist.type || artist.specialty || "Beauty professional"}</strong>
            </div>
            <div>
              <span>Specialties</span>
              <div className="editorial-profile-specialties">
                {specialties.length > 0 ? specialties.map((specialty) => <span key={specialty}>{specialty}</span>) : <em>Not listed yet</em>}
              </div>
            </div>
            <div>
              <span>Services</span>
              <strong>{artist.services.length > 0 ? `${artist.services.length} service${artist.services.length === 1 ? "" : "s"} listed` : "Ask for current offerings"}</strong>
            </div>
          </div>
        </section>

        <section className="editorial-profile-section" aria-labelledby="profile-portfolio-heading">
          <div className="editorial-profile-section__heading">
            <div>
              <p className="editorial-kicker">Selected work</p>
              <h2 id="profile-portfolio-heading" className="editorial-display">Portfolio</h2>
            </div>
          </div>
          {artist.gallery.length > 0 ? (
            <PortfolioRail images={artist.gallery.map((src, index) => ({ id: `${src}-${index}`, src, alt: `Portfolio ${index + 1}` }))} />
          ) : (
            <div className="editorial-profile-empty">This tech has not added work photos yet.</div>
          )}
        </section>
      </div>

      <aside className="editorial-profile-booking" aria-labelledby="booking-heading">
        <p className="editorial-kicker">Appointments</p>
        <h2 id="booking-heading" className="editorial-display">Book with {firstName}</h2>
        <div className="editorial-profile-booking__price">
          <span>Starting at</span>
          <strong>{artist.priceLabel}</strong>
        </div>
        <div className="editorial-profile-booking__detail">
          <MapPin aria-hidden="true" />
          <div><span>Service area</span><strong>{artist.location}</strong></div>
        </div>
        <div className="editorial-profile-booking__detail">
          <Scissors aria-hidden="true" />
          <div><span>Specialty</span><strong>{artist.specialty || artist.type}</strong></div>
        </div>
        <EditorialButton onClick={onPrimaryAction} disabled={primaryActionDisabled}>{primaryActionLabel}</EditorialButton>
        <p className="editorial-profile-booking__note"><Sparkles aria-hidden="true" /> {primaryActionDisabled ? "Direct booking is unavailable. Use the contact methods on this profile." : "Choose a service and an exact available time in the artist’s appointment book."}</p>
      </aside>
    </div>
  );
}
