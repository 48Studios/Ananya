export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// The public base URL of the API, configured at build time via NEXT_PUBLIC_API_URL.
// Example: http://localhost:4000 (dev) | https://api.erp.example.com (prod)
// Set API_PUBLIC_URL during Next.js build; Next.js exposes it as NEXT_PUBLIC_API_URL.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const TOKEN_KEY = "ananya_auth_token";

let onUnauthorizedHandler: (() => void) | null = null;

export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorizedHandler = handler;
}

export function clearStoredAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  if (typeof document !== "undefined") {
    document.cookie =
      "ananya_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

export function broadcastAuthEvent(type: "LOGOUT" | "SESSION_EXPIRED"): void {
  if (typeof window === "undefined") return;
  try {
    const channel = new BroadcastChannel("ananya_auth_channel");
    channel.postMessage({ type, timestamp: Date.now() });
    channel.close();
  } catch {
    // Fallback for environment where BroadcastChannel is unavailable
  }
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token && typeof document !== "undefined") {
    const match = document.cookie.match(/ananya_auth_token=([^;]+)/);
    if (match && match[1]) token = match[1];
  }
  return token;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  const storedToken = getStoredToken();
  if (storedToken && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${storedToken}`;
  }

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: { message?: string | string[]; error?: string } = {};
    try {
      errorData = (await response.json()) as {
        message?: string | string[];
        error?: string;
      };
    } catch {
      // JSON parse failed
    }

    const message = Array.isArray(errorData.message)
      ? errorData.message.join(", ")
      : errorData.message ||
      response.statusText ||
      "An unexpected API error occurred";

    // Global 401 Unauthorized Interceptor
    if (response.status === 401 && !endpoint.includes("/auth/login")) {
      clearStoredAuthToken();
      broadcastAuthEvent("SESSION_EXPIRED");

      if (onUnauthorizedHandler) {
        onUnauthorizedHandler();
      }

      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.href = "/login?expired=true";
      }
    }

    throw new ApiError(response.status, message, errorData);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, { ...options, method: "GET" }),

  post: <T, B = unknown>(
    endpoint: string,
    body: B,
    options?: RequestInit,
  ): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T, B = unknown>(
    endpoint: string,
    body: B,
    options?: RequestInit,
  ): Promise<T> =>
    request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: <T>(endpoint: string, options?: RequestInit): Promise<T> =>
    request<T>(endpoint, { ...options, method: "DELETE" }),

  postFormData: async <T>(
    endpoint: string,
    formData: FormData,
    options?: RequestInit,
  ): Promise<T> => {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string>),
    };

    const storedToken = getStoredToken();
    if (storedToken && !headers["Authorization"] && !headers["authorization"]) {
      headers["Authorization"] = `Bearer ${storedToken}`;
    }

    const response = await fetch(url, {
      credentials: "include",
      ...options,
      method: "POST",
      body: formData,
      headers,
    });

    if (!response.ok) {
      let errorData: { message?: string | string[]; error?: string } = {};
      try {
        errorData = (await response.json()) as {
          message?: string | string[];
          error?: string;
        };
      } catch {
        // JSON parse failed
      }

      const message = Array.isArray(errorData.message)
        ? errorData.message.join(", ")
        : errorData.message ||
        response.statusText ||
        "An unexpected API error occurred";

      if (response.status === 401 && !endpoint.includes("/auth/login")) {
        clearStoredAuthToken();
        broadcastAuthEvent("SESSION_EXPIRED");
        if (onUnauthorizedHandler) onUnauthorizedHandler();
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login")
        ) {
          window.location.href = "/login?expired=true";
        }
      }

      throw new ApiError(response.status, message, errorData);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return response.json() as Promise<T>;
  },
};
