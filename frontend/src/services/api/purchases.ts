import { apiUrl, readApiResponse } from "./client";
import type { Purchase } from "./types";

export async function createBillingPortalSession() {
  const response = await fetch(apiUrl("/api/purchases/portal"), {
    method: "POST",
    credentials: "include"
  });
  const data = await readApiResponse<unknown>(response, "Unable to open billing management");
  if (typeof data !== "object" || data === null || !("url" in data) || typeof data.url !== "string") {
    throw new Error("Invalid billing portal response");
  }
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com" ||
      url.port !== "" || url.username !== "" || url.password !== "") {
    throw new Error("Invalid billing portal URL");
  }
  return { url: data.url };
}

export async function createCheckoutSession(PlanInfo: Purchase) {
  const response = await fetch(apiUrl("/api/purchases/checkout"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(PlanInfo)
  });

  const data = await readApiResponse<unknown>(response, "Unable to create checkout session");
  if (typeof data !== "object" || data === null || !("url" in data) || typeof data.url !== "string") {
    throw new Error("Invalid checkout response");
  }
  const url = new URL(data.url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" ||
      url.port !== "" || url.username !== "" || url.password !== "") {
    throw new Error("Invalid checkout URL");
  }
  return { url: data.url };
};
