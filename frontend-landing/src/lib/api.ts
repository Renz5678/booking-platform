// A lightweight fetch wrapper for interacting with the Alaga backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type RequestOptions = RequestInit;

const SKIP_REFRESH_ENDPOINTS = new Set([
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
]);

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function formatErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const msg = String((item as { msg: unknown }).msg);
          return msg.replace(/^Value error,\s*/i, "");
        }
        return null;
      })
      .filter((m): m is string => Boolean(m));
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData || typeof body === "string") return body;
  return JSON.stringify(body);
}

async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
  hasRetried = false
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const config: RequestInit = {
    ...options,
    headers,
    // Ensure cookies (JWT) are included in CORS requests
    credentials: options.credentials || "include",
  };

  const response = await fetch(url, config);

  if (
    response.status === 401 &&
    !hasRetried &&
    !SKIP_REFRESH_ENDPOINTS.has(endpoint)
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return fetchApi<T>(endpoint, options, true);
    }
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errObj = data as { detail?: unknown; msg?: unknown } | null;
    const errorMessage =
      formatErrorDetail(errObj?.detail) ||
      (typeof errObj?.msg === "string" ? errObj.msg : null) ||
      response.statusText ||
      "An API error occurred";
    throw new ApiError(response.status, errorMessage, data);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    fetchApi<T>(endpoint, { ...options, method: "GET" }),
  post: <T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: "POST",
      body: serializeBody(body),
    }),
  put: <T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: "PUT",
      body: serializeBody(body),
    }),
  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    fetchApi<T>(endpoint, { ...options, method: "DELETE" }),
  patch: <T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: serializeBody(body),
    }),
};
