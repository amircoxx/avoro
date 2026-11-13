# Tech Signup Referral-Code Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let prospective techs optionally reveal and type a referral code while creating a tech account, without changing any backend request or persistence behavior.

**Architecture:** Keep the code as local React state in each of the two existing tech-registration surfaces. A button reveals the optional input only in a new-tech state; the value is intentionally excluded from `registerUser`, so account creation continues to use the established payload and backend contract.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Vitest, happy-dom.

## Global Constraints

- Frontend-only: do not modify API payloads, backend validation, database schema, or referral persistence.
- The referral code is optional and never blocks account creation.
- Show the entry question only for new tech accounts; it must be absent for customer and login states.
- Preserve the existing signup forms and error handling.

---

## File structure

| File | Responsibility |
| --- | --- |
| `frontend/src/components/layout/beauty-shell.tsx` | Shared auth-modal tech registration UI and local referral field state. |
| `frontend/src/pages/for-techs-page.tsx` | Dedicated tech onboarding auth UI and local referral field state. |
| `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts` | Source-level regression checks for shared-modal state visibility and unchanged registration request. |
| `frontend/src/pages/__tests__/for-techs-page.test.ts` | Source-level regression checks for dedicated tech onboarding visibility and unchanged registration request. |

### Task 1: Cover the shared account modal

**Files:**
- Modify: `frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`
- Modify: `frontend/src/components/layout/beauty-shell.tsx:409-535`

**Interfaces:**
- Consumes: existing `registerUser({ email, password, fullName, role })`.
- Produces: an optional, local-only `referralCode` field for a new `TECH` registration.

- [ ] **Step 1: Write the failing test**

Add this test to `beauty-shell-accessibility.test.ts`:

```ts
it("offers an optional referral-code field only for new tech accounts", () => {
  const source = readFileSync(new URL("../beauty-shell.tsx", import.meta.url), "utf8");

  expect(source).toMatch(/const \[isReferralCodeVisible, setIsReferralCodeVisible\] = useState\(false\);/);
  expect(source).toMatch(/mode === "register" && role === "TECH" \? \([\s\S]*Have a referral code\?[\s\S]*setIsReferralCodeVisible\(true\)/);
  expect(source).toMatch(/isReferralCodeVisible \? \([\s\S]*label="Referral code"/);
  expect(source).toMatch(/registerUser\(\{[\s\S]*email: form\.email,[\s\S]*password: form\.password,[\s\S]*fullName: form\.fullName \|\| undefined,[\s\S]*role[\s\S]*\}\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: FAIL because `isReferralCodeVisible` and the referral-code question do not exist.

- [ ] **Step 3: Write the minimal implementation**

In `AccountAuthModal`, add a `const [isReferralCodeVisible, setIsReferralCodeVisible] = useState(false);` state value and extend `form` with `referralCode: ""`. Directly after the account-type selector, render this tech-only block:

```tsx
{role === "TECH" ? (
  <div>
    {isReferralCodeVisible ? (
      <AuthTextField
        label="Referral code"
        value={form.referralCode}
        placeholder="MUSE-123"
        onChange={(value) => setForm({ ...form, referralCode: value })}
      />
    ) : (
      <button
        type="button"
        onClick={() => setIsReferralCodeVisible(true)}
        className="text-sm font-medium text-primary hover:text-rose-700"
      >
        Have a referral code?
      </button>
    )}
  </div>
) : null}
```

When switching the role to Customer, set `isReferralCodeVisible` to `false`. Do not pass `form.referralCode` to `registerUser`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/beauty-shell.tsx frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts
git commit -m "feat: add referral code entry to tech signup"
```

### Task 2: Cover the dedicated For Techs signup modal

**Files:**
- Create: `frontend/src/pages/__tests__/for-techs-page.test.ts`
- Modify: `frontend/src/pages/for-techs-page.tsx:20-180`

**Interfaces:**
- Consumes: existing `registerUser({ email, password, role: "TECH", fullName })`.
- Produces: an optional, local-only referral-code field during dedicated tech registration.

- [ ] **Step 1: Write the failing test**

Create `for-techs-page.test.ts` containing:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ForTechsPage signup", () => {
  it("offers an optional referral-code field for new tech accounts only", () => {
    const source = readFileSync(new URL("../for-techs-page.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/const \[isReferralCodeVisible, setIsReferralCodeVisible\] = useState\(false\);/);
    expect(source).toMatch(/authMode === "register" \? \([\s\S]*Have a referral code\?[\s\S]*setIsReferralCodeVisible\(true\)/);
    expect(source).toMatch(/isReferralCodeVisible \? \([\s\S]*label="Referral code"/);
    expect(source).toMatch(/registerUser\(\{[\s\S]*email: authForm\.email,[\s\S]*password: authForm\.password,[\s\S]*role: "TECH",[\s\S]*fullName: authForm\.name[\s\S]*\}\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run frontend/src/pages/__tests__/for-techs-page.test.ts`

Expected: FAIL because the referral-code visibility state and UI do not exist.

- [ ] **Step 3: Write the minimal implementation**

Extend `authForm` with `referralCode: ""` and add `isReferralCodeVisible` state. In the `authMode === "register"` section, after Full name, render the same button-or-field pattern using the page’s existing `TextField`:

```tsx
{isReferralCodeVisible ? (
  <TextField
    label="Referral code"
    value={authForm.referralCode}
    placeholder="MUSE-123"
    onChange={(value) => setAuthForm({ ...authForm, referralCode: value })}
  />
) : (
  <button
    type="button"
    onClick={() => setIsReferralCodeVisible(true)}
    className="text-left text-sm font-medium text-primary hover:text-rose-700"
  >
    Have a referral code?
  </button>
)}
```

When the mode switches to Log in, reset `isReferralCodeVisible` to `false`. Do not pass `authForm.referralCode` to `registerUser`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run frontend/src/pages/__tests__/for-techs-page.test.ts`

Expected: PASS.

- [ ] **Step 5: Run frontend verification**

Run: `npm test -- --run frontend/src/components/layout/__tests__/beauty-shell-accessibility.test.ts frontend/src/pages/__tests__/for-techs-page.test.ts && npm run typecheck && npm run build`

Expected: all tests pass, TypeScript exits with code 0, and Vite produces a production build.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/for-techs-page.tsx frontend/src/pages/__tests__/for-techs-page.test.ts
git commit -m "feat: add referral code entry to tech onboarding"
```

## Plan self-review

- Spec coverage: Tasks 1 and 2 cover both required tech-registration surfaces, the optional reveal behavior, local-only state, unchanged signup requests, and regression coverage.
- Placeholder scan: no incomplete requirements or deferred implementation text remain.
- Type consistency: both tasks retain the established `registerUser` argument shape and treat the referral code solely as component-local state.
