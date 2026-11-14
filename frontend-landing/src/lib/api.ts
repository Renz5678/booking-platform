// A lightweight fetch wrapper for interacting with the Alaga backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions extends RequestInit {
  // Add any custom options here
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

async function fetchApi<T = any>(
  endpoint: string,
  options: RequestOptions = {}
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

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errObj = data as { detail?: string; msg?: string } | null;
    const errorMessage =
      errObj?.detail ||
      errObj?.msg ||
      response.statusText ||
      "An API error occurred";
    throw new ApiError(response.status, errorMessage, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions) =>
    fetchApi<T>(endpoint, { ...options, method: "GET" }),
  post: <T = any>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: "POST",
      body: serializeBody(body),
    }),
  put: <T = any>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: "PUT",
      body: serializeBody(body),
    }),
  delete: <T = any>(endpoint: string, options?: RequestOptions) =>
    fetchApi<T>(endpoint, { ...options, method: "DELETE" }),
  patch: <T = any>(
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
