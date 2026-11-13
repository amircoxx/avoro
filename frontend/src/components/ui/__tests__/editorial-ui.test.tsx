import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EditorialButton,
  EditorialEmptyState,
  EditorialPageIntro,
  EditorialPanel
} from "../editorial-ui";

describe("editorial UI primitives", () => {
  it("renders the shared page-intro hierarchy", () => {
    const markup = renderToStaticMarkup(createElement(EditorialPageIntro, {
      kicker: "Discover",
      title: "Find your artist",
      description: "Search local talent."
    }));

    expect(markup).toContain("editorial-page-intro");
    expect(markup).toContain("Find your artist");
  });

  it("renders button variants and polymorphic panels", () => {
    const button = renderToStaticMarkup(createElement(EditorialButton, { variant: "secondary" }, "Continue"));
    const panel = renderToStaticMarkup(createElement(EditorialPanel, { as: "aside" }, "Filters"));

    expect(button).toContain("editorial-button--secondary");
    expect(panel.startsWith("<aside")).toBe(true);
    expect(panel).toContain("editorial-panel");
  });

  it("renders an actionable empty state", () => {
    const markup = renderToStaticMarkup(createElement(EditorialEmptyState, {
      title: "No artists found",
      description: "Try another location.",
      action: createElement("button", undefined, "Clear filters")
    }));

    expect(markup).toContain("editorial-empty-state");
    expect(markup).toContain("Clear filters");
  });
});
