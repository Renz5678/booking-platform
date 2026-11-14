// A lightweight fetch wrapper for interacting with the Alaga backend

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type RequestOptions = RequestInit;

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let localMutex: Promise<any> = Promise.resolve();

async function acquireLocalLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = localMutex;
  let releaseCurrent: () => void = () => {};
  localMutex = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  try {
    await prev;
    return await fn();
  } finally {
    releaseCurrent!();
  }
}

async function fetchApi<T = any>(endpoint: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(options.method || "GET")) {
    const csrfResponse = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: "include", cache: "no-store" });
    if (!csrfResponse.ok) throw new Error("Security verification is unavailable");
    headers.set("X-CSRF-Token", (await csrfResponse.json()).csrf_token);
  }
  const config: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials || "include", 
  };

  const response = await fetch(url, config);

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  // Intercept 401 errors for non-auth endpoints and attempt refresh
  if (response.status === 401 && !isRetry && (!endpoint.startsWith("/auth/") || endpoint === "/auth/me")) {
    try {
      if (!isRefreshing) {
        isRefreshing = true;
        const refresh = async () => {
          const current = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include", cache: "no-store" });
          if (current.ok) return true;
          const bootstrap = await fetch(`${API_BASE_URL}/auth/csrf`, { credentials: "include", cache: "no-store" });
          if (!bootstrap.ok) return false;
          const csrf = await bootstrap.json();
          return (await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include", headers: { "X-CSRF-Token": csrf.csrf_token } })).ok;
        };

        const lockRequest = typeof navigator !== "undefined" && navigator.locks
          ? navigator.locks.request("alaga-refresh", async () => await refresh())
          : acquireLocalLock(async () => await refresh());

        refreshPromise = lockRequest
          .then(async (val) => await val)
          .catch(() => false)
          .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
      }
      const refreshed = refreshPromise ? await refreshPromise : false;
      if (refreshed) {
        return fetchApi<T>(endpoint, options, true);
      }
    } catch {
      // Refresh failed, continue with original 401 error
    }
  }

  if (!response.ok) {
    let errorMessage = data?.detail || data?.msg || response.statusText || "An API error occurred";
    
    if (Array.isArray(errorMessage)) {
      errorMessage = errorMessage.map((err: any) => err.msg || "Invalid input").join(", ");
    }
    throw new ApiError(response.status, errorMessage, data);
  }

  return data as T;
}

const formatBody = (body: any) => {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData || typeof body === "string" || body instanceof Blob) {
    return body;
  }
  return JSON.stringify(body);
};

export const api = {
  get: <T = any>(endpoint: string, options?: RequestOptions): Promise<T> =>
    fetchApi<T>(endpoint, { ...options, method: "GET" }),
  post: <T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> =>
    fetchApi<T>(endpoint, { ...options, method: "POST", body: formatBody(body) }),
  put: <T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> =>
    fetchApi<T>(endpoint, { ...options, method: "PUT", body: formatBody(body) }),
  delete: <T = any>(endpoint: string, options?: RequestOptions): Promise<T> =>
    fetchApi<T>(endpoint, { ...options, method: "DELETE" }),
  patch: <T = any>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> =>
    fetchApi<T>(endpoint, { ...options, method: "PATCH", body: formatBody(body) }),
};
