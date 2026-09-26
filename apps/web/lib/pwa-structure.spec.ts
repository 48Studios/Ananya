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

      const purposes = rootManifest.icons?.map((i) => (i as { purpose?: string }).purpose);
      expect(purposes).toContain("maskable");
    });
  });

  describe("Scanner Web App Manifest", () => {
    it("includes Chromium-required 192x192 and 512x512 icons", () => {
      const scanManifestSource = read("app/scan/manifest.webmanifest/route.ts");
      expect(scanManifestSource).toContain('sizes: "192x192"');
      expect(scanManifestSource).toContain('sizes: "512x512"');
      expect(scanManifestSource).toContain('sizes: "180x180"');
      expect(scanManifestSource).toContain('purpose: "maskable"');
    });
  });

  describe("Root layout iOS and PWA metadata", () => {
    const layoutSource = read("app/layout.tsx");

    it("configures appleWebApp capable and status bar style", () => {
      expect(layoutSource).toContain("appleWebApp");
      expect(layoutSource).toContain("capable: true");
      expect(layoutSource).toContain('"apple-mobile-web-app-capable": "yes"');
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
    it("provides a service worker with a fetch event handler and offline navigation fallback", () => {
      const swSource = read("public/sw.js");
      expect(swSource).toContain('addEventListener("install"');
      expect(swSource).toContain('addEventListener("activate"');
      expect(swSource).toContain('addEventListener("fetch"');
      // Verifies non-http schemes (extensions) and non-GET requests are bypassed
      expect(swSource).toContain('!event.request.url.startsWith("http://")');
      expect(swSource).toContain('event.request.method !== "GET"');
      // Verifies offline fallback on navigation failure
      expect(swSource).toContain('event.request.mode === "navigate"');
      expect(swSource).toContain("Service Unavailable (Offline)");
    });

    it("registers service worker across all secure contexts and localhost IPs", () => {
      const pwaRegisterSource = read("components/pwa-register.tsx");
      expect(pwaRegisterSource).toContain("window.isSecureContext");
      expect(pwaRegisterSource).toContain('"127.0.0.1"');
      expect(pwaRegisterSource).toContain('{ scope: "/" }');
      expect(pwaRegisterSource).toContain("visibilitychange");
    });

    it("provides valid public site.webmanifest with non-empty identity and maskable icon", () => {
      const siteManifest = JSON.parse(read("public/site.webmanifest"));
      expect(siteManifest.name).toBe("Ananya ERP");
      expect(siteManifest.short_name).toBe("Ananya");
      expect(siteManifest.icons.length).toBeGreaterThan(0);
      const purposes = siteManifest.icons.map((i: { purpose?: string }) => i.purpose);
      expect(purposes).toContain("maskable");
    });

    it("configures non-caching headers for service worker in Next.js", () => {
      const nextConfigSource = read("next.config.mjs");
      expect(nextConfigSource).toContain('source: "/sw.js"');
      expect(nextConfigSource).toContain("no-cache, no-store, must-revalidate");
      expect(nextConfigSource).toContain("Service-Worker-Allowed");
    });
  });
});
