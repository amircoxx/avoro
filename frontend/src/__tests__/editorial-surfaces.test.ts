import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSources = [
  ["discover-page.tsx", "editorial-discover"],
  ["artist-profile-page.tsx", "editorial-profile"],
  ["how-it-works-page.tsx", "editorial-process-page"],
  ["for-techs-page.tsx", "editorial-for-techs"],
  ["tech-profile-page.tsx", "editorial-tech-profile"]
] as const;

const dialogSources = [
  ["../components/layout/account/account-auth-modal.tsx", "AuthSplitShell"],
  ["../components/layout/account/account-settings-modal.tsx", "editorial-dialog"],
  ["../pages/tech-profile/tech-profile-details-modal.tsx", "editorial-dialog"],
  ["../components/common/saved-techs-modal.tsx", "editorial-dialog"],
  ["../pages/for-techs/tech-signup-modal.tsx", "AuthSplitShell"]
] as const;

describe("editorial application surfaces", () => {
  it.each(routeSources)("marks %s with its editorial route root", (filename, className) => {
    const source = readFileSync(new URL(`../pages/${filename}`, import.meta.url), "utf8");
    expect(source).toContain(className);
  });

  it.each(dialogSources)("marks %s as an editorial dialog", (path, marker) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source).toContain(marker);
  });

  it("keeps the editorial dialog marker on the shared auth shell", () => {
    const source = readFileSync(new URL("../components/layout/account/auth-split-shell.tsx", import.meta.url), "utf8");
    expect(source).toContain("editorial-dialog");
  });

  it("uses the shared editorial profile language for owner previews", () => {
    const source = readFileSync(new URL("../pages/tech-profile/tech-profile-preview.tsx", import.meta.url), "utf8");
    expect(source).toContain("editorial-profile-preview");
  });

  it("does not ship unsupported tech-growth counts", () => {
    const source = readFileSync(new URL("../pages/for-techs-page.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('value: "400+"');
    expect(source).not.toContain('value: "2,400+"');
  });

  it("uses only editorial decorative colors on the For Techs marketing page", () => {
    const source = readFileSync(new URL("../pages/for-techs-page.tsx", import.meta.url), "utf8");
    const pageSource = source.slice(source.indexOf("export default function ForTechsPage"));

    expect(pageSource).not.toMatch(/\b(?:bg|text|border)-(?:rose|violet|emerald|amber|cyan|pink)-\d+/);
    expect(pageSource).not.toContain("rgba(196,80,107");
  });

  it("keeps both For Techs signup actions legible on hover", () => {
    const stylesheet = readFileSync(new URL("../assets/globals.css", import.meta.url), "utf8");

    expect(stylesheet).toMatch(
      /\.editorial-for-techs-primary:hover\s*{[^}]*background:\s*var\(--editorial-stone\);[^}]*color:\s*var\(--editorial-ink\);/s
    );
    expect(stylesheet).toMatch(
      /\.editorial-marketing-cta__button:hover\s*{[^}]*background:\s*var\(--editorial-stone\);[^}]*color:\s*var\(--editorial-ink\);/s
    );
  });
});
