import { Mail, Phone } from "lucide-react";
import { FaInstagram } from "react-icons/fa6";
import type { Artist } from "@/services/api";

export function ProfileContact({
  artist,
  email,
  phone,
  instagramUrl
}: {
  artist: Artist;
  email?: string;
  phone?: string;
  instagramUrl?: string;
}) {
  const normalizedPhone = phone?.replace(/[^\d+]/g, "");
  if (!email && !normalizedPhone && !instagramUrl) return null;

  const items = [
    email
      ? { label: "Email", value: email, href: `mailto:${email}`, icon: <Mail className="h-4 w-4" aria-hidden="true" /> }
      : null,
    phone && normalizedPhone
      ? { label: "Phone", value: phone, href: `tel:${normalizedPhone}`, icon: <Phone className="h-4 w-4" aria-hidden="true" /> }
      : null,
    instagramUrl
      ? { label: "Instagram", value: artist.handle || "View profile", href: instagramUrl, icon: <FaInstagram className="h-4 w-4" aria-hidden="true" />, external: true }
      : null
  ].filter(Boolean) as Array<{ label: string; value: string; href: string; icon: React.ReactNode; external?: boolean }>;

  return (
    <section aria-labelledby="contact-heading" className="editorial-panel editorial-profile-contact mb-6 border border-border bg-white p-6">
      <div className="mb-4">
        <h2 id="contact-heading" className="editorial-display text-3xl text-foreground">Contact {artist.name.split(" ")[0]}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Reach out directly for appointments and questions.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            aria-label={item.label === "Email" ? `Email ${artist.name}` : item.label === "Phone" ? `Call ${artist.name} at ${item.value}` : `Open ${artist.name}'s Instagram profile`}
            className="group flex items-center gap-3 border border-border p-4 transition-colors hover:border-black"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">{item.icon}</div>
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{item.value}</p></div>
          </a>
        ))}
      </div>
    </section>
  );
}
