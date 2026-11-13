# Account Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated customers and technicians securely change their password from Account Settings without an email verification-link flow.

**Architecture:** Add a dedicated authenticated endpoint that verifies the current password, stores a fresh scrypt hash, and revokes other sessions while preserving the active session. Expose it through the frontend API/facade boundary, then add a Password section to the existing settings modal with independent validation and submission behavior.

**Tech Stack:** Express, Prisma, Zod, Node scrypt, React 19, TypeScript, Vitest, happy-dom, Supertest

## Global Constraints

- Require the current password and enforce 12–200 characters for the new password.
- Keep the submitting session signed in and revoke every other active session for the user.
- Never return, log, or place password hashes in frontend state.
- Keep General account editing unchanged.
- Do not add verification links, logged-out reset flows, MFA, dependencies, or migrations.

---

### Task 1: Add the password-change backend contract

**Files:**
- Create: `backend/src/__tests__/auth-password.api.test.ts`
- Create: `backend/src/services/__tests__/session-password-change.test.ts`
- Modify: `backend/src/validations/auth.schema.ts`
- Modify: `backend/src/services/session.service.ts`
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`

**Interfaces:**
- Consumes: the current session cookie, `verifyPassword`, `hashPassword`, and `User.passwordHash`.
- Produces: `PUT /api/auth/password`, `passwordChangeInputSchema`, and `revokeOtherUserSessions(userId: string, activeToken: string)`.

- [ ] **Step 1: Write failing password API tests**

Create an API test using the existing hoisted-mock/Supertest pattern. Mock `requireCurrentUser`, `parseSessionCookie`, `revokeOtherUserSessions`, `verifyPassword`, `hashPassword`, `prisma.user.findUnique`, and `prisma.user.update`. Cover these exact assertions:

```ts
expect(unauthenticated.status).toBe(401);
expect(incorrect.body).toEqual({
  error: { code: "invalid_current_password", message: "Current password is incorrect" }
});
expect(shortPassword.status).toBe(422);
expect(success.body).toEqual({ data: { passwordChanged: true } });
expect(password.verifyPassword).toHaveBeenCalledWith("current password", "stored-hash");
expect(database.prisma.user.update).toHaveBeenCalledWith({
  where: { id: "user-1" },
  data: { passwordHash: "new-hash" }
});
expect(session.revokeOtherUserSessions).toHaveBeenCalledWith("user-1", "active-token");
```

Use `{ currentPassword: "current password", newPassword: "new password 12345" }` as the valid body and send `find_my_tech_session=active-token` on success.

- [ ] **Step 2: Write the failing session-revocation test**

Mock `prisma.userSession.updateMany`, call `revokeOtherUserSessions("user-1", "active-token")`, and assert:

```ts
expect(database.prisma.userSession.updateMany).toHaveBeenCalledWith({
  where: {
    userId: "user-1",
    revokedAt: null,
    tokenHash: { not: hashSessionToken("active-token") }
  },
  data: { revokedAt: expect.any(Date) }
});
```

- [ ] **Step 3: Run the backend tests and verify RED**

```bash
npm test --workspace @find-my-tech/backend -- src/__tests__/auth-password.api.test.ts src/services/__tests__/session-password-change.test.ts
```

Expected: FAIL because the route and revocation helper do not exist.

- [ ] **Step 4: Implement validation and other-session revocation**

Add to `auth.schema.ts`:

```ts
export const passwordChangeInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema
});
export type PasswordChangeInput = z.infer<typeof passwordChangeInputSchema>;
```

Add to `session.service.ts`:

```ts
export async function revokeOtherUserSessions(userId: string, activeToken: string) {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null, tokenHash: { not: hashSessionToken(activeToken) } },
    data: { revokedAt: new Date() }
  });
}
```

- [ ] **Step 5: Implement and route the controller**

Add `changePassword` to `auth.controller.ts`:

```ts
export async function changePassword(request: Request, response: Response, next: NextFunction) {
  try {
    const currentUser = await requireCurrentUser(request.headers.cookie);
    const input = passwordChangeInputSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { passwordHash: true } });
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new AppError("Current password is incorrect", 401, "invalid_current_password");
    }
    const activeToken = parseSessionCookie(request.headers.cookie ?? null);
    if (!activeToken) throw new AppError("Authentication required", 401, "unauthorized");
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { passwordHash: await hashPassword(input.newPassword) }
    });
    await revokeOtherUserSessions(currentUser.id, activeToken);
    response.json({ data: { passwordChanged: true } });
  } catch (error) { next(error); }
}
```

Import the schema/helper and register `authRouter.put("/password", changePassword)`.

- [ ] **Step 6: Verify GREEN and commit**

Run the Step 3 command. Expected: both files pass with five tests. Then commit only the Task 1 files with message `feat: add authenticated password changes`.

---

### Task 2: Add the frontend API and facade

**Files:**
- Create: `frontend/src/services/__tests__/auth.test.ts`
- Modify: `frontend/src/services/api/auth.ts`
- Modify: `frontend/src/facades/account.facade.ts`
- Modify: `frontend/src/facades/__tests__/account.facade.test.ts`

**Interfaces:**
- Consumes: `PUT /api/auth/password` from Task 1.
- Produces: `changePassword(input)` and `changeAccountPassword(input)`.

- [ ] **Step 1: Write failing client/facade tests**

The client test must stub `fetch`, call `changePassword`, and assert:

```ts
expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", {
  method: "PUT",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ currentPassword: "current password", newPassword: "new password 12345" })
});
```

Extend the facade mock with `changePassword`, call `changeAccountPassword` with the same object, and assert exact delegation.

- [ ] **Step 2: Run the tests and verify RED**

```bash
npm test --workspace @find-my-tech/frontend -- src/services/__tests__/auth.test.ts src/facades/__tests__/account.facade.test.ts
```

Expected: FAIL because both exports are missing.

- [ ] **Step 3: Implement the client and facade**

Add to `frontend/src/services/api/auth.ts`:

```ts
export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const response = await fetch(apiUrl("/api/auth/password"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  await readApiResponse<{ passwordChanged: true }>(response, "Password could not be updated");
}
```

Add to `account.facade.ts`:

```ts
export function changeAccountPassword(input: { currentPassword: string; newPassword: string }) {
  return changePassword(input);
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run the Step 2 command. Expected: both test files pass. Commit only Task 2 files with message `feat: add password change client`.

---

### Task 3: Add Password to Account Settings

**Files:**
- Create: `frontend/src/components/layout/__tests__/account-settings-modal.test.tsx`
- Modify: `frontend/src/components/layout/account-text-field.tsx`
- Modify: `frontend/src/components/layout/account-settings-modal.tsx`
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

**Interfaces:**
- Consumes: `changeAccountPassword` and the existing settings shell.
- Produces: General/Password navigation and current/new/confirmation password inputs.

- [ ] **Step 1: Write failing settings tests**

Render `AccountSettingsModal` directly in happy-dom with mocked facade and toast modules. Test:

```ts
await act(async () => buttonNamed(container, "Password")?.click());
expect(inputNamed(container, "Current password")?.autocomplete).toBe("current-password");
expect(inputNamed(container, "New password")?.autocomplete).toBe("new-password");
expect(inputNamed(container, "Confirm new password")?.autocomplete).toBe("new-password");
expect(buttonNamed(container, "Change password")).not.toBeNull();
```

Submit mismatched values and assert `changeAccountPassword` was not called plus `toast.error("New passwords do not match.")`. Submit matching values and assert the exact facade payload, cleared fields, and `toast.success("Password updated.")`. Also assert General still shows Full name, Email address, and Save changes.

- [ ] **Step 2: Run focused settings tests and verify RED**

```bash
npm test --workspace @find-my-tech/frontend -- src/components/layout/__tests__/account-settings-modal.test.tsx src/components/layout/__tests__/beauty-shell-accessibility.test.ts
```

Expected: FAIL because Password navigation and fields are absent.

- [ ] **Step 3: Add password-manager autocomplete support**

Add `autoComplete?: string` to `AccountTextField` and pass `autoComplete={autoComplete}` to its existing input without changing any other attributes or classes.

- [ ] **Step 4: Implement section state and password submission**

In `AccountSettingsModal`:

- Import `KeyRound` and `changeAccountPassword`.
- Add `activeSection: "general" | "password"`, password field state, and `isChangingPassword`.
- Add General/Password nav buttons with conditional `is-active` and `aria-current="page"`.
- Keep the account identity card visible in both sections.
- Keep the existing personal details for General.
- Render Current password (`current-password`), New password (`new-password`), and Confirm new password (`new-password`) for Password.
- Reject mismatches before calling the facade.
- On success clear all password fields and show `Password updated.`.
- Change header and footer text/button labels based on the active section.

Use this Password copy:

```tsx
<p className="editorial-kicker">Account security</p>
<h2 id="account-settings-title">Password</h2>
<h3 id="password-details-title">Change your password</h3>
<p>Use at least 12 characters. Other devices will be signed out.</p>
```

- [ ] **Step 5: Update accessibility regression coverage**

Replace the fixed source assertion that only accepts `General` with assertions that the labeled heading can render General or Password. Require both nav labels, conditional active classes, and conditional `aria-current`.

- [ ] **Step 6: Verify GREEN and commit**

Run the Step 2 command plus `npm run typecheck --workspace @find-my-tech/frontend`. Expected: focused tests and typecheck pass. Commit only Task 3 files with message `feat: add password settings`.

---

### Task 4: Verify the full flow

**Files:**
- Verification only.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: complete automated and browser evidence.

- [ ] **Step 1: Run full verification**

```bash
npm test
npm run typecheck --workspaces --if-present
```

Expected: all enabled tests pass; the existing database concurrency tests may remain skipped by their guard.

- [ ] **Step 2: Verify desktop and mobile behavior**

Open Account Settings, confirm General remains intact, switch to Password, verify all autocomplete attributes, mismatch handling, successful update/field clearing, active-session preservation, mobile navigation, and no horizontal overflow. Use the local backend request flow, not markup-only verification.

- [ ] **Step 3: Review diff hygiene**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and unrelated pre-existing changes remain unstaged.
