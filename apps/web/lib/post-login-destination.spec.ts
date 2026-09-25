/**
 * Post-login destination rules.
 *
 * The scanner is installed on a phone's Home Screen, so `?from=` is what keeps
 * the operator in the scanner after signing in — which also makes the value
 * attacker-controllable and therefore worth pinning down.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_POST_LOGIN_DESTINATION,
  postLoginDestination,
  sessionExpiredUrl,
} from "./post-login-destination";

describe("post-login destination", () => {
  it("returns the operator to the surface that was blocked", () => {
    expect(postLoginDestination("/scan")).toBe("/scan");
    expect(postLoginDestination("/scan?code=ANANYA%3AV1%3ACOMPONENT%3Aabc")).toBe(
      "/scan?code=ANANYA%3AV1%3ACOMPONENT%3Aabc",
    );
    expect(postLoginDestination("/components/6f1c")).toBe("/components/6f1c");
  });

  it("falls back to the dashboard when there is nothing to return to", () => {
    expect(postLoginDestination(null)).toBe(DEFAULT_POST_LOGIN_DESTINATION);
    expect(postLoginDestination(undefined)).toBe(DEFAULT_POST_LOGIN_DESTINATION);
    expect(postLoginDestination("")).toBe(DEFAULT_POST_LOGIN_DESTINATION);
  });

  it("never leaves the site, whatever the URL claims", () => {
    const rejected = [
      "https://evil.example/scan",
      "//evil.example/scan",
      "/\\evil.example/scan",
      "scan",
      "javascript:alert(1)",
      "/scan\nSet-Cookie: x=1",
      "/scan with space",
    ];

    for (const from of rejected) {
      expect(postLoginDestination(from)).toBe(DEFAULT_POST_LOGIN_DESTINATION);
    }
  });

  it("round-trips an expired session back to the scanner", () => {
    const url = sessionExpiredUrl("/scan");

    expect(url).toBe("/login?expired=true&from=%2Fscan");
    expect(postLoginDestination(new URLSearchParams(url.split("?")[1]).get("from"))).toBe(
      "/scan",
    );
  });
});
