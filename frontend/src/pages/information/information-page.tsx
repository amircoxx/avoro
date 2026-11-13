import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { InformationPageContent } from "./information-data";
import "./information.css";

export default function InformationPage({ page }: { page: InformationPageContent }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { hash } = useLocation();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${page.label} | avoro`;
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
      titleRef.current?.focus({ preventScroll: true });
    }
    return () => { document.title = previousTitle; };
  }, [page.path, page.label, hash]);

  return (
    <main className="editorial-page information-page" aria-labelledby="information-title">
      <header className="information-intro">
        <p className="editorial-kicker">{page.category}</p>
        <h1 ref={titleRef} tabIndex={-1} className="editorial-display" id="information-title">{page.title}</h1>
        <p className="information-intro__description">{page.intro}</p>
        {page.notice ? <p className="information-notice" role="note">{page.notice}</p> : null}
      </header>
      <div className="information-body">
        <nav className="information-contents" aria-label="On this page">
          <p className="editorial-kicker">On this page</p>
          {page.sections.map((section, index) => <a key={section.title} href={`#section-${index + 1}`}>{section.title}</a>)}
        </nav>
        <div className="information-sections">
          {page.sections.map((section, index) => (
            <section key={section.title} id={`section-${index + 1}`} aria-labelledby={`heading-${index + 1}`}>
              <span className="information-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h2 className="editorial-display" id={`heading-${index + 1}`}>{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <div className="information-next">
            <p className="editorial-kicker">Your next step</p>
            {page.action.to.startsWith("mailto:")
              ? <a className="information-action" href={page.action.to}>{page.action.label}<ArrowRight aria-hidden="true" /></a>
              : <Link className="information-action" to={page.action.to}>{page.action.label}<ArrowRight aria-hidden="true" /></Link>}
            {page.path !== "/contact" ? <Link className="information-contact" to="/contact">Have a question? Get in touch.</Link> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
