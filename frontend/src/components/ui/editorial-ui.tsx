import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  JSX,
  ReactNode
} from "react";
import { forwardRef } from "react";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function EditorialPageIntro({
  kicker,
  title,
  description,
  actions,
  className
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <header className={joinClasses("editorial-page-intro", className)}>
      <div>
        <p className="editorial-kicker">{kicker}</p>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="editorial-page-intro__actions">{actions}</div> : null}
    </header>
  );
}

export const EditorialButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "danger";
}>(function EditorialButton({
  variant = "primary",
  className,
  type = "button",
  ...props
}, ref): JSX.Element {
  return <button ref={ref} {...props} type={type} className={joinClasses("editorial-button", `editorial-button--${variant}`, className)} />;
});

export function EditorialPanel({
  as: Element = "section",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "aside" | "div";
}): JSX.Element {
  return <Element {...props} className={joinClasses("editorial-panel", className)} />;
}

export function EditorialEmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <section className="editorial-empty-state">
      <p className="editorial-kicker">avoro directory</p>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </section>
  );
}
