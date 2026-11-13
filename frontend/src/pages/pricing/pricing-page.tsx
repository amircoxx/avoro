import { useRef, useState } from "react";
import { ArrowRight, Check, Minus, Plus } from "lucide-react";
import { pricingData, type BillingInterval } from "./pricing-data";
import { ApiClientError, createCheckoutSession, createBillingPortalSession } from "@/services/api";
import "./pricing.css";

const money = (amount: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: pricingData.currency, maximumFractionDigits: 2,
  minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
}).format(amount);

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [error, setError] = useState("");

  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const checkoutPending = useRef(false);
  const isPending = pendingPlan !== null || portalPending;

  async function manageSubscription() {
    if (checkoutPending.current) return;
    checkoutPending.current = true;
    setPortalPending(true);
    setError("");
    try {
      const { url } = await createBillingPortalSession();
      window.location.assign(url);
    } catch (error) {
      setError(error instanceof ApiClientError && error.status === 401
        ? "Please sign in to manage your subscription."
        : error instanceof ApiClientError && error.status === 403
        ? "Subscription management is available to tech accounts only."
        : error instanceof ApiClientError && error.code === "missing_billing_account"
        ? "Choose a plan first to set up your billing account."
        : "We couldn’t open billing management. Please try again.");
      checkoutPending.current = false;
      setPortalPending(false);
    }
  }

  async function selectPlan(planId: string) {
    if (checkoutPending.current || !pricingData.plans.some((plan) => plan.id === planId)) return;
    checkoutPending.current = true;
    setPendingPlan(planId);
    setError("");
    try {
      const { url } = await createCheckoutSession({ planId, interval });
      window.location.assign(url);
      // Keep controls disabled until navigation finishes to avoid duplicate sessions.
    } catch (error) {
      setError(error instanceof ApiClientError && error.status === 401
        ? "Please sign in before choosing a plan."
        : error instanceof ApiClientError && error.status === 403 && error.code === "forbidden"
        ? "Plans are available to tech accounts only. Please sign in with a tech account to subscribe."
        : error instanceof ApiClientError && error.code === "existing_subscription"
        ? "You already have a subscription. Use Manage subscription to review or change your plan."
        : "We couldn’t open checkout. Please try again.");
      checkoutPending.current = false;
      setPendingPlan(null);
    }
  }

  return (
    <div className="editorial-page pricing-page">
      <header className="pricing-intro">
        <p className="editorial-kicker">{pricingData.eyebrow}</p>
        <h1 className="editorial-display">{pricingData.title}</h1>
        <p className="pricing-intro__description">{pricingData.description}</p>
      </header>

      <div className="pricing-management">
        <p>Already subscribed? Manage your plan, payment method, and invoices.</p>
        <button type="button" disabled={isPending} onClick={() => void manageSubscription()}>
          {portalPending ? "Opening billing portal…" : "Manage subscription"}<ArrowRight aria-hidden="true" />
        </button>
      </div>

      <div className="pricing-billing">
        <div className="pricing-billing__switch" role="group" aria-label="Billing period">
          {(["monthly", "yearly"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={interval === value} disabled={isPending}
              onClick={() => { setInterval(value); setError(""); }}>
              {value === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <span>Choose the billing rhythm that suits you.</span>
      </div>
      {pricingData.previewNotice ? <p className="pricing-preview">{pricingData.previewNotice}</p> : null}
      <p className="pricing-feedback" role={error ? "alert" : "status"}>
        {error || (portalPending ? "Opening billing portal…" : pendingPlan ? "Opening checkout…" : "")}
      </p>

      <section className="pricing-plans" aria-label="Pricing plans">
        {pricingData.plans.map((plan) => {
          const total = plan.prices[interval];
          const monthly = interval === "yearly" ? total / 12 : total;
          const saving = plan.prices.monthly * 12 - plan.prices.yearly;
          return (
            <article className={`pricing-plan${plan.featured ? " pricing-plan--featured" : ""}`} key={plan.id} aria-labelledby={`plan-${plan.id}`}>
              <div className="pricing-plan__badge-slot">{plan.badge ? <span className="pricing-plan__badge">{plan.badge}</span> : null}</div>
              <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
              <p className="pricing-plan__description">{plan.description}</p>
              <div className="pricing-plan__price"><strong>{money(monthly)}</strong><span>/ month</span></div>
              <p className="pricing-plan__billing">{money(total)} billed {interval}</p>
              <p className="pricing-plan__saving">{interval === "yearly" && saving > 0 ? `Save ${money(saving)} per year` : "\u00a0"}</p>
              <button type="button" className="pricing-plan__action" disabled={isPending} onClick={() => void selectPlan(plan.id)}>
                {pendingPlan === plan.id ? "Opening checkout…" : `Choose ${plan.name}`}<ArrowRight aria-hidden="true" />
              </button>
              <div className="pricing-plan__includes">
                <h3>What’s included</h3>
                <ul>{plan.features.map((feature) => <li key={feature}><Check aria-hidden="true" /><span>{feature}</span></li>)}</ul>
              </div>
            </article>
          );
        })}
      </section>
      <p className="pricing-note">{pricingData.note}</p>

      <section className="pricing-comparison" aria-labelledby="pricing-comparison-title">
        <p className="editorial-kicker">The details, side by side</p>
        <h2 id="pricing-comparison-title" className="editorial-display">Find your fit.</h2>
        <div className="pricing-comparison__scroll" role="region" aria-label="Plan feature comparison" tabIndex={0}>
          <table>
            <caption className="sr-only">Compare features included in each plan</caption>
            <thead><tr><th scope="col">Features</th>{pricingData.plans.map((plan) => <th scope="col" key={plan.id}>{plan.name}</th>)}</tr></thead>
            <tbody>{pricingData.comparison.map((row) => (
              <tr key={row.feature}><th scope="row">{row.feature}</th>{pricingData.plans.map((plan) => {
                const value = row.values[plan.id] ?? false;
                return <td key={plan.id}>{typeof value === "boolean" ? <><span className="sr-only">{value ? "Included" : "Not included"}</span>{value ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />}</> : value}</td>;
              })}</tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="pricing-faq" aria-labelledby="pricing-faq-title">
        <div><p className="editorial-kicker">Pricing questions</p><h2 id="pricing-faq-title" className="editorial-display">{pricingData.faqTitle}</h2></div>
        <div>{pricingData.faqs.map((faq) => (
          <details key={faq.question}><summary>{faq.question}<Plus aria-hidden="true" /></summary><p>{faq.answer}</p></details>
        ))}</div>
      </section>
    </div>
  );
}
