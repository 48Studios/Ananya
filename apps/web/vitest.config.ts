import { defineConfig } from "vitest/config";

/**
 * The web test suite deliberately has no DOM testing library; components that
 * need a browser are covered by Playwright. A few unit tests do import the
 * navigation configuration, which is TSX because icons are React nodes, so the
 * transformer needs the automatic JSX runtime to load it.
 */
export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
});
