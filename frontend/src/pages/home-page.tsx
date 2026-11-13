import { useState } from "react";
import heroNails from "@/assets/landing/hero-nails.jpg";
import { useRouter } from "@/hooks/router";
import { EditorialLanding } from "./home/editorial-landing";
import { SignupContent } from "./for-techs-page";

export default function LandingPage() {
  const router = useRouter();
  const [isSignupOpen, setIsSignupOpen] = useState(false);

  return <>
    {isSignupOpen ? <SignupContent onClose={() => setIsSignupOpen(false)} /> : null}
    <EditorialLanding
      heroImage={heroNails}
      onCreateProfile={() => setIsSignupOpen(true)}
      onNavigate={router.push}
    />
  </>;
}
