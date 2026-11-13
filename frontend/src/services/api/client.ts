/** Shared transport helpers: API-origin resolution and stable response/error parsing. */
const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${apiOrigin}${path}`;
}

export type ApiResponse<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, string | number>;
    issues?: {
      fieldErrors?: Record<string, string[] | undefined>;
      formErrors?: string[];
    };
  };
};

type ApiIssues = NonNullable<ApiResponse<unknown>["error"]>["issues"];
type ApiDetails = NonNullable<ApiResponse<unknown>["error"]>["details"];

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly issues: ApiIssues;
  readonly details: ApiDetails;

  constructor({ status, code, message, issues, details }: {
    status: number;
    code?: string;
    message: string;
    issues?: ApiIssues;
    details?: ApiDetails;
  }) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.details = details;
  }
}

export function formatApiError(payload: ApiResponse<unknown>, fallback = "Request failed") {
  const message = payload.error?.message || fallback;
  const fieldErrors = payload.error?.issues?.fieldErrors;
  if (!fieldErrors) return message;

  const details = Object.entries(fieldErrors)
    .flatMap(([field, errors]) => (errors ?? []).map((error) => `${field}: ${error}`))
    .join("; ");

  return details ? `${message}: ${details}` : message;
}

export async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || payload.data === undefined) {
    throw new ApiClientError({
      status: response.status,
      code: payload.error?.code,
      message: formatApiError(payload, fallback),
      issues: payload.error?.issues,
      details: payload.error?.details
    });
  }
  return payload.data;
}
