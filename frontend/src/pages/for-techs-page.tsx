/** Marketing and onboarding screen for prospective beauty professionals. */
"use client";

import { ArrowRight, Camera, DollarSign, MapPin, Shield, Star, Users, Zap } from "lucide-react";
import { useRouter } from "@/hooks/router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import type { LocationSuggestion } from "@/services/api";
import {
  initialTechOnboardingForm,
  loginUser,
  registerUser,
  saveTechProfile,
  type AuthUser,
  type TechOnboardingForm
} from "@/services/api";
import LocationAutocomplete from "@/components/common/location-autocomplete";
import { MarketingSections } from "./for-techs/marketing-sections";
import { TechSignupModal } from "./for-techs/tech-signup-modal";

export function SignupContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", referralCode: "" });
  const [isReferralCodeVisible, setIsReferralCodeVisible] = useState(false);
  const [profileForm, setProfileForm] = useState<TechOnboardingForm>(initialTechOnboardingForm);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function selectAuthMode(nextMode: "register" | "login") {
    setAuthMode(nextMode);
    if (nextMode === "login") setIsReferralCodeVisible(false);
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    if (!authForm.email || !authForm.password || (authMode === "register" && !authForm.name)) {
      toast.error("Fill in your account details.");
      return;
    }

    setIsSaving(true);
    try {
      const nextUser =
        authMode === "register"
          ? await registerUser({
              email: authForm.email,
              password: authForm.password,
              role: "TECH",
              fullName: authForm.name
            })
          : await loginUser({ email: authForm.email, password: authForm.password });

      if (nextUser.role !== "TECH") {
        toast.error("This account is not a tech account.");
        return;
      }

      setUser(nextUser);
      setProfileForm((current) => ({
        ...current,
        displayName: current.displayName || nextUser.fullName || "",
        email: current.email || nextUser.email,
        referredByCode: authForm.referralCode || current.referredByCode
      }));
      toast.success(authMode === "register" ? "Account created. Add your profile details." : "Signed in. Add your profile details.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedLocation) {
      toast.error("Select your business city.");
      return;
    }

    setIsSaving(true);
    try {
      const profile = await saveTechProfile(profileForm, selectedLocation);
      setSubmitted(true);
      toast.success(`${profile.businessName} is live on avoro.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile could not be saved");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <TechSignupModal
      onClose={onClose}
      alternateAction={!user && !submitted ? {
        label: authMode === "login" ? "Create account" : "Log in",
        onClick: () => selectAuthMode(authMode === "login" ? "register" : "login")
      } : undefined}
    >
      {submitted ? (
        <div className="muse-auth__form-wrap muse-tech-auth__success">
          <div className="muse-auth__heading">
            <p>Profile published</p>
            <h2 id="tech-signup-title">Your profile is live</h2>
            <span>Customers can now find <strong>{profileForm.businessName}</strong> when your city matches their search.</span>
          </div>
          <button onClick={() => { onClose(); router.push("/schedule"); }} className="muse-auth__submit">Set up services and availability</button>
        </div>
      ) : !user ? (
        <div className={`muse-auth__form-wrap muse-tech-auth__form-wrap ${authMode === "register" ? "is-register" : "is-login"}`}>
          <div className="muse-auth__heading">
            {authMode === "register" ? <div className="muse-beta-badge"><Zap aria-hidden="true" />Free during beta</div> : <p>Your beauty business awaits</p>}
            <h2 id="tech-signup-title">{authMode === "login" ? "Welcome back to avoro" : "Create your free profile"}</h2>
            <span>{authMode === "login" ? "Sign in with your beauty tech account." : "Create a tech account and publish your profile."}</span>
          </div>

          <form onSubmit={handleAuth} className="muse-auth__form">
            {authMode === "register" ? <TextField label="Full name" value={authForm.name} placeholder="Your name" onChange={(value) => setAuthForm({ ...authForm, name: value })} /> : null}
            {authMode === "register" ? (
              isReferralCodeVisible ? <TextField label="Referral code" value={authForm.referralCode} placeholder="avoro-123" onChange={(value) => setAuthForm({ ...authForm, referralCode: value })} />
                : <div className="muse-auth__referral"><button type="button" onClick={() => setIsReferralCodeVisible(true)}>Have a referral code?</button></div>
            ) : null}
            <TextField label="Email address" type="email" value={authForm.email} placeholder="you@example.com" onChange={(value) => setAuthForm({ ...authForm, email: value })} />
            <TextField label="Password" type="password" value={authForm.password} placeholder={authMode === "register" ? "At least 12 characters" : "Your password"} onChange={(value) => setAuthForm({ ...authForm, password: value })} />
            <button type="submit" disabled={isSaving} className="muse-auth__submit muse-tech-signup-submit">
              {isSaving ? "Saving..." : authMode === "register" ? "Create tech account" : "Log in"}
              <ArrowRight aria-hidden="true" />
            </button>
          </form>

          <p className="muse-auth__switch-copy">
            {authMode === "login" ? "New to avoro?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => selectAuthMode(authMode === "login" ? "register" : "login")}>
              {authMode === "login" ? "Create account" : "Log in"}
            </button>
          </p>
        </div>
      ) : (
        <div className="muse-auth__form-wrap muse-tech-profile-step">
          <div className="muse-auth__heading">
            <p>One last step</p>
            <h2 id="tech-signup-title">Finish your avoro profile</h2>
            <span>Signed in as {user.email}. Add the details customers need to discover your work.</span>
          </div>
          <form onSubmit={handleProfileSubmit} className="muse-auth__form muse-tech-profile-form">
            <TextField label="Business name" value={profileForm.businessName} placeholder="Your business name" onChange={(value) => setProfileForm({ ...profileForm, businessName: value })} />
            <TextField label="Display name" value={profileForm.displayName} placeholder="Your display name" onChange={(value) => setProfileForm({ ...profileForm, displayName: value })} />
            <TextField label="Bio" value={profileForm.bio} placeholder="Tell customers what you specialize in" multiline onChange={(value) => setProfileForm({ ...profileForm, bio: value })} />
            <LocationAutocomplete label="Business city" placeholder="Your city" selectedLabel={selectedLocation?.label ?? ""} onSelect={setSelectedLocation} onClear={() => setSelectedLocation(null)} inputClassName="muse-tech-location-input" />
            <TextField label="Specialties" value={profileForm.specialties} placeholder="Gel-X, nail art, lash extensions" onChange={(value) => setProfileForm({ ...profileForm, specialties: value })} />
            <TextField label="Instagram URL" value={profileForm.instagramUrl} placeholder="https://instagram.com/yourhandle" onChange={(value) => setProfileForm({ ...profileForm, instagramUrl: value })} />
            <button type="submit" disabled={isSaving} className="muse-auth__submit">
              {isSaving ? "Publishing..." : "Publish profile"}<ArrowRight aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </TechSignupModal>
  );
}

function TextField({
  label,
  value,
  placeholder,
  type = "text",
  multiline = false,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="muse-auth__field">
      <span>{label}</span>
      <span className="muse-auth__input-wrap">
        {multiline ? (
          <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        ) : (
          <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        )}
      </span>
    </label>
  );
}

export default function ForTechsPage() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const openSignup = () => setShowModal(true);

  return (
    <div className="editorial-page editorial-for-techs min-h-screen">
      {showModal ? <SignupContent onClose={() => setShowModal(false)} /> : null}

      <section className="editorial-for-techs-hero pt-20 pb-24 relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="editorial-for-techs-launch inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-7">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              Launch offer — join free during beta
            </div>
            <h1 className="editorial-display text-[3.4rem] lg:text-7xl leading-[.94] text-[#150E12] mb-6 tracking-tight">
              Grow your client base.<br />
              <em className="editorial-for-techs-accent not-italic">On your terms.</em>
            </h1>
            <p className="text-lg text-muted-foreground mb-9 leading-relaxed max-w-[480px]">
              avoro gives nail and lash techs a professional presence that attracts real, local clients — without relying on Instagram DMs or word-of-mouth alone.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={openSignup}
                className="editorial-for-techs-primary font-bold px-8 py-3.5 rounded-xl transition-colors text-sm inline-flex items-center gap-2 justify-center"
              >
                Create your free profile <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => router.push("/pricing")}
                className="border border-border text-foreground font-semibold px-8 py-3.5 rounded-xl hover:bg-muted transition-colors text-sm"
              >
                View plans
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { value: "Free", label: "To join during beta — no card needed", color: "bg-white border border-border text-foreground" },
              { value: "0%", label: "Commission taken on your bookings", color: "bg-white border border-border text-foreground" },
              { value: "Local", label: "Discovery built around your service area", color: "bg-white border border-border text-foreground" },
              { value: "Yours", label: "Your portfolio, pricing, and client relationships", color: "bg-white border border-border text-foreground" }
            ].map((card) => (
              <div key={card.label} className={`editorial-stat-card p-6 ${card.color}`}>
                <p className="editorial-display text-4xl mb-1">{card.value}</p>
                <p className="text-sm leading-snug opacity-70">{card.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-16">
            <h2 className="editorial-display text-5xl text-[#150E12] mb-4">
              Everything you need to grow
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your clients are already searching. Make sure they find you.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { icon: <Camera className="w-6 h-6" />, title: "Portfolio-first profiles", desc: "Upload photos of your work and let clients fall in love before they even reach out." },
              { icon: <MapPin className="w-6 h-6" />, title: "Location-based discovery", desc: "Show up when local women search for nail and lash services near them. Your neighbourhood, your clients, your schedule." },
              { icon: <Shield className="w-6 h-6" />, title: "Built-in privacy protection", desc: "Work from home without worry. You show a service area, never your exact address. Clients contact you through our platform." },
              { icon: <Star className="w-6 h-6" />, title: "Verified reviews that convert", desc: "Authentic reviews from real clients build the trust that turns first-time visitors into loyal regulars." },
              { icon: <DollarSign className="w-6 h-6" />, title: "No commission on your bookings", desc: "Set your own pricing, update it any time. avoro charges a flat subscription — not a cut of your income." },
              { icon: <Users className="w-6 h-6" />, title: "Referral rewards", desc: "Refer a fellow nail or lash tech. When paid plans launch you both win — you get one free month, they get a head start." }
            ].map((feature) => (
              <div key={feature.title} className="editorial-feature-card bg-white border border-border p-6 flex gap-5">
                <div className="editorial-for-techs-feature-icon w-12 h-12 flex items-center justify-center shrink-0">{feature.icon}</div>
                <div>
                  <h3 className="editorial-display text-2xl text-foreground mb-1.5">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5">
          <h2 className="text-3xl font-bold text-center text-[#150E12] mb-10" style={{ fontFamily: "'Playfair Display', serif" }}>
            Why avoro vs. Instagram alone?
          </h2>
          <div className="editorial-comparison border border-border overflow-hidden">
            <div className="grid grid-cols-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-widest px-6 py-3 border-b border-border">
              <span>Feature</span>
              <span className="text-center">Instagram</span>
              <span className="editorial-for-techs-brand-label text-center">avoro</span>
            </div>
            {[
              ["Searchable by location", false, true],
              ["Transparent pricing display", false, true],
              ["Privacy-protected address", false, true],
              ["Verified client reviews", false, true],
              ["Portfolio-first presentation", false, true],
              ["No algorithm hiding your work", false, true],
              ["Direct client messaging", true, true]
            ].map(([feat, ig, gl]) => (
              <div key={String(feat)} className="grid grid-cols-3 px-6 py-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <span className="text-sm text-foreground">{feat}</span>
                <span className="text-center">
                  {ig === true ? <span className="editorial-for-techs-check font-bold">✓</span> : <span className="text-gray-300 font-bold">✗</span>}
                </span>
                <span className="text-center">
                  {gl ? <span className="editorial-for-techs-check font-bold">✓</span> : <span className="text-gray-300 font-bold">✗</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-5">
          <h2 className="text-3xl font-bold text-center text-[#150E12] mb-12" style={{ fontFamily: "'Playfair Display', serif" }}>
            Common questions
          </h2>
          <div className="space-y-6">
            {[
              { q: "Is it really free during beta?", a: "Yes — completely free during our launch period. Create your profile, list your services, and start getting discovered at no cost. When paid plans launch you will have advance notice and be grandfathered into our earliest pricing tier." },
              { q: "Will my home address be shown publicly?", a: "Never. avoro shows a service area (for example, your city and nearby areas) — not your street address. Clients reach you through our platform messaging, and you decide how much additional contact info to share." },
              { q: "Does avoro take a commission on bookings?", a: "No. You keep 100% of your service income. avoro is a flat monthly subscription — not a cut of your earnings. Pricing details will be announced before beta ends." },
              { q: "What types of techs can join right now?", a: "We currently support nail techs (gel, acrylic, nail art, press-ons, Gel X) and lash techs (extensions, lifts, tints, classic, hybrid, volume, mega volume). Brow artists and estheticians are next on our roadmap." },
              { q: "How does the referral program work?", a: "When you refer another nail or lash tech and they create a verified avoro profile, both of you earn one free month when paid subscriptions launch. The referral is tracked automatically — no promo code needed." }
            ].map((item) => (
              <div key={item.q} className="editorial-for-techs-faq-card border border-border p-7 md:p-8">
                <h4 className="editorial-display text-2xl text-foreground mb-3">{item.q}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingSections onJoin={openSignup} />
    </div>
  );
}
