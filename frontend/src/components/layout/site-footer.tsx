import { Instagram } from "lucide-react";
import { useEffect, type JSX } from "react";
import { Link, useLocation } from "react-router-dom";

const scrollToTopPaths = new Set(["/discover", "/how-it-works", "/for-techs", "/pricing"]);

export function SiteFooter(): JSX.Element {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (scrollToTopPaths.has(pathname) && !hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  const columns = [
    { heading: "For Customers", links: [{ label: "Find an Artist", to: "/discover" }, { label: "How It Works", to: "/how-it-works" }, { label: "Reviews", to: "/reviews" }, { label: "Safety", to: "/safety" }] },
    { heading: "For Techs", links: [{ label: "Create a Profile", to: "/for-techs" }, { label: "Pricing", to: "/pricing" }, { label: "Referral Program", to: "/referrals" }, { label: "Tech Community", to: "/community" }] },
    { heading: "Company", links: [{ label: "About", to: "/about" }, { label: "Blog", to: "/blog" }, { label: "Careers", to: "/careers" }, { label: "Contact", to: "/contact" }] }
  ];
  return <footer className="editorial-footer"><div className="editorial-footer__inner"><div className="editorial-footer__top"><div className="editorial-footer__brand"><p className="editorial-footer__wordmark">avoro</p><p>Beauty, discovered locally.</p><a href="https://www.instagram.com/avorobeauty" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram aria-hidden="true" /></a></div>{columns.map((col) => <div className="editorial-footer__column" key={col.heading}><h4>{col.heading}</h4><ul>{col.links.map((link) => <li key={link.label}><Link to={link.to}>{link.label}</Link></li>)}</ul></div>)}</div><div className="editorial-footer__bottom"><p>© 2026 avoro Inc. All rights reserved.</p><div>{[{ label: "Privacy", to: "/privacy" }, { label: "Terms", to: "/terms" }, { label: "Cookie Policy", to: "/cookies" }].map((link) => <Link key={link.label} to={link.to}>{link.label}</Link>)}</div></div></div></footer>;
}
