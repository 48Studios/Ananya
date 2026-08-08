import { nextJsConfig } from "@ananya/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["next.config.mjs"],
    rules: {
      "no-undef": "off",
    },
  },
];
