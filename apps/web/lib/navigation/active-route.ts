import type { NavigationModule } from "./types";

/**
 * Every path the navigation can land on: module defaults, items, and children.
 *
 * Paths are unique by design (`navigation-conventions.spec.ts` asserts a single
 * owner), so the collected list can be compared against the active path without
 * worrying about duplicates.
 */
export function collectNavHrefs(
  modules: readonly NavigationModule[],
): string[] {
  const hrefs = new Set<string>();
  for (const mod of modules) {
    if (mod.defaultRoute) hrefs.add(mod.defaultRoute);
    for (const section of mod.sidebar) {
      for (const item of section.items ?? []) {
        hrefs.add(item.href);
        for (const child of item.children ?? []) {
          hrefs.add(child.href);
        }
      }
    }
  }
  return [...hrefs];
}

/**
 * The one navigation entry that owns `activePath`, or `null` for a path with no
 * entry of its own.
 *
 * Matching is segment-aware and **most specific wins**. A plain prefix test
 * highlights every ancestor: `/inventory` and `/inventory/locations/spatial` would both
 * light up on `/inventory/locations/spatial-builder`, and the module Overview would light
 * up on every page in the module. Longest-match makes exactly one entry active.
 *
 * Detail routes still light their list entry because the list href is the
 * longest configured prefix (`/inventory/components/123` → `/inventory/components`).
 */
export function resolveActiveHref(
  activePath: string,
  hrefs: readonly string[],
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!href || !href.startsWith("/")) continue;
    if (activePath !== href && !activePath.startsWith(href + "/")) continue;
    if (best === null || href.length > best.length) {
      best = href;
    }
  }
  return best;
}
