import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { NAV_TOKENS, NAV_WIDTHS_PX } from "./tokens";

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
