/** Explains the customer journey and the marketplace's core value proposition. */
"use client";

import type { CSSProperties } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useRouter } from "@/hooks/router";
import { useAccountAuth } from "@/context/account-auth-context";
import { EditorialButton } from "@/components/ui/editorial-ui";

const customerSteps = [
  {
    number: "01",
    anchor: { x: 22, y: 72 },
    title: "Search near you",
    body: "Choose the service you want and the area that works for you. avoro brings nearby nail and lash artists into one focused search."
  },
  {
    number: "02",
    anchor: { x: 51, y: 50 },
    title: "Compare the work",
    body: "Look through real portfolios, services, pricing details, and client reviews. You can see an artist's style before you reach out."
  },
  {
    number: "03",
    anchor: { x: 72, y: 28 },
    title: "Connect directly",
    body: "Found the right fit? Message the artist directly and confirm the appointment details together—without a platform booking fee."
  }
] as const;

const routePath = [
  "M -2 60",
  `C 8 72 14 80 ${customerSteps[0].anchor.x} ${customerSteps[0].anchor.y}`,
  `C 32 60 36 44 ${customerSteps[1].anchor.x} ${customerSteps[1].anchor.y}`,
  `C 62 56 66 48 ${customerSteps[2].anchor.x} ${customerSteps[2].anchor.y}`,
  "C 82 14 92 12 102 18"
].join(" ");

type RouteAnchorStyle = CSSProperties & {
  "--route-x": string;
  "--route-y": string;
};

const techSteps = [
  {
    number: "01",
    title: "Show your work",
    body: "Build a portfolio-first profile around your services and style."
  },
  {
    number: "02",
    title: "Reach local clients",
    body: "Appear when people nearby search for the work you offer."
  },
  {
    number: "03",
    title: "Grow real trust",
    body: "Turn strong work and client reviews into a reputation that travels."
  }
] as const;

export default function HowItWorksPage() {
  const router = useRouter();
  const { openAccountAuth } = useAccountAuth();

  return (
    <div className="editorial-page editorial-process-page muse-process-page min-h-screen">
      <section className="muse-route" aria-labelledby="muse-route-title">
        <div className="muse-route__canvas">
          <header className="muse-route__intro">
            <p className="editorial-kicker">The avoro process</p>
            <h1 id="muse-route-title" className="editorial-display">
              Find the work.<br />Meet your artist.
            </h1>
            <p className="muse-route__lede">
              A clearer way to discover independent nail and lash artists—built around the work, the fit, and a direct connection.
            </p>
            <EditorialButton onClick={() => router.push("/discover")} className="muse-route__cta">
              Find an artist <ArrowRight aria-hidden="true" />
            </EditorialButton>
          </header>

          <svg
            className="muse-route__line"
            viewBox="0 0 100 100"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={routePath} />
          </svg>

          <ol className="muse-route__steps" aria-label="How avoro works for customers">
            {customerSteps.map((step, index) => (
              <li
                key={step.number}
                className={`muse-route__step muse-route__step--${index + 1}`}
                style={{
                  "--route-x": `${step.anchor.x}%`,
                  "--route-y": `${step.anchor.y}%`
                } as RouteAnchorStyle}
              >
                <span className="muse-route__node" aria-hidden="true" />
                <span className="muse-route__number" aria-hidden="true">{step.number}</span>
                <p className="muse-route__step-label">Step {index + 1}</p>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="muse-tech-path" aria-labelledby="muse-tech-path-title">
        <div className="muse-tech-path__heading">
          <div>
            <p className="editorial-kicker">For nail &amp; lash techs</p>
            <h2 id="muse-tech-path-title" className="editorial-display">Let great work find its people.</h2>
          </div>
          <EditorialButton variant="secondary" onClick={() => openAccountAuth("register")}>
            Create your free profile <ArrowRight aria-hidden="true" />
          </EditorialButton>
        </div>

        <ol className="muse-tech-path__steps">
          {techSteps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="muse-process-privacy" aria-labelledby="muse-process-privacy-title">
        <div className="muse-process-privacy__mark" aria-hidden="true">
          <ShieldCheck />
        </div>
        <div>
          <p className="editorial-kicker editorial-kicker--light">Privacy, from the first search</p>
          <h2 id="muse-process-privacy-title" className="editorial-display">Your service area is enough.</h2>
        </div>
        <p>
          avoro helps clients discover artists by city and nearby areas. A tech's exact home address never needs to appear on their public profile.
        </p>
      </section>
    </div>
  );
}
