import { createHash } from "crypto";

export const SEED_NAMESPACE = "ananya-demo-v1";

export function deterministicUuid(key: string): string {
  const hash = createHash("sha256")
    .update(`${SEED_NAMESPACE}:${key}`)
    .digest("hex");

  const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

export function seedKey(...parts: Array<string | number>): string {
  return parts.join(":");
}
