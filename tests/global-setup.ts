import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import { e2eAdminCredentials } from "./e2e/auth-credentials";

/**
 * Playwright global setup.
 *
 * Authenticated specs need a session. When `E2E_ADMIN_EMAIL` and
 * `E2E_ADMIN_PASSWORD` are configured, this logs in through the API once and
 * writes a storage state (session cookie + localStorage token) that every
 * browser context reuses. Without credentials the state is removed and
 * authenticated specs skip themselves via `requireE2EAuth()`.
 *
 * The state file contains a live session token, so it lives under
 * `tests/.auth/` which is git-ignored.
 */
export const E2E_STORAGE_STATE_PATH = path.join(
  __dirname,
  ".auth",
  "e2e-state.json",
);

export default async function globalSetup(): Promise<void> {
  if (!e2eAdminCredentials) {
    fs.rmSync(E2E_STORAGE_STATE_PATH, { force: true });
    console.warn(
      "[e2e] E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD are not set. " +
        "Authenticated specs will be skipped; public specs still run.",
    );
    return;
  }

  const apiBaseUrl = process.env.E2E_API_URL ?? "http://localhost:4000";
  const appBaseUrl = process.env.BASE_URL ?? "http://localhost:3000";

  const api = await request.newContext();
  try {
    const response = await api.post(`${apiBaseUrl}/auth/login`, {
      data: e2eAdminCredentials,
    });

    if (!response.ok()) {
      throw new Error(
        `E2E login failed with HTTP ${response.status()}. ` +
          "Verify E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD and that the API is reachable at " +
          `${apiBaseUrl}.`,
      );
    }

    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      throw new Error("E2E login response did not contain a session token.");
    }

    const appUrl = new URL(appBaseUrl);
    const state = {
      cookies: [
        {
          name: "ananya_auth_token",
          value: body.token,
          domain: appUrl.hostname,
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: appUrl.protocol === "https:",
          sameSite: "Lax" as const,
        },
      ],
      origins: [
        {
          origin: appUrl.origin,
          localStorage: [{ name: "ananya_auth_token", value: body.token }],
        },
      ],
    };

    fs.mkdirSync(path.dirname(E2E_STORAGE_STATE_PATH), { recursive: true });
    fs.writeFileSync(E2E_STORAGE_STATE_PATH, JSON.stringify(state, null, 2));
    console.log(`[e2e] Session created for ${e2eAdminCredentials.email}.`);
  } finally {
    await api.dispose();
  }
}
