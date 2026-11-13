import type { InformationPageContent } from "./information-data";

export const policyDrafts: InformationPageContent[] = [
  {
    path: "/privacy", label: "Privacy", category: "Privacy policy · Review draft",
    title: "Your information, explained.",
    intro: "This draft describes the information involved in using avoro and the questions to bring to us about your data.",
    notice: "Draft for review — not a finalized privacy policy. The operator’s details, retention periods, service providers, and applicable privacy rights must be confirmed before publication.",
    sections: [
      { title: "Information you provide", paragraphs: ["Account features use information such as your email address, name, account role, and sign-in credentials. A tech profile can include business details, a service area, portfolio images, service descriptions, prices, and social links.", "Depending on the features you use, avoro also handles saved artists, reviews, referral information, appointment details, and messages. Information you send to the contact inbox is part of your support inquiry."] },
      { title: "How features use information", paragraphs: ["Account information supports sign-in and account recovery. Profile and service information supports artist discovery. Booking information supports appointment scheduling and management. When messaging is enabled, message content and conversation records support communication between participants.", "Location search uses the place you enter. If you choose the location button and grant browser permission, coordinates are used to find a corresponding location for your search."] },
      { title: "Public information and service providers", paragraphs: ["Published profiles, portfolio images, service information, and reviews are intended to be visible to people browsing avoro. Keep information you do not want public out of those fields.", "Some features involve external providers, such as location lookup, transactional email, and hosted subscription checkout. The final policy must identify the providers actually used in the deployed service and explain the relevant data sharing."] },
      { title: "Questions and requests", paragraphs: ["Contact hello@avoro.app to ask about your account information or a privacy concern. Describe your request without sending passwords, card details, or identity documents in the initial email.", "The final policy must explain the request process, applicable rights, retention and deletion practices, international processing, and how policy updates are communicated. Those details are not established by this draft."] }
    ], action: { label: "Ask a privacy question", to: "mailto:hello@avoro.app?subject=Privacy%20question" }
  },
  {
    path: "/terms", label: "Terms", category: "Terms of service · Review draft",
    title: "Clear expectations, from the start.",
    intro: "This draft outlines how the marketplace works and the expectations proposed for people using avoro.",
    notice: "Draft for review — not final terms of service. This page does not establish a new binding agreement. Business, billing, eligibility, and jurisdiction-specific terms still require approval.",
    sections: [
      { title: "The role of avoro", paragraphs: ["avoro provides tools for discovering independent beauty professionals, presenting services, and managing available account and appointment features. Artists describe and deliver their own beauty services.", "Customers should confirm service details, prices, appointment locations, and artist policies before booking. A listing or review does not itself certify an artist’s credentials or guarantee an outcome."] },
      { title: "Accounts and content", paragraphs: ["The proposed community expectations are simple: provide accurate information, protect your account credentials, and use only photos and content you have permission to share.", "Do not impersonate others, publish private information without permission, submit misleading reviews, or use the service to harass people. Any final content license, moderation process, and account suspension provisions must be reviewed separately."] },
      { title: "Appointments and subscriptions", paragraphs: ["An artist’s appointment and cancellation policies are separate from an avoro tech subscription. Read the details shown for your appointment and clarify any questions with the artist.", "The pricing page currently identifies its plans as a preview. Final subscription availability, renewal, cancellation, refunds, taxes, and referral terms must be confirmed before relying on an offer. This draft does not create additional payment obligations."] },
      { title: "Questions and final terms", paragraphs: ["Contact us if you need clarification about using avoro. Do not assume that an unaddressed billing or service question is resolved by this draft.", "Final terms still need the confirmed legal operator, eligibility requirements, effective date, governing law, dispute process, and any appropriate liability provisions. These decisions are intentionally not invented here."] }
    ], action: { label: "Contact us about the terms", to: "/contact" }
  },
  {
    path: "/cookies", label: "Cookie Policy", category: "Cookie policy · Review draft",
    title: "The small details behind your session.",
    intro: "Cookies and browser storage help certain features remember information between requests. This draft explains the uses identified in the application.",
    notice: "Draft for review — not a complete deployed-site cookie inventory. Confirm production cookies, providers, durations, and any required consent controls before publication.",
    sections: [
      { title: "Keeping you signed in", paragraphs: ["avoro uses a cookie named find_my_tech_session to connect authenticated requests to your account. Its configured lifetime is 30 days. It is HTTP-only, which means application JavaScript cannot read it directly.", "Blocking or removing the session cookie can prevent account features from working or require you to sign in again. Browsing public pages does not require creating an account."] },
      { title: "Remembering a referral", paragraphs: ["The application uses session storage under find-my-tech:pending-referral-code to temporarily retain a referral code during the signup flow. Session storage is browser storage associated with a tab; it is separate from a cookie.", "This helps carry the code into profile creation. Clearing browser site data may remove the saved code, so keep your invitation if you need to enter it again."] },
      { title: "External services", paragraphs: ["If you follow a link to an external service, such as hosted subscription checkout or Instagram, that service may use its own cookies under its own policies.", "The production environment must be checked for any additional analytics, advertising, embedded content, or hosting cookies. This draft does not claim that an audit of those services has been completed."] },
      { title: "Your browser controls", paragraphs: ["Your browser settings let you inspect and remove cookies and other site data. The exact controls vary by browser. Removing site data may sign you out or clear temporary information.", "Questions about a cookie or storage entry associated with avoro can be sent to hello@avoro.app. Please share the entry’s name rather than its value, which could contain private session information."] }
    ], action: { label: "Read the privacy draft", to: "/privacy" }
  }
];
