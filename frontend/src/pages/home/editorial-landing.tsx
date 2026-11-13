import { ArrowRight, ChevronDown } from "lucide-react";
import { useState, type JSX } from "react";

export type EditorialLandingProps = {
  heroImage: string;
  onCreateProfile: () => void;
  onNavigate: (path: string) => void;
};

const serviceRows = [
  {
    id: "nails",
    label: "Nail services",
    copy: "Gel sets, acrylics, extensions, and nail art — explore real work before choosing your tech.",
    query: "Nail services"
  },
  {
    id: "lashes",
    label: "Lash services",
    copy: "Classic, hybrid, volume, and lift specialists are organized around their portfolios and service areas.",
    query: "Lash services"
  },
  {
    id: "location",
    label: "Search by location",
    copy: "Search by city or service area to find beauty artists who work near you.",
    query: ""
  },
  {
    id: "reviews",
    label: "Portfolios and reviews",
    copy: "Compare finished work, service details, pricing, and customer feedback in one profile.",
    query: ""
  }
];

const benefits = [
  {
    label: "Portfolio-first profiles",
    copy: "Start with the finished work, then explore services, pricing, and reviews."
  },
  {
    label: "Local by design",
    copy: "Search by city or service area instead of sorting through artists who are too far away."
  },
  {
    label: "Details in one place",
    copy: "Compare specialties, service information, and customer perspective without the tab hopping."
  },
  {
    label: "Privacy considered",
    copy: "Artists can share where they work without publishing an exact home address."
  }
];

const steps = [
  { number: "01", label: "Search", copy: "Choose a service and the area where you need it." },
  { number: "02", label: "Compare", copy: "Look through portfolios, service details, and reviews." },
  { number: "03", label: "Connect", copy: "Open the right profile and contact the artist directly." }
];

const faqs = [
  {
    question: "How do I find an artist near me?",
    answer: "Search by service and location. avoro uses the city or service area an artist shares to surface relevant profiles."
  },
  {
    question: "Can I compare artists before reaching out?",
    answer: "Yes. Profiles bring portfolios, specialties, service information, and customer reviews into one place."
  },
  {
    question: "Does avoro publish a tech's home address?",
    answer: "No exact home address is required publicly. Artists can describe the city or wider service area they serve."
  },
  {
    question: "Is creating a tech profile free?",
    answer: "Tech profiles are free during launch. Any future paid plans will be communicated before they apply."
  }
];

