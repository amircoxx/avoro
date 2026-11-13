# Account Password Change Design

## Goal

Allow any authenticated customer or technician to change their password from Account Settings without an email verification-link flow.

## User experience

Account Settings gains a `Password` item beside `General` in the existing settings navigation. Selecting it keeps the user inside the same modal and shows a focused form with:

- Current password
- New password
- Confirm new password

The new password must contain 12–200 characters. The confirmation must exactly match before a request is sent. The footer action becomes `Change password` while this section is active. A successful change clears all password fields, keeps the modal open, and shows `Password updated.`. General account editing retains its existing fields, save action, and success behavior.

## API contract

Add `PUT /api/auth/password` with this request body:

```json
{
  "currentPassword": "existing password",
  "newPassword": "new password with at least 12 characters"
}
```

The endpoint requires the existing HTTP-only session cookie. It returns:

```json
{
  "data": {
    "passwordChanged": true
  }
}
```

The confirmation password is a browser-only validation field and is never sent to the server.

## Backend behavior

1. Require the current authenticated user.
2. Validate `currentPassword` as 1–200 characters and `newPassword` as 12–200 characters.
3. Load the authenticated user's password hash.
4. Verify `currentPassword` with the existing versioned scrypt service.
5. Return HTTP 401 with code `invalid_current_password` and message `Current password is incorrect` when verification fails.
6. Hash `newPassword` with a new random salt and persist it.
7. Revoke every other non-revoked session for that user while preserving the session that submitted the request.
8. Return `passwordChanged: true` without exposing any password or hash data.

The current session remains signed in so the successful action does not abruptly close Account Settings. Other devices must authenticate again.

## Frontend architecture

- `frontend/src/services/api/auth.ts` owns the browser request and typed payload.
- `frontend/src/facades/account.facade.ts` exposes the page-facing password-change workflow.
- `AccountSettingsModal` owns active-section state, password field state, confirmation validation, saving state, and success/error toasts.
- `AccountTextField` accepts optional autocomplete metadata so password managers receive `current-password` and `new-password` semantics.

The password and General sections share the modal shell but submit independently through section-specific handlers. Switching sections does not submit or alter either form.

## Error handling

- Missing authentication uses the existing `unauthorized` response.
- Incorrect current password uses `invalid_current_password`.
- Invalid lengths use the existing `validation_error` envelope.
- Mismatched confirmation is rejected in the browser with `New passwords do not match.` and no network request.
- Unknown failures use the existing API reader and settings error-toast conventions.

Password inputs are cleared after success. They are never logged, stored in account context, returned by the API, or copied into the general account update payload.

## Verification

- Backend API tests cover authentication, incorrect current password, hashing/persistence, preservation of the active session, and revocation of other sessions.
- Frontend service and facade tests cover the exact request payload and delegation.
- Account Settings tests cover navigation, password-field autocomplete values, mismatch rejection, successful submission, field clearing, and unchanged General behavior.
- Run frontend and backend typechecks and the full automated test suite.
- Verify the Account Settings modal in a real browser at desktop and mobile widths, including General/Password navigation, mismatch handling, successful save behavior, and no horizontal overflow.

## Out of scope

- Email verification links
- Forgotten-password or logged-out reset flows
- Password-strength meters or breach-database checks
- Multi-factor authentication
- Database schema changes
