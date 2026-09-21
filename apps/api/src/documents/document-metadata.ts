/**
 * Coercion helpers for documentation metadata.
 *
 * `multipart/form-data` has no type system: every text field arrives as a
 * string, while the JSON metadata route sends real booleans and arrays. These
 * helpers accept both shapes so the DTOs can be written once and the service
 * always receives normalised values.
 */

export const MAX_DOCUMENT_TAGS = 20;
export const MAX_DOCUMENT_TAG_LENGTH = 40;

/**
 * Normalises a tag list from an array, a JSON array string
 * (`'["a","b"]'`) or a comma-separated string (`'a, b'`).
 *
 * Tags are trimmed, length-capped, de-duplicated (case-insensitively, keeping
 * the first spelling) and limited in count. An unusable value yields an empty
 * list rather than an error: tags are descriptive, and losing a malformed tag
 * list must not fail an otherwise valid upload.
 */
export function parseDocumentTags(input: unknown): string[] {
  const raw: unknown[] = [];

  if (Array.isArray(input)) {
    for (const entry of input as unknown[]) {
      raw.push(entry);
    }
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length > 0) {
      if (trimmed.startsWith('[')) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            for (const entry of parsed as unknown[]) {
              raw.push(entry);
            }
          }
        } catch {
          // Fall through: treat as a comma-separated list.
        }
      }
      if (raw.length === 0) {
        raw.push(...trimmed.split(','));
      }
    }
  }

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const tag = entry.trim().slice(0, MAX_DOCUMENT_TAG_LENGTH);
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_DOCUMENT_TAGS) break;
  }

  return tags;
}

/**
 * Parses a boolean that may arrive as a real boolean or as the string
 * `'true'`/`'false'`/`'1'`/`'0'`. Anything else is `undefined`, so a typo is
 * ignored rather than silently interpreted as `true`.
 */
export function parseBooleanInput(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    const normalised = input.trim().toLowerCase();
    if (normalised === 'true' || normalised === '1') return true;
    if (normalised === 'false' || normalised === '0') return false;
  }
  return undefined;
}

/** Trims an optional text field, treating blank input as "not provided". */
export function parseOptionalText(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
