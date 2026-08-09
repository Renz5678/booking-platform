// A lightweight fetch wrapper for interacting with the Alaga backend

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions extends RequestInit {
  // Add any custom options here
}

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

async function fetchApi(endpoint: string, options: RequestOptions = {}) {
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

  let data;
  try {
    data = await response.json();
  } catch (err) {
    // Some responses might not have JSON bodies
    data = null;
  }

  if (!response.ok) {
    const errorMessage = data?.detail || data?.msg || response.statusText || "An API error occurred";
    throw new ApiError(response.status, errorMessage, data);
  }

  return data;
}

export const api = {
  get: (endpoint: string, options?: RequestOptions) => fetchApi(endpoint, { ...options, method: "GET" }),
  post: (endpoint: string, body: any, options?: RequestOptions) => fetchApi(endpoint, { ...options, method: "POST", body: JSON.stringify(body) }),
  put: (endpoint: string, body: any, options?: RequestOptions) => fetchApi(endpoint, { ...options, method: "PUT", body: JSON.stringify(body) }),
  delete: (endpoint: string, options?: RequestOptions) => fetchApi(endpoint, { ...options, method: "DELETE" }),
  patch: (endpoint: string, body: any, options?: RequestOptions) => fetchApi(endpoint, { ...options, method: "PATCH", body: JSON.stringify(body) }),
};
