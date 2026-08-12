declare global {
  interface Window {
    __ANANYA_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

export interface RuntimeConfig {
  apiUrl: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") {
    return {
      // eslint-disable-next-line turbo/no-undeclared-env-vars
      apiUrl: process.env.API_PUBLIC_URL || "http://localhost:4000",
    };
  }

  const config = window.__ANANYA_CONFIG__;
  if (
    !config ||
    !config.apiUrl ||
    typeof config.apiUrl !== "string" ||
    !config.apiUrl.trim()
  ) {
    throw new Error(
      "❌ Missing or malformed runtime configuration! Expected window.__ANANYA_CONFIG__.apiUrl to be set.",
    );
  }

  return {
    apiUrl: config.apiUrl.trim().replace(/\/+$/, ""),
  };
}

export const runtimeConfig = getRuntimeConfig();
