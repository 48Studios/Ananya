/**
 * Security and validation utilities for 3D spatial model assets.
 * Conforms to RFC-0064 & RFC-0066 asset security mandates.
 *
 * Prevents arbitrary filesystem traversal, unvalidated schemes,
 * credential leakage, and unsupported file formats.
 */

export const ALLOWED_3D_ASSET_PROTOCOLS = ["https:", "http:"] as const;
export const ALLOWED_3D_ASSET_EXTENSIONS = [".glb", ".gltf"] as const;
export const MAX_3D_ASSET_URL_LENGTH = 512;

export type AssetUrlRejectionReason =
  | "EMPTY"
  | "TOO_LONG"
  | "MALFORMED"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_EXTENSION"
  | "PATH_TRAVERSAL"
  | "EMBEDDED_CREDENTIALS"
  | "MISSING_HOST";

export interface AssetUrlValidationSuccess {
  ok: true;
  url: string;
  format: "GLB" | "GLTF";
  isRelative: boolean;
  hostname: string | null;
}

export interface AssetUrlValidationFailure {
  ok: false;
  reason: AssetUrlRejectionReason;
  message: string;
}

export type AssetUrlValidationResult =
  | AssetUrlValidationSuccess
  | AssetUrlValidationFailure;

/**
 * Validates and normalizes an asset URL or relative path for custom 3D models.
 *
 * Rules:
 * 1. Must be non-empty string <= 2048 characters.
 * 2. Must be either an absolute URL (http/https) or a clean relative path starting with '/'.
 * 3. Prohibits 'file:', 'javascript:', 'data:', 'blob:', and any other unsafe schemes.
 * 4. Prohibits embedded credentials (user:pass@host).
 * 5. Prohibits directory traversal ('..').
 * 6. Must end with '.glb' or '.gltf' (case-insensitive, ignoring safe query params).
 */
export function validate3DAssetUrl(input: unknown): AssetUrlValidationResult {
  if (typeof input !== "string") {
    return {
      ok: false,
      reason: "EMPTY",
      message: "Asset URL must be a non-empty string.",
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "EMPTY",
      message: "Asset URL must be a non-empty string.",
    };
  }

  if (trimmed.length > MAX_3D_ASSET_URL_LENGTH) {
    return {
      ok: false,
      reason: "TOO_LONG",
      message: `Asset URL exceeds maximum length of ${MAX_3D_ASSET_URL_LENGTH} characters.`,
    };
  }

  // Prevent directory traversal attacks
  if (trimmed.includes("..") || trimmed.includes("\\")) {
    return {
      ok: false,
      reason: "PATH_TRAVERSAL",
      message: "Asset URL must not contain path traversal sequences ('..' or '\\').",
    };
  }

  // Case 1: Relative path starting with '/' (e.g. /models/warehouse-shelf.glb)
  if (trimmed.startsWith("/")) {
    // Disallow protocol-relative URLs like '//evil.com/model.glb'
    if (trimmed.startsWith("//")) {
      return {
        ok: false,
        reason: "MALFORMED",
        message: "Protocol-relative URLs are not permitted. Use an explicit https:// scheme or absolute path.",
      };
    }

    const cleanPath = trimmed.split("?")[0]?.split("#")[0]?.toLowerCase() || "";
    const hasValidExt = ALLOWED_3D_ASSET_EXTENSIONS.some((ext) =>
      cleanPath.endsWith(ext),
    );

    if (!hasValidExt) {
      return {
        ok: false,
        reason: "UNSUPPORTED_EXTENSION",
        message: "Asset must be a .glb or .gltf file.",
      };
    }

    const format = cleanPath.endsWith(".glb") ? "GLB" : "GLTF";
    return {
      ok: true,
      url: trimmed,
      format,
      isRelative: true,
      hostname: null,
    };
  }

  // Case 2: Absolute URL (e.g. https://storage.48studios.com/models/shelf.glb)
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "MALFORMED",
      message: "Asset URL is not a valid absolute or relative URL.",
    };
  }

  if (
    !ALLOWED_3D_ASSET_PROTOCOLS.includes(
      parsed.protocol as (typeof ALLOWED_3D_ASSET_PROTOCOLS)[number],
    )
  ) {
    return {
      ok: false,
      reason: "UNSUPPORTED_PROTOCOL",
      message: `Asset URL protocol must be https or http. Received "${parsed.protocol}".`,
    };
  }

  if (!parsed.hostname) {
    return {
      ok: false,
      reason: "MISSING_HOST",
      message: "Absolute asset URL must include a valid hostname.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "EMBEDDED_CREDENTIALS",
      message: "Asset URL must not embed authentication credentials.",
    };
  }

  const cleanPathname = parsed.pathname.toLowerCase();
  const hasValidExt = ALLOWED_3D_ASSET_EXTENSIONS.some((ext) =>
    cleanPathname.endsWith(ext),
  );

  if (!hasValidExt) {
    return {
      ok: false,
      reason: "UNSUPPORTED_EXTENSION",
      message: "Asset must be a .glb or .gltf file.",
    };
  }

  const format = cleanPathname.endsWith(".glb") ? "GLB" : "GLTF";

  return {
    ok: true,
    url: trimmed,
    format,
    isRelative: false,
    hostname: parsed.hostname.toLowerCase(),
  };
}
