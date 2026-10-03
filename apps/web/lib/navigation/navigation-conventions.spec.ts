import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  LEGACY_REDIRECTS,
  resolveLegacyRedirect,
  redirectChain,
} from "./legacy-redirects";
import { navigationModules, getModuleForPath } from "./navigation-config";
import { buildBreadcrumbs } from "./breadcrumbs";
import { collectNavHrefs, resolveActiveHref } from "./active-route";

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);
const appRoot = path.join(webRoot, "app");

const pageFileFor = (pathname: string) =>
  path.join(appRoot, ...pathname.split("/").filter(Boolean), "page.tsx");

const navItems = navigationModules.flatMap((module) =>
  module.sidebar.flatMap((section) =>
    (section.items ?? []).map((item) => ({ module, section, item })),
  ),
);

/** Every href the shell can navigate to: items, children, and quick actions. */
const allNavHrefs = navigationModules.flatMap((module) =>
  module.sidebar.flatMap((section) => [
    ...(section.items ?? []).flatMap((item) => [
      item.href,
      ...(item.children ?? []).map((child) => child.href),
    ]),
    ...(section.quickActions ?? [])
      .map((action) => action.href)
      .filter((href): href is string => Boolean(href)),
  ]),
);

describe("sidebar route coverage", () => {
  it("has no duplicate navigation owners across modules", () => {
    const owners = new Map<string, string[]>();
    for (const { module: navModule, item } of navItems) {
      const hrefs = [item.href, ...(item.children ?? []).map((c) => c.href)];
      for (const href of hrefs) {
        const list = owners.get(href) ?? [];
        list.push(navModule.id);
        owners.set(href, list);
      }
    }
    const crossModule = [...owners.entries()].filter(
      ([, modules]) => new Set(modules).size > 1,
    );
    expect(crossModule).toEqual([]);
  });

  it("points every nav entry, child, and quick action at a real page", () => {
    const missing = allNavHrefs.filter(
      (href) => !fs.existsSync(pageFileFor(href)),
    );
    expect(missing).toEqual([]);
  });

  it("gives each configured path exactly one active module", () => {
    for (const { module: navModule, item } of navItems) {
      const hrefs = [item.href, ...(item.children ?? []).map((c) => c.href)];
      for (const href of hrefs) {
        expect(getModuleForPath(href).id, href).toBe(navModule.id);
        expect(getModuleForPath(href + "/child").id, href + "/child").toBe(
          navModule.id,
        );
      }
    }
    expect(getModuleForPath("/dashboard").id).toBe("dashboard");
    expect(getModuleForPath("/notifications").id).toBe("dashboard");
    expect(getModuleForPath("/settings/audit").id).toBe("settings");
    expect(getModuleForPath("/").id).toBe("dashboard");
  });
});

describe("active navigation entry", () => {
  const hrefs = collectNavHrefs(navigationModules);

  it("highlights exactly the most specific entry", () => {
    expect(
      resolveActiveHref("/inventory/locations/spatial-builder", hrefs),
    ).toBe("/inventory/locations/spatial-builder");
    expect(resolveActiveHref("/inventory/locations/spatial", hrefs)).toBe(
      "/inventory/locations/spatial",
    );
    expect(
      resolveActiveHref("/inventory/locations/spatial-models", hrefs),
    ).toBe("/inventory/locations/spatial-models");
  });

  it("does not light up module overviews or parent entries on deeper pages", () => {
    const builder = "/inventory/locations/spatial-builder";
    expect(resolveActiveHref(builder, hrefs)).not.toBe("/inventory");
    expect(resolveActiveHref(builder, hrefs)).not.toBe("/inventory/locations");
    expect(resolveActiveHref(builder, hrefs)).not.toBe(
      "/inventory/locations/spatial",
    );

    // Every nested group: the child must not light up the group default.
    const nested: Array<[string, string]> = [
      ["/inventory/locations/spatial", "/inventory/locations"],
      ["/inventory/locations/policies", "/inventory/locations"],
      ["/inventory/stock-counts/cycle-counts", "/inventory/stock-counts"],
      ["/inventory/stock-counts/adjustments", "/inventory/stock-counts"],
      ["/inventory/batches/serials", "/inventory/batches"],
      ["/inventory/batches/reservations", "/inventory/batches"],
      ["/inventory/batches/projections", "/inventory/batches"],
      ["/inventory/master/manufacturers", "/inventory/master/categories"],
      ["/inventory/master/units", "/inventory/master/categories"],
      ["/inventory/master/attributes", "/inventory/master/categories"],
      ["/manufacturing/mrp/runs", "/manufacturing/mrp"],
    ];
    for (const [child, groupDefault] of nested) {
      expect(resolveActiveHref(child, hrefs), child).toBe(child);
      expect(resolveActiveHref(child, hrefs), child).not.toBe(groupDefault);
    }

    expect(resolveActiveHref("/inventory/master/categories", hrefs)).toBe(
      "/inventory/master/categories",
    );
    expect(resolveActiveHref("/procurement/master/suppliers", hrefs)).toBe(
      "/procurement/master/suppliers",
    );

    expect(resolveActiveHref("/dashboard/activity", hrefs)).toBe(
      "/dashboard/activity",
    );
    expect(resolveActiveHref("/dashboard/activity", hrefs)).not.toBe(
      "/dashboard",
    );
    expect(resolveActiveHref("/settings/audit", hrefs)).toBe("/settings/audit");
    expect(resolveActiveHref("/settings/audit", hrefs)).not.toBe("/settings");
    expect(resolveActiveHref("/reports/inventory", hrefs)).toBe(
      "/reports/inventory",
    );
  });

  it("attributes detail routes to their list entry", () => {
    expect(resolveActiveHref("/inventory/components/abc", hrefs)).toBe(
      "/inventory/components",
    );
    expect(resolveActiveHref("/procurement/purchase-orders/123", hrefs)).toBe(
      "/procurement/purchase-orders",
    );
    expect(resolveActiveHref("/manufacturing/mrp/runs/42", hrefs)).toBe(
      "/manufacturing/mrp/runs",
    );
  });

  it("resolves every configured path to itself", () => {
    for (const href of hrefs) {
      expect(resolveActiveHref(href, hrefs), href).toBe(href);
    }
  });

  it("resolves unowned paths to null", () => {
    expect(resolveActiveHref("/activities", hrefs)).toBeNull();
    expect(resolveActiveHref("/unknown/place", hrefs)).toBeNull();
  });
});

