import { describe, expect, it } from "vitest";
import {
  MAX_3D_ASSET_URL_LENGTH,
  validate3DAssetUrl,
} from "./spatial-asset-security";

describe("spatial-asset-security: validate3DAssetUrl", () => {
  describe("Valid Asset URLs", () => {
    it("accepts valid https URL with .glb extension", () => {
      const result = validate3DAssetUrl(
        "https://cdn.48studios.internal/models/warehouse-shelf.glb",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.format).toBe("GLB");
        expect(result.isRelative).toBe(false);
        expect(result.hostname).toBe("cdn.48studios.internal");
      }
    });

    it("accepts valid https URL with .gltf extension", () => {
      const result = validate3DAssetUrl(
        "https://storage.example.com/assets/drawer-cabinet.gltf",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.format).toBe("GLTF");
        expect(result.isRelative).toBe(false);
      }
    });

    it("accepts valid http URL in local development", () => {
      const result = validate3DAssetUrl("http://localhost:3000/models/test.glb");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.format).toBe("GLB");
        expect(result.hostname).toBe("localhost");
      }
    });

    it("accepts clean relative paths starting with /", () => {
      const result = validate3DAssetUrl("/static/3d/standard-rack.glb");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.format).toBe("GLB");
        expect(result.isRelative).toBe(true);
        expect(result.hostname).toBeNull();
      }
    });

    it("accepts uppercase or mixed-case extensions (.GLB, .Gltf)", () => {
      const glbResult = validate3DAssetUrl("https://assets.local/model.GLB");
      expect(glbResult.ok).toBe(true);
      if (glbResult.ok) expect(glbResult.format).toBe("GLB");

      const gltfResult = validate3DAssetUrl("/models/cabinet.GltF");
      expect(gltfResult.ok).toBe(true);
      if (gltfResult.ok) expect(gltfResult.format).toBe("GLTF");
    });

    it("handles safe query parameters on asset URLs", () => {
      const result = validate3DAssetUrl(
        "https://storage.example.com/models/shelf.glb?version=2&token=abc",
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.format).toBe("GLB");
      }
    });

    it("handles safe hash fragments on asset URLs", () => {
      const hashOnly = validate3DAssetUrl("/models/cabinet.glb#root-node");
      expect(hashOnly.ok).toBe(true);
      if (hashOnly.ok) {
        expect(hashOnly.format).toBe("GLB");
      }

      const queryAndHash = validate3DAssetUrl(
        "https://storage.example.com/models/shelf.glb?version=2#scene-0",
      );
      expect(queryAndHash.ok).toBe(true);
      if (queryAndHash.ok) {
        expect(queryAndHash.format).toBe("GLB");
      }
    });
  });

  describe("Security Restrictions & Rejections", () => {
    it("rejects non-string or empty input", () => {
      expect(validate3DAssetUrl(null).ok).toBe(false);
      expect(validate3DAssetUrl(undefined).ok).toBe(false);
      expect(validate3DAssetUrl("").ok).toBe(false);
      expect(validate3DAssetUrl("   ").ok).toBe(false);
    });

    it("rejects URLs exceeding maximum length of 512 characters", () => {
      expect(MAX_3D_ASSET_URL_LENGTH).toBe(512);
      const longUrl = "https://cdn.example.com/" + "a".repeat(512) + ".glb";
      const result = validate3DAssetUrl(longUrl);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("TOO_LONG");
      }
    });

    it("rejects path traversal attempts with '..' or '\\'", () => {
      const traversalUrls = [
        "https://cdn.example.com/models/../../etc/passwd.glb",
        "/models/../secret/rack.glb",
        "https://cdn.example.com/models\\hidden\\rack.glb",
        "/static/..\\..\\sensitive.glb",
      ];

      for (const url of traversalUrls) {
        const result = validate3DAssetUrl(url);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe("PATH_TRAVERSAL");
        }
      }
    });

    it("rejects protocol-relative URLs", () => {
      const result = validate3DAssetUrl("//malicious.domain/model.glb");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("MALFORMED");
      }
    });

    it("rejects dangerous or unsupported schemes (file:, javascript:, data:, blob:)", () => {
      const dangerousSchemes = [
        "file:///etc/models/shelf.glb",
        "file:///C:/models/shelf.glb",
        "javascript:alert(1)//shelf.glb",
        "data:model/gltf-binary;base64,AAAA.glb",
        "blob:https://example.com/uuid-1234.glb",
        "ftp://storage.example.com/shelf.glb",
      ];

      for (const uri of dangerousSchemes) {
        const result = validate3DAssetUrl(uri);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe("UNSUPPORTED_PROTOCOL");
        }
      }
    });

    it("rejects embedded user credentials (user:password@host)", () => {
      const result = validate3DAssetUrl(
        "https://admin:secretPass@internal.vault.com/models/shelf.glb",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("EMBEDDED_CREDENTIALS");
      }
    });

    it("rejects unsupported 3D file formats (.obj, .fbx, .stl, .step, .exe)", () => {
      const unsupported = [
        "https://assets.local/model.obj",
        "https://assets.local/model.fbx",
        "https://assets.local/model.stl",
        "https://assets.local/model.step",
        "https://assets.local/script.exe",
        "/models/inventory.zip",
        "/models/noextension",
      ];

      for (const uri of unsupported) {
        const result = validate3DAssetUrl(uri);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe("UNSUPPORTED_EXTENSION");
        }
      }
    });
  });
});
