/** Browser API operations for registration, authentication, and account details. */
import { apiUrl, readApiResponse } from "./client";
import type { AuthUser } from "./types";

export async function getCurrentUser() {
  const response = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
  const data = await readApiResponse<{ user: AuthUser | null }>(response, "Could not load account");
  return data.user;
}

export async function registerUser(input: {
  email: string;
  password: string;
  role: "CUSTOMER" | "TECH";
  fullName?: string;
  referralCode?: string;
}) {
  const response = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toRegisterPayload(input))
  });
  const data = await readApiResponse<{ user: AuthUser }>(response, "Account could not be created");
  return data.user;
}

export function toRegisterPayload(input: {
  email: string;
  password: string;
  role: "CUSTOMER" | "TECH";
  fullName?: string;
  referralCode?: string;
}) {
  return {
    ...input,
    role: input.role === "TECH" ? "tech" : "customer"
  };
}

export async function loginUser(input: { email: string; password: string }) {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await readApiResponse<{ user: AuthUser }>(response, "Sign in failed");
  return data.user;
}

export async function logoutUser() {
  await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
}

export async function updateAccount(input: { fullName: string; email: string }) {
  const response = await fetch(apiUrl("/api/auth/account"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toAccountUpdatePayload(input))
  });
  const data = await readApiResponse<{ user: AuthUser }>(response, "Account could not be updated");
  return data.user;
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const response = await fetch(apiUrl("/api/auth/password"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  await readApiResponse<{ passwordChanged: true }>(response, "Password could not be updated");
}

export function toAccountUpdatePayload(input: { fullName: string; email: string }) {
  return {
    fullName: input.fullName.trim(),
    email: input.email.trim()
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch(apiUrl("/api/auth/forgot-password"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  await readApiResponse<{ message: string }>(
    response,
    "Could not request a password reset"
  );
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const response = await fetch(apiUrl("/api/auth/reset-password"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  await readApiResponse<{ passwordReset: boolean }>(
    response,
    "Could not reset your password"
  );
}