describe("breadcrumbs", () => {
  it("prefers the longest matching child over its parent", () => {
    const cases: Array<[string, string]> = [];
    for (const { module: navModule, item } of navItems) {
      const children = item.children ?? [];
      for (const child of children) {
        const moreSpecific = children.find(
          (other) =>
            other.href !== child.href &&
            other.href.startsWith(child.href + "/"),
        );
        if (moreSpecific) {
          cases.push([navModule.id, moreSpecific.href]);
        }
      }
    }
    expect(cases.length).toBeGreaterThan(0);
    for (const [moduleId, activePath] of cases) {
      const navModule = navigationModules.find((m) => m.id === moduleId)!;
      const crumbs = buildBreadcrumbs(activePath, navModule);
      const leaf = crumbs[crumbs.length - 1]!;
      expect(leaf.href, activePath).toBe(activePath);
    }
  });

  it("never links a crumb to a page that does not exist", () => {
    const paths = navItems.flatMap(({ item }) => [
      item.href,
      ...(item.children ?? []).map((c) => c.href),
    ]);
    const missing: string[] = [];
    for (const activePath of paths) {
      const navModule = getModuleForPath(activePath);
      for (const crumb of buildBreadcrumbs(activePath, navModule)) {
        if (!fs.existsSync(pageFileFor(crumb.href))) {
          missing.push(`${activePath} -> ${crumb.href}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("legacy redirects", () => {
  it("uses base paths only and never points at an API route", () => {
    for (const { from, to } of LEGACY_REDIRECTS) {
      expect(from, from).not.toContain("[");
      expect(from.startsWith("/api/"), from).toBe(false);
      expect(to.startsWith("/api/"), to).toBe(false);
    }
  });

  it("resolves each entry to its canonical target", () => {
    for (const { from, to } of LEGACY_REDIRECTS) {
      expect(resolveLegacyRedirect(from), from).toBe(to);
    }
  });

  it("matches whole segments and longest prefix", () => {
    const synthetic = [
      { from: "/legacy-components", to: "/domain/components" },
      { from: "/legacy-accounts", to: "/domain/chart-of-accounts" },
      { from: "/legacy-accounts-payable", to: "/domain/accounts-payable" },
      { from: "/legacy-spatial", to: "/domain/spatial" },
      { from: "/legacy-spatial/builder", to: "/domain/spatial/builder" },
    ];
    expect(resolveLegacyRedirect("/legacy-components/abc", synthetic)).toBe(
      "/domain/components/abc",
    );
    expect(
      resolveLegacyRedirect("/legacy-components-extra", synthetic),
    ).toBeNull();
    expect(resolveLegacyRedirect("/legacy-accounts-payable", synthetic)).toBe(
      "/domain/accounts-payable",
    );
    expect(resolveLegacyRedirect("/legacy-accounts/42", synthetic)).toBe(
      "/domain/chart-of-accounts/42",
    );
    expect(resolveLegacyRedirect("/legacy-spatial/builder", synthetic)).toBe(
      "/domain/spatial/builder",
    );
    expect(resolveLegacyRedirect("/domain/components", synthetic)).toBeNull();
    expect(redirectChain("/legacy-components/abc", synthetic)).toEqual([
      "/legacy-components/abc",
      "/domain/components/abc",
    ]);
  });

  it("keeps the retained /activities path untouched", () => {
    expect(resolveLegacyRedirect("/activities")).toBeNull();
  });

  it("has no redirect chains or loops", () => {
    for (const { from, to } of LEGACY_REDIRECTS) {
      const chain = redirectChain(from);
      expect(chain, from).toEqual([from, to]);
      expect(resolveLegacyRedirect(to), `${from} -> ${to}`).toBeNull();
    }
  });
});

describe("route migration completeness", () => {
  const dedicatedCreateRoutes = [
    "/inventory/components/new",
    "/inventory/warehouse-transfers/new",
    "/procurement/purchase-orders/new",
    "/procurement/goods-receipts/new",
    "/manufacturing/work-orders/new",
    "/manufacturing/boms/new",
  ];

  it("provides the dedicated creation routes the navigation expects", () => {
    for (const pathname of dedicatedCreateRoutes) {
      expect(fs.existsSync(pageFileFor(pathname)), pathname).toBe(true);
    }
  });

  it("points every legacy redirect at a canonical page", () => {
    for (const { from, to } of LEGACY_REDIRECTS) {
      expect(fs.existsSync(pageFileFor(to)), `${from} -> ${to}`).toBe(true);
    }
  });

  it("retires every redirected path so no duplicate canonical page can drift", () => {
    for (const { from } of LEGACY_REDIRECTS) {
      expect(fs.existsSync(pageFileFor(from)), from).toBe(false);
    }
  });

  it("keeps the retained /activities page in place", () => {
    expect(fs.existsSync(pageFileFor("/activities"))).toBe(true);
  });

  it("leaves no stale internal link to a redirected path", () => {
    const repoRoot = path.resolve(webRoot, "../..");
    const scanRoots = [
      path.join(webRoot, "app"),
      path.join(webRoot, "components"),
      path.join(webRoot, "lib"),
      path.join(repoRoot, "tests"),
      path.join(repoRoot, "apps/api/src/search/providers"),
    ];
    const skip = [
      /node_modules/,
      /\.next/,
      /\.turbo/,
      /\/lib\/api\//,
      /legacy-redirects\.ts$/,
      /navigation-conventions\.spec\.ts$/,
    ];
    const sourceFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolute = path.join(dir, entry.name);
        if (skip.some((pattern) => pattern.test(absolute))) continue;
        if (entry.isDirectory()) walk(absolute);
        else if (/\.(tsx?|mjs)$/.test(entry.name)) sourceFiles.push(absolute);
      }
    };
    scanRoots.forEach((dir) => {
      if (fs.existsSync(dir)) walk(dir);
    });

    const stale = new Map<string, string[]>();
    const DELIMITER = "(^|[\\s\"'`(=,>{])";
    // API endpoints share names with several frontend resources but never
    // moved; assertions that name them are not stale links.
    const API_ASSERTION =
      /apiClient|fetchApi|toHaveBeenCalledWith|stringContaining/;
    const API_ENDPOINT_SPEC_ALLOWLIST = new Set([
      "apps/web/lib/component-documentation.spec.ts",
      "apps/web/lib/spatial/inventory-builder-persistence.spec.ts",
    ]);
    for (const file of sourceFiles) {
      const relative = path.relative(repoRoot, file);
      if (API_ENDPOINT_SPEC_ALLOWLIST.has(relative)) continue;
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (const { from, to } of LEGACY_REDIRECTS) {
        const prefix =
          to.endsWith(from) && to !== from ? to.slice(0, -from.length) : "";
        const pattern = new RegExp(
          DELIMITER +
            from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "(?![\\w-])",
          "gm",
        );
        // Canonical paths built by prefixing contain the old segment; those
        // are the migration's result, not a stale reference to it. `@/components`
        // style aliases are excluded by the leading-delimiter requirement.
        for (const match of content.matchAll(pattern)) {
          const pathStart = match.index + match[1]!.length;
          if (prefix && content.slice(0, pathStart).endsWith(prefix)) continue;
          const lineIndex = content.slice(0, pathStart).split("\n").length - 1;
          if (API_ASSERTION.test(lines[lineIndex] ?? "")) continue;
          stale.set(relative, [...(stale.get(relative) ?? []), from]);
          break;
        }
      }
    }
    expect([...stale.entries()]).toEqual([]);
  });
});
