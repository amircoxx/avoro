# Footer pages

The footer uses real React Router links. Public information routes are registered
from `frontend/src/pages/information/information-data.ts` and rendered using the
shared editorial layout in `information-page.tsx`. All pages are readable without
an account. Contact actions open an email client; no message is sent by the app.

## Content scope

- Reviews explains how to assess feedback; it does not invent testimonials or
  claim that reviews are verified against completed appointments.
- Safety covers appointment expectations, personal information, and reporting.
- Referrals explains the existing signup field and distinguishes a planned
  reward from an applied billing credit.
- Community invites feedback without inventing a forum or event calendar.
- About describes the marketplace without invented company history or metrics.
- Blog contains three complete short editorial guides on the page.
- Careers accepts introductions without inventing vacancies.
- Contact uses the existing `hello@avoro.app` address.

## Policy review required before publication

Privacy, Terms, and Cookie Policy are explicitly labeled drafts. They are not
approved legal policies. Confirm the following with the business owner and the
appropriate legal reviewer before replacing the notices or deploying them:

- Legal operator, address, effective dates, operating jurisdictions, eligibility.
- Actual production data flows, hosting and payment/email/location providers,
  recipients, international processing, retention and deletion practices.
- Privacy request procedures and applicable rights, including how requests are
  authenticated and fulfilled.
- Production cookie/storage inventory and any required consent controls.
- Subscription availability, renewals, cancellations, refunds, taxes, referrals.
- Content permissions, moderation, termination, dispute and liability provisions.

Code evidence: `backend/src/services/session.service.ts` (HTTP-only 30-day session),
`frontend/src/utils/pending-referral.ts` (tab session storage), review/referral
services, pricing preview data, and the architecture/setup documentation.
No production tracking audit was performed. Do not infer absence of analytics
from the application code alone.

The [FTC privacy guidance](https://www.ftc.gov/business-guidance/privacy-security)
emphasizes accurately describing actual data practices and honoring stated
privacy promises. It does not establish which jurisdictions or laws apply here.
