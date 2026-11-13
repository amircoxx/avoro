import { Children, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { AppRoutes } from "../routes/app-routes";

describe("frontend app", () => {
  it("exports the React application entry component", () => {
    expect(App).toBeTypeOf("function");
  });

  it("declares the role-neutral messages route", () => {
    const routeTree = AppRoutes();
    const routes = Children.toArray(routeTree.props.children) as Array<ReactElement<{ path?: string }>>;
    expect(routes.some((route) => route.props.path === "/messages")).toBe(true);
  });
});