export function EditorialLanding({
  heroImage,
  onCreateProfile,
  onNavigate
}: EditorialLandingProps): JSX.Element {
  const [openService, setOpenService] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main className="editorial-home">
      <section className="editorial-hero" aria-labelledby="landing-title">
        <img
          className="editorial-hero__image"
          src={heroImage}
          alt="Glossy black and nude almond nails arranged on charcoal fabric"
        />
        <div className="editorial-hero__shade" />
        <div className="editorial-hero__content">
          <p className="editorial-kicker editorial-kicker--light">Nail and lash artists, discovered locally</p>
          <h1 id="landing-title">Your next beauty artist is closer than you think.</h1>
          <button className="editorial-button editorial-button--ivory" type="button" onClick={() => onNavigate("/discover")}>Find a tech</button>
        </div>
      </section>

      <section className="editorial-proof" aria-label="What avoro helps you compare">
        <p>Made for local beauty decisions</p>
        <div>
          <span>Portfolio-first profiles</span>
          <span>Service-area search</span>
          <span>Reviews with context</span>
          <span>No public home address required</span>
        </div>
      </section>

      <section className="editorial-offerings" aria-labelledby="offerings-title">
        <div className="editorial-ledger">
          <div className="editorial-section-heading">
            <p className="editorial-kicker">Explore avoro</p>
            <h2 id="offerings-title">Beauty, found with intention.</h2>
            <p>Search local nail and lash techs by the work they do, the area they serve, and the experience they offer.</p>
          </div>
          <div className="editorial-ledger__rows">
            {serviceRows.map((row) => {
              const isOpen = openService === row.id;
              const panelId = `service-panel-${row.id}`;
              return (
                <div className="editorial-ledger__row" key={row.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenService(isOpen ? null : row.id)}
                  >
                    <span>{row.label}</span>
                    <ChevronDown aria-hidden="true" className={isOpen ? "is-open" : ""} />
                  </button>
                  {isOpen ? (
                    <div className="editorial-ledger__panel" id={panelId}>
                      <p>{row.copy}</p>
                      <button
                        type="button"
                        onClick={() => onNavigate(row.query ? `/discover?q=${encodeURIComponent(row.query)}` : "/discover")}
                      >
                        Explore <ArrowRight aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <button className="editorial-text-link" type="button" onClick={() => onNavigate("/discover")}>
            Discover all artists <ArrowRight aria-hidden="true" />
          </button>
        </div>

        <aside className="editorial-facts" aria-label="How avoro works">
          <p className="editorial-kicker">The essentials</p>
          <div className="editorial-fact">
            <strong>02</strong>
            <span>Specialties<br />Nails and lashes</span>
          </div>
          <div className="editorial-fact">
            <strong>03</strong>
            <span>Simple steps<br />Search, compare, connect</span>
          </div>
          <div className="editorial-fact">
            <strong>00</strong>
            <span>Exact home addresses<br />Publicly required</span>
          </div>
        </aside>
      </section>

      <section className="editorial-benefits" aria-labelledby="benefits-title">
        <div className="editorial-benefits__heading">
          <p className="editorial-kicker">A clearer choice</p>
          <h2 id="benefits-title">Why customers choose avoro</h2>
        </div>
        <div className="editorial-benefits__grid">
          {benefits.map((benefit) => (
            <article className="editorial-benefit" key={benefit.label}>
              <h3>{benefit.label}</h3>
              <p>{benefit.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="editorial-process" aria-labelledby="process-title">
        <div className="editorial-process__heading">
          <p className="editorial-kicker">How it works</p>
          <h2 id="process-title">Search. Compare. Connect.</h2>
          <button className="editorial-text-link" type="button" onClick={() => onNavigate("/how-it-works")}>
            See the full process <ArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="editorial-process__steps">
          {steps.map((step) => (
            <article className="editorial-step" key={step.number}>
              <span>{step.number}</span>
              <h3>{step.label}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="editorial-privacy" aria-labelledby="privacy-title">
        <div>
          <p className="editorial-kicker">Privacy, built in</p>
          <h2 id="privacy-title">The right details.<br />Nothing more.</h2>
        </div>
        <div className="editorial-privacy__principles">
          <article>
            <span>Service area</span>
            <h3>Location without exposure</h3>
            <p>Artists share the area they serve without publishing an exact home address.</p>
          </article>
          <article>
            <span>Portfolio first</span>
            <h3>See the work before you connect</h3>
            <p>Profiles put finished nail and lash work at the center of the decision.</p>
          </article>
          <article>
            <span>Customer perspective</span>
            <h3>Compare with context</h3>
            <p>Reviews and service details help customers choose local talent with confidence.</p>
          </article>
        </div>
      </section>

      <section className="editorial-faq" aria-labelledby="faq-title">
        <div className="editorial-faq__heading">
          <p className="editorial-kicker">Good to know</p>
          <h2 id="faq-title">A few quick answers.</h2>
        </div>
        <div className="editorial-faq__list">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            const answerId = `landing-faq-answer-${index}`;
            return (
              <div className="editorial-faq__item" key={faq.question}>
                <button
                  type="button"
                  className="editorial-faq__question"
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                >
                  <span>{faq.question}</span>
                  <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen ? <p id={answerId}>{faq.answer}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="editorial-tech-cta" aria-labelledby="tech-title">
        <div>
          <p className="editorial-kicker editorial-kicker--light">Ready when you are</p>
          <h2 id="tech-title">Find the artist<br />for your next set.</h2>
        </div>
        <div className="editorial-tech-cta__copy">
          <p>Search local nail and lash work, compare the details that matter, and connect when a profile feels right.</p>
          <div>
            <button data-landing-cta="discover" className="editorial-button editorial-button--ivory" type="button" onClick={() => onNavigate("/discover")}>Find my artist</button>
            <button className="editorial-text-link editorial-text-link--light" type="button" onClick={onCreateProfile}>
              I’m a beauty tech <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
