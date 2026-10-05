import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { NAV_TOKENS, NAV_WIDTHS_PX, SHELL_HEIGHTS_PX } from "./tokens";

/**
 * The navigation widths exist twice on purpose: as Tailwind classes (what the
 * rail and sidebar actually render) and as numbers (what the layout needs as a
 * length when it publishes the content-area offset for the floating batch bar).
 *
 * A class cannot be read back at runtime, so the pair is asserted here instead.
 * If they drift, the batch bar centres on the wrong column — a visual bug that
 * nothing else would catch.
 */

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

describe("navigation width tokens", () => {
  it("keeps the numeric widths in step with the classes that render them", () => {
    expect(NAV_TOKENS.RAIL_WIDTH).toContain(`w-[${NAV_WIDTHS_PX.RAIL}px]`);
    expect(NAV_TOKENS.RAIL_WIDTH).toContain(`min-w-[${NAV_WIDTHS_PX.RAIL}px]`);
    expect(NAV_TOKENS.SIDEBAR_EXPANDED_WIDTH).toContain(
      `w-[${NAV_WIDTHS_PX.SIDEBAR_EXPANDED}px]`,
    );
    expect(NAV_TOKENS.SIDEBAR_COLLAPSED_WIDTH).toContain(
      `w-[${NAV_WIDTHS_PX.SIDEBAR_COLLAPSED}px]`,
    );
  });

  it("declares the widths as literal class text, not built from the numbers", () => {
    // Tailwind's scanner reads source text: a class assembled from an
    // interpolation generates no CSS, and the rail would silently lose its
    // width. The literals above must stay literals.
    const tokens = read("lib/navigation/tokens.ts");
    expect(tokens).toContain('RAIL_WIDTH: "w-[60px] min-w-[60px]"');
    expect(tokens).toContain('SIDEBAR_EXPANDED_WIDTH: "w-[280px] min-w-[280px]"');
    expect(tokens).toContain('SIDEBAR_COLLAPSED_WIDTH: "w-[72px] min-w-[72px]"');
  });

  it("matches the width the sidebar context publishes", () => {
    // `sidebarWidth` is the other half of the offset the layout computes.
    const context = read("lib/navigation/navigation-context.tsx");
    expect(context).toContain(
      `isSidebarCollapsed ? ${NAV_WIDTHS_PX.SIDEBAR_COLLAPSED} : ${NAV_WIDTHS_PX.SIDEBAR_EXPANDED}`,
    );
  });
});

describe("content area offset", () => {
  it("is published by the layout from the rail and the sidebar", () => {
    const layout = read("components/dashboard-layout.tsx");
    // The value must come from the tokens, not a hard-coded number.
    expect(layout).toContain("NAV_WIDTHS_PX.RAIL + sidebarWidth");
    expect(layout).toContain('"--content-area-left"');
    // Reading the sidebar state requires being inside the provider.
    expect(layout).toContain("<AuthenticatedShell>");
    expect(layout).toContain("const { sidebarWidth } = useNavigation();");
  });

  it("is consumed only where the rail and sidebar are on screen", () => {
    const toolbar = read("components/ui/bulk-action-toolbar.tsx");
    // `md:` matters: the two regions are `hidden md:block`, so below `md` there is
    // nothing to exclude and the offset must not be applied.
    expect(toolbar).toContain("md:pl-(--content-area-left)");
    expect(read("components/dashboard-layout.tsx")).toContain(
      'className="hidden md:block print:hidden"',
    );
  });
});

describe("shell height tokens", () => {
  it("keeps the numeric heights in step with the classes that render them", () => {
    // The header class and the footer class are the on-screen source of truth;
    // the numbers exist only so `fixed` overlays can reserve the bands.
    expect(NAV_TOKENS.HEADER_HEIGHT).toContain(
      `min-h-[${SHELL_HEIGHTS_PX.HEADER}px]`,
    );
    expect(NAV_TOKENS.HEADER_HEIGHT).toContain("h-14");
    expect(read("components/app-footer.tsx")).toContain("h-14");
    expect(SHELL_HEIGHTS_PX.FOOTER).toBe(SHELL_HEIGHTS_PX.HEADER);
  });

  it("is published by the layout for viewport-constrained overlays", () => {
    const layout = read("components/dashboard-layout.tsx");
    expect(layout).toContain('"--app-header-height"');
    expect(layout).toContain('"--app-footer-height"');
    expect(layout).toContain("SHELL_HEIGHTS_PX.HEADER");
    expect(layout).toContain("SHELL_HEIGHTS_PX.FOOTER");
  });

  it("is no longer needed by the spatial inspector", () => {
    // The inspector is an in-flow sidebar inside the spatial workspace now, so
    // it must not reserve shell bands or compute its own viewport arithmetic.
    const view = read("components/spatial/spatial-view.tsx");
    expect(view).toContain('data-testid="spatial-inspector-sidebar"');
    // The inspector content and its empty state must not do viewport math.
    // (Only the transient anchor-authoring editor still pins itself to the
    // shell chrome, which is a separate feature.)
    expect(read("components/spatial/spatial-inspector.tsx")).not.toContain(
      "--app-header-height",
    );
    expect(read("components/spatial/spatial-inspector.tsx")).not.toContain(
      "--app-footer-height",
    );
    expect(
      read("components/spatial/spatial-inspector-empty-state.tsx"),
    ).not.toContain("--app-footer-height");
    // The old floating caps must not come back for the inspector.
    expect(view).not.toContain("useAnchoredInspector");
    expect(view).not.toContain("sm:max-h-[min(640px,calc(100vh-10rem))]");
    expect(view).not.toContain("fixed z-40 flex flex-col");
  });
});
