/**
 * Canonical top-level route roots.
 *
 * Ananya's navigation is organised around business domains, and every
 * authenticated resource page lives under one of these roots (see
 * `docs/architecture/ROUTE_ARCHITECTURE_AUDIT.md`). Keeping the roots in one
 * place gives cross-domain links — dashboard shortcuts, command-palette
 * actions, scanner deep links — a single spelling to build against instead of
 * repeating literals that can drift from the route tree.
 *
 * This is deliberately a small helper, not a route registry: page routes stay
 * plain Next.js files, and navigation configuration keeps literal hrefs so the
 * sidebar remains easy to read. `route-coverage.spec.ts` is what actually
 * prevents drift, by asserting every configured href resolves to a page.
 */
export const CANONICAL_ROOTS = {
  dashboard: "/dashboard",
  inventory: "/inventory",
  procurement: "/procurement",
  manufacturing: "/manufacturing",
  projects: "/projects",
  sales: "/sales",
  finance: "/finance",
  reports: "/reports",
  settings: "/settings",
} as const;

export type CanonicalRoot = keyof typeof CANONICAL_ROOTS;

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Builds a canonical path from a domain root and path segments.
 *
 * Segments are validated so a typo like `canonicalPath("inventory", "/inventory/components")`
 * fails loudly in development instead of producing `//components`.
 */
export function canonicalPath(
  root: CanonicalRoot,
  ...segments: Array<string | number>
): string {
  let path = CANONICAL_ROOTS[root];
  for (const segment of segments) {
    const value = String(segment);
    if (!SEGMENT.test(value)) {
      throw new Error(
        `canonicalPath(${root}): invalid segment "${value}" — pass one path segment without slashes`,
      );
    }
    path += `/${value}`;
  }
  return path;
}
