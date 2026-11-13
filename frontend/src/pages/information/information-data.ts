import { policyDrafts } from "./policy-drafts";

export type InformationPageContent = {
  path: string;
  label: string;
  category: string;
  title: string;
  intro: string;
  notice?: string;
  sections: { title: string; paragraphs: string[] }[];
  action: { label: string; to: string };
};

export const informationPages: InformationPageContent[] = [
  ...policyDrafts,
  {
    path: "/reviews", label: "Reviews", category: "For customers",
    title: "A little perspective. A better fit.",
    intro: "An artist’s portfolio shows their style. Client feedback adds another perspective. Use both to decide who feels right for your next appointment.",
    sections: [
      { title: "Read beyond the rating", paragraphs: ["Open an artist’s profile to see the reviews available for that artist. Look for details about the service, communication, and overall experience, alongside the date and rating.", "A new artist may have fewer reviews. Compare their portfolio and service descriptions, and ask questions before making your decision."] },
      { title: "Share your own experience", paragraphs: ["If you leave feedback, keep it specific and based on your own experience. Describe the service you received, what worked well, and anything that could have been clearer.", "Keep private contact details, someone’s home address, and sensitive personal information out of a public review. A review should help another customer understand the experience."] },
      { title: "What a review can tell you", paragraphs: ["Reviews reflect individual opinions. They are not a guarantee of a particular result or proof of an artist’s credentials. Confirm qualifications and service details directly with the artist when those matter to your choice.", "If you are concerned about a review or profile, contact us with a link and a short explanation so we can understand the issue."] }
    ], action: { label: "Explore artist profiles", to: "/discover" }
  },
  {
    path: "/safety", label: "Safety", category: "For customers",
    title: "Feel informed before you book.",
    intro: "A good appointment starts with clear expectations. Take time to understand the service, the artist, and the arrangements before committing.",
    sections: [
      { title: "Get the details first", paragraphs: ["Review the artist’s portfolio and service menu. Confirm the service, total price, expected duration, location, and any deposit or cancellation policy directly with the artist.", "Ask about relevant qualifications and how tools and workspaces are cleaned. A profile or review on avoro is not a certification or a guarantee of an artist’s work."] },
      { title: "Protect your personal information", paragraphs: ["Share only the information needed for the appointment. Never share your password or account verification codes. Keep private addresses and sensitive details out of reviews and public profile text.", "For an unfamiliar appointment location, consider sharing your plans with someone you trust. If arrangements feel uncomfortable or change unexpectedly, pause and ask questions."] },
      { title: "Check payment arrangements", paragraphs: ["Confirm who you are paying and what the payment covers before sending money. Artist service payments and an avoro tech subscription are different purchases.", "Be cautious of unexpected payment requests or links. If a message claims to be from avoro and you are unsure, contact us through the contact page."] },
      { title: "Tell us about a concern", paragraphs: ["Send the profile link, approximate date, and a brief description to our contact address. Do not send passwords, payment-card details, or other sensitive information.", "For immediate danger, contact your local emergency services. The avoro contact inbox is not an emergency service."] }
    ], action: { label: "Contact avoro", to: "/contact" }
  },
  {
    path: "/referrals", label: "Referral Program", category: "For techs",
    title: "Good work deserves good company.",
    intro: "Know a nail or lash artist who would feel at home here? Introduce them to avoro and help more independent work get discovered.",
    sections: [
      { title: "Make the introduction", paragraphs: ["Share avoro with a fellow beauty professional. They can explore the platform, compare the proposed plans, and create a tech profile when they are ready.", "If you have a referral code, share that code with your invitation. During signup, they can choose ‘Have a referral code?’ and enter it before publishing their profile."] },
      { title: "Give their work room to shine", paragraphs: ["Encourage them to choose portfolio photos that represent their own work, write clear service descriptions, and select their business city. A useful profile helps local customers understand what makes their work distinct."] },
      { title: "About referral rewards", paragraphs: ["The For Techs page describes a planned free-month reward when paid subscriptions launch. Reward eligibility, timing, and redemption details still need to be confirmed; entering a code does not apply an immediate billing credit.", "For questions about your referral code or the planned offer, contact us before relying on a reward."] }
    ], action: { label: "Explore joining avoro", to: "/for-techs" }
  },
  {
    path: "/community", label: "Tech Community", category: "For techs",
    title: "Independent doesn’t have to mean alone.",
    intro: "A place starts with the people who shape it. We want to hear from the nail and lash professionals building their businesses, one client at a time.",
    sections: [
      { title: "Help shape what comes next", paragraphs: ["Tell us what makes running your business easier, what gets in the way, and what you would want from a community of fellow artists. Specific examples help us understand the work behind the appointment.", "There is no separate community forum or event calendar available here yet. For now, our contact inbox is the place to share ideas and ask about participating."] },
      { title: "Start with something useful", paragraphs: ["Browse the journal for practical ideas on presenting your portfolio and setting expectations with clients. Share avoro with a professional whose work you admire, or help someone put together their first profile."] },
      { title: "Make room for different paths", paragraphs: ["Artists arrive with different specialties, experience levels, and business goals. When sharing feedback or advice, respect those differences, credit other people’s work, and protect client privacy."] }
    ], action: { label: "Share an idea", to: "mailto:hello@avoro.app?subject=Tech%20community" }
  },
  {
    path: "/about", label: "About", category: "About avoro",
    title: "Beauty, discovered locally.",
    intro: "avoro helps people discover independent nail and lash artists through their work, their services, and their local presence.",
    sections: [
      { title: "Start with the work", paragraphs: ["Finding an artist is personal. A style you love, a service you need, and a location that fits your day all matter. avoro brings those details together so you can explore with more context.", "Browse portfolios, compare service information, and read available client feedback before deciding who to contact or book."] },
      { title: "Built for independent professionals", paragraphs: ["For techs, a profile is a home for the work you want people to see. Present your services, show your style, and help nearby customers understand your business.", "Our focus is a direct connection between artists and clients. Artists define their services and appointment policies; customers choose the fit that works for them."] },
      { title: "Growing with the people who use it", paragraphs: ["avoro is developing around nail and lash discovery. Feedback from customers and professionals helps us understand where the experience needs to improve.", "Have a question, an idea, or a story about finding your artist? We would like to hear it."] }
    ], action: { label: "Find your next artist", to: "/discover" }
  },
  {
    path: "/blog", label: "Blog", category: "The avoro journal",
    title: "Good questions. Thoughtful appointments.",
    intro: "A few practical starting points for discovering an artist, presenting your work, and making the details easier to talk about.",
    sections: [
      { title: "How to read a portfolio", paragraphs: ["Start with the service you actually want. A dramatic design may catch your eye, but examples of the shape, finish, or lash style you are looking for are more useful when choosing an artist.", "Look across several examples rather than one favorite image. Notice consistency and the range of work shown. Save a few references, then ask the artist what is realistic for your appointment.", "Pair the photos with the service menu and available reviews. Together, they give you a more useful starting point than any one picture or rating."] },
      { title: "Five details to confirm before booking", paragraphs: ["Confirm the exact service and what is included. Ask about the total price, including any removal, extra design work, or other additions you are considering.", "Check the expected appointment length and location. Read the cancellation or rescheduling policy, and clarify any deposit arrangements before paying.", "Finish by asking how to prepare and what the artist needs to know in advance. A short conversation now can prevent a misunderstanding on the day."] },
      { title: "A profile that sounds like your business", paragraphs: ["For artists, a useful profile answers three questions: what do you do, where do you work, and what does your style look like? Lead with your specialties and write service descriptions in language a new client can understand.", "Choose photos of your own work that reflect what you currently offer. Avoid including identifying client details without permission, and keep your service information up to date.", "You do not need to sound like everyone else. A clear description of your approach gives clients a reason to choose you for the work you enjoy doing."] }
    ], action: { label: "Explore local artists", to: "/discover" }
  },
  {
    path: "/careers", label: "Careers", category: "Build with us",
    title: "Care about the people behind the work?",
    intro: "We are building around independent beauty professionals and the customers who want to find them. That starts with paying attention to real needs.",
    sections: [
      { title: "What we are working on", paragraphs: ["Making portfolios easier to discover. Helping service details feel clear. Giving artists a useful presence for their businesses. These are the kinds of problems that shape avoro."] },
      { title: "Open roles", paragraphs: ["There are no specific job listings published on this page. We are not asking you to apply for an unlisted position or promising an interview.", "If you would like to introduce yourself, email a short note about your work, the problems you enjoy solving, and a portfolio or professional link if you have one."] },
      { title: "Keep the introduction simple", paragraphs: ["Please do not include identity documents, financial details, or other sensitive information. A short introduction is enough to start a conversation when there is a relevant opportunity."] }
    ], action: { label: "Introduce yourself", to: "mailto:hello@avoro.app?subject=Working%20with%20avoro" }
  },
  {
    path: "/contact", label: "Contact", category: "Get in touch",
    title: "Let’s get you to the right place.",
    intro: "Questions about avoro, your profile, or your account? Email hello@avoro.app with a little context so we can understand what you need.",
    sections: [
      { title: "Account and profile help", paragraphs: ["Describe what you were trying to do and what happened instead. Include the relevant page or profile link, and the text of any error message. Never include your password or a verification code.", "For subscription questions, tell us which plan or billing issue you are asking about. Do not send full card numbers or payment credentials."] },
      { title: "Questions about an appointment", paragraphs: ["For service details, timing, prices, or an artist’s policies, contact the artist directly using the options available on their profile. They are best placed to explain their own services.", "If the issue is with the avoro booking experience, describe the problem and the approximate appointment date in your email."] },
      { title: "Feedback, concerns, and collaborations", paragraphs: ["For a profile or review concern, include a link and explain what needs attention. For product feedback or a collaboration idea, tell us what you have in mind and why it would help the people using avoro.", "This inbox is not an emergency service. If someone is in immediate danger, contact local emergency services."] }
    ], action: { label: "Email hello@avoro.app", to: "mailto:hello@avoro.app" }
  }
];
