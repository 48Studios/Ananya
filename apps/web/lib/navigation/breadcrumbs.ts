import type { NavigationModule } from "./types";

export interface Breadcrumb {
  title: string;
  href: string;
}

/**
 * Builds the semantic breadcrumb trail for a path inside a navigation module.
 *
 * Breadcrumbs follow the navigation tree rather than raw URL segments, so the
 * trail matches what the sidebar shows. The most specific entry wins: every
 * item and child is a candidate and the longest matching href is kept, which
 * keeps `/inventory/locations/spatial-builder` from collapsing into its `/inventory/locations/spatial` sibling.
 *
 * Pure on purpose — `top-header.tsx` renders the result, and the navigation
 * tests assert the ordering without a DOM.
 */
export function buildBreadcrumbs(
  activePath: string,
  currentModule: NavigationModule,
): Breadcrumb[] {
  const segments = activePath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ title: "Dashboard", href: "/" }];
  }

  const crumbs: Breadcrumb[] = [
    { title: currentModule.name, href: currentModule.defaultRoute },
  ];

  let best: {
    href: string;
    title: string;
    parent?: Breadcrumb;
  } | null = null;

  const matches = (href: string) =>
    activePath === href || activePath.startsWith(href + "/");

  for (const section of currentModule.sidebar) {
    for (const item of section.items ?? []) {
      for (const child of item.children ?? []) {
        if (!matches(child.href)) continue;
        if (!best || child.href.length > best.href.length) {
          best = {
            href: child.href,
            title: child.title,
            parent:
              item.href === child.href
                ? undefined
                : { href: item.href, title: item.title },
          };
        }
      }
      if (!matches(item.href)) continue;
      if (!best || item.href.length > best.href.length) {
        best = { href: item.href, title: item.title };
      }
    }
  }

  if (best) {
    if (best.parent && best.parent.href !== currentModule.defaultRoute) {
      crumbs.push(best.parent);
    }
    if (best.href !== currentModule.defaultRoute) {
      crumbs.push({ title: best.title, href: best.href });
    }
    return crumbs;
  }

  let currentHref = "";
  segments.forEach((seg, idx) => {
    currentHref += `/${seg}`;
    const formatted = seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    if (idx === 0 && currentHref === currentModule.defaultRoute) {
      return;
    }

    crumbs.push({ title: formatted, href: currentHref });
  });

  return crumbs;
}
