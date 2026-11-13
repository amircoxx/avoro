export type BillingInterval = "monthly" | "yearly";
export type PricingPlan = {
  id: string;
  name: string;
  description: string;
  // Amount charged for the entire interval, in the currency below.
  prices: Record<BillingInterval, number>;
  featured?: boolean;
  badge?: string;
  features: string[];
};

// SAMPLE CONTENT for design review. Replace prices, benefits and FAQs before launch.
// Plan IDs are UI identifiers. Your checkout integration must resolve trusted prices.
export const pricingData: {
  currency: string;
  previewNotice: string;
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  plans: PricingPlan[];
  comparison: { feature: string; values: Record<string, string | boolean> }[];
  faqTitle: string;
  faqs: { question: string; answer: string }[];
} = {
  currency: "USD",
  previewNotice: "Pricing preview · Sample plans, prices, and benefits for review. Subscriptions are not available yet.",
  eyebrow: "Plans for independent beauty professionals",
  title: "Make room for your next chapter.",
  description: "Find the right home for your beauty business, from your first portfolio to a growing appointment book.",
  note: "Prices shown in USD. Yearly plans display a monthly equivalent and are billed as one annual payment.",
  plans: [
    {
      id: "starter", name: "Starter", description: "For artists building their presence.",
      prices: { monthly: 12, yearly: 120 },
      features: ["Your artist profile", "Up to 12 portfolio photos", "Local search discovery", "Service menu and pricing"]
    },
    {
      id: "studio", name: "Studio", description: "For a business with a growing appointment book.",
      prices: { monthly: 24, yearly: 240 }, featured: true, badge: "Our pick",
      features: ["Everything in Starter", "Up to 50 portfolio photos", "Online booking and scheduling", "Client messaging", "Booking email notifications"]
    },
    {
      id: "signature", name: "Signature", description: "For established artists with more to showcase.",
      prices: { monthly: 39, yearly: 390 },
      features: ["Everything in Studio", "Unlimited portfolio photos", "Priority support"]
    }
  ],
  comparison: [
    { feature: "Artist profile & local discovery", values: { starter: true, studio: true, signature: true } },
    { feature: "Portfolio photos", values: { starter: "12", studio: "50", signature: "Unlimited" } },
    { feature: "Service menu", values: { starter: true, studio: true, signature: true } },
    { feature: "Online booking & scheduling", values: { starter: false, studio: true, signature: true } },
    { feature: "Client messaging", values: { starter: false, studio: true, signature: true } },
    { feature: "Booking email notifications", values: { starter: false, studio: true, signature: true } },
    { feature: "Support", values: { starter: "Standard", studio: "Standard", signature: "Priority" } }
  ],
  faqTitle: "Before you choose.",
  faqs: [
    { question: "How does yearly billing work?", answer: "The yearly option shows the monthly equivalent for easy comparison. The full annual total is shown on each plan and would be charged once per year." },
    { question: "Are these subscriptions available now?", answer: "Not yet. This is a preview of proposed plans and pricing. Final prices, features, and subscription terms will be confirmed before checkout opens." },
    { question: "Does my plan include beauty appointments?", answer: "These plans are for an artist’s presence on avoro. Beauty services are priced separately by each artist." }
  ]
};
