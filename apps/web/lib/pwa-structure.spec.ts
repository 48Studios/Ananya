import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import manifest from "../app/manifest";

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

describe("PWA maximum compatibility configuration", () => {
  describe("Root ERP Web App Manifest", () => {
    it("provides complete manifest metadata for installability", () => {
      const rootManifest = manifest();
      expect(rootManifest.name).toBe("Ananya ERP");
      expect(rootManifest.short_name).toBe("Ananya");
      expect(rootManifest.start_url).toBe("/");
      expect(rootManifest.display).toBe("standalone");
      expect(rootManifest.icons).toBeDefined();

      const iconSizes = rootManifest.icons?.map((i) => i.sizes);
      expect(iconSizes).toContain("192x192");
      expect(iconSizes).toContain("512x512");
      expect(iconSizes).toContain("180x180");
    });
  });

  describe("Scanner Web App Manifest", () => {
    it("includes Chromium-required 192x192 and 512x512 icons", () => {
      const scanManifestSource = read("app/scan/manifest.webmanifest/route.ts");
      expect(scanManifestSource).toContain('sizes: "192x192"');
      expect(scanManifestSource).toContain('sizes: "512x512"');
      expect(scanManifestSource).toContain('sizes: "180x180"');
    });
  });

  describe("Root layout iOS and PWA metadata", () => {
    const layoutSource = read("app/layout.tsx");

    it("configures appleWebApp capable and status bar style", () => {
      expect(layoutSource).toContain("appleWebApp");
      expect(layoutSource).toContain("capable: true");
    });

    it("configures touch and favicon icons", () => {
      expect(layoutSource).toContain("/apple-touch-icon.png");
      expect(layoutSource).toContain("/favicon.ico");
    });

    it("mounts the Service Worker registration component", () => {
      expect(layoutSource).toContain("<PwaRegister />");
      expect(layoutSource).toContain('import { PwaRegister } from "@/components/pwa-register"');
    });
  });

  describe("Service Worker and static assets", () => {
    it("provides a service worker with a fetch event handler", () => {
      const swSource = read("public/sw.js");
      expect(swSource).toContain('addEventListener("install"');
      expect(swSource).toContain('addEventListener("activate"');
      expect(swSource).toContain('addEventListener("fetch"');
    });

    it("provides valid public site.webmanifest with non-empty identity", () => {
      const siteManifest = JSON.parse(read("public/site.webmanifest"));
      expect(siteManifest.name).toBe("Ananya ERP");
      expect(siteManifest.short_name).toBe("Ananya");
      expect(siteManifest.icons.length).toBeGreaterThan(0);
    });
  });
});
