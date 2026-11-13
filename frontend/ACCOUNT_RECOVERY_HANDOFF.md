# Account recovery frontend handoff

Password recovery is connected to the backend through the frontend API service. Email verification remains an unavailable callback until its separate backend feature is implemented.

## Open the screens

- Existing **Log in → Forgot password?** opens recovery inside the shared account dialog and carries over the email address.
- `/forgot-password` is the standalone email-request screen.
- `/reset-password?token=...` is the new-password screen. Missing tokens show a request-new-link state.
- `/verify-email?token=...` asks the user to confirm verification. `/verify-email` without a token lets them request a verification email.
- `/dev/account-recovery` is a development-only interactive preview. Select a screen and a simulated response. It makes no recovery requests, sends no emails, and changes no accounts. Its code is excluded from production routing/builds. The preview's Back to log in button restarts the selected demo; the real screens open login.

## Backend connections

`src/components/layout/account/account-recovery-actions.ts` defines four callback handoff points:

| Callback | Input | Resolve when |
| --- | --- | --- |
| `requestReset` | Email string | Server accepts the reset request |
| `resetPassword` | `{ token, newPassword }` | Server confirms password changed |
| `verifyEmail` | Token string | Server confirms email verified |
| `resendVerification` | Email string | Server accepts the verification request |

`requestReset` calls `POST /api/auth/forgot-password` with `{ email }`.
`resetPassword` calls `POST /api/auth/reset-password` with `{ token, newPassword }`.
Both operations live in `src/services/api/auth.ts`; the callback adapter translates API errors into panel states. The panel also accepts an `actions` prop for tests and the development preview. Success appears only after the request resolves. `verifyEmail` and `resendVerification` still reject with an unavailable message and never call `fetch`.

Map backend failures to `AccountRecoveryError`:

- `expired`: expired, invalid, or already-used link; shows the request-new-link action.
- `rate_limited`, with retry seconds: shows a local countdown and disables submitting until it elapses.
- `unavailable`: shows the unavailable message.
- Other rejected errors show a generic retry message, without exposing raw server details.

The request-confirmation copy deliberately does not confirm whether an account exists. The frontend validates email format, checks passwords match, and uses the existing 12–200 character password limits. These are UI checks only. The backend validates input, enforces token expiry and single use, and limits reset requests by email and IP. A refresh resets local countdown state; the server must enforce limits independently.

Registration/login and their session behavior remain as before. There is no new emailVerified field, automatic post-signup verification gate, or verification banner: connect those entry points when your backend supplies verification state. Reset/verification success does not automatically log anyone in. Tokens/passwords are not written to browser storage. Token query parameters remain in the URL until navigation; decide the final link and token-consumption policy during integration.

## Verification

Focused tests cover login/recovery navigation and focus, pending/success transitions, missing/expired links, mismatched passwords, exact reset API payloads, expired-token error translation, retry delays and fallback, network failure, and retry disabling. The development preview allows manual inspection of all result states.
