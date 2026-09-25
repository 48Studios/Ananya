/**
 * Where the sign-in form sends the operator once a session exists.
 *
 * The middleware already attaches the route it blocked as `?from=`, so an
 * operator who opened the scanner from an iPhone Home Screen — or whose session
 * expired while scanning — comes back to the scanner instead of being dropped on
 * the ERP dashboard. The scanner is a standalone surface: landing anywhere else
 * means the installed app no longer opens on the camera.
 *
 * A `from` value arrives in a URL, so it is only ever honoured as a same-site
 * absolute path. Anything that could leave the site (a scheme, a protocol
 * relative `//host`, a backslash that browsers fold into `/`, embedded
 * whitespace or control characters) is discarded in favour of the dashboard.
 */

export const DEFAULT_POST_LOGIN_DESTINATION = "/dashboard";

/** A same-site absolute path, and nothing else. */
const INTERNAL_PATH = /^\/[^\s\\]*$/;

export function postLoginDestination(from: string | null | undefined): string {
  if (!from) return DEFAULT_POST_LOGIN_DESTINATION;
  // `//host` is protocol-relative and `/\host` is treated as `//host` by
  // browsers; both leave the site even though they start with a slash.
  if (!INTERNAL_PATH.test(from) || from.startsWith("//")) {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }
  return from;
}

/**
 * The sign-in URL an expired session sends the operator to.
 *
 * The counterpart of `postLoginDestination`: whatever this records in `from` is
 * exactly what signing in comes back to. Kept beside it so the two halves of
 * the round trip cannot drift apart — the scanner app depends on the pair.
 */
export function sessionExpiredUrl(pathname: string): string {
  return `/login?expired=true&from=${encodeURIComponent(pathname)}`;
}
