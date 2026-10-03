import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveLegacyRedirect } from "./lib/navigation/legacy-redirects";

const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/welcome",
  "/setup",
  "/api/health",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignore static assets, Next.js internal files, images, and favicons.
  // /api/* is scoped to Next.js route handlers only (e.g. /api/health).
  // The browser communicates directly with the public API endpoint, not via proxy.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Permanent compatibility redirects for the domain-prefixed route refactor.
  // Cloning `nextUrl` preserves the query string (`?location=`, `?view=`, …).
  // This runs before the auth gate so an old deep link lands on its canonical
  // path and is then subject to the normal session rules there.
  const legacyTarget = resolveLegacyRedirect(pathname);
  if (legacyTarget) {
    const url = request.nextUrl.clone();
    url.pathname = legacyTarget;
    return NextResponse.redirect(url, 308);
  }

  const token =
    request.cookies.get("ananya_auth_token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route),
  );

  // If user is NOT authenticated and trying to access a protected route
  if (!token && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user IS authenticated and trying to access public auth routes like /login
  if (token && (pathname === "/login" || pathname === "/forgot-password")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
