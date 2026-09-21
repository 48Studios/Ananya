/**
 * External reference validation.
 *
 * Documentation can point at a resource that is not stored by Ananya (a
 * manufacturer product page, a vendor-hosted manual, ...). Those references are
 * validated here so the API never stores an unusable or dangerous URL.
 *
 * Deliberately out of scope: crawling, scraping, mirroring or downloading the
 * target. An external reference is only ever a validated string.
 */

/** Only secure or plain web protocols are accepted. */
export const EXTERNAL_URL_ALLOWED_PROTOCOLS = ['https:', 'http:'] as const;

/**
 * Generous upper bound. Long enough for query strings on distributor sites,
 * short enough that the value cannot be used as a storage channel.
 */
export const MAX_EXTERNAL_URL_LENGTH = 2048;

export interface NormalizedExternalUrl {
  /** The URL that will be stored, with surrounding whitespace removed. */
  url: string;
  /** Lower-cased hostname, for display ("source") and diagnostics. */
  host: string;
  protocol: 'https:' | 'http:';
}

export type ExternalUrlRejection =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'MALFORMED'
  | 'UNSUPPORTED_PROTOCOL'
  | 'MISSING_HOST'
  | 'EMBEDDED_CREDENTIALS';

export interface ExternalUrlValidationFailure {
  ok: false;
  reason: ExternalUrlRejection;
  message: string;
}

export interface ExternalUrlValidationSuccess {
  ok: true;
  value: NormalizedExternalUrl;
}

export type ExternalUrlValidationResult =
  ExternalUrlValidationSuccess | ExternalUrlValidationFailure;

/**
 * Validates and normalises an external reference.
 *
 * Rules:
 *  - `https` and `http` only (no `javascript:`, `data:`, `file:`, ...)
 *  - hostname required
 *  - userinfo (`https://user:pass@host/`) rejected — it is a credential leak
 *    disguised as a link, and the UI cannot display it safely
 *  - the URL is stored verbatim modulo trimming: no rewriting, no trailing
 *    slash or query edits, so what a user sees is what was recorded
 */
export function validateExternalUrl(
  input: unknown,
): ExternalUrlValidationResult {
  if (typeof input !== 'string') {
    return {
      ok: false,
      reason: 'EMPTY',
      message: 'External URL is required.',
    };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      reason: 'EMPTY',
      message: 'External URL is required.',
    };
  }

  if (trimmed.length > MAX_EXTERNAL_URL_LENGTH) {
    return {
      ok: false,
      reason: 'TOO_LONG',
      message: `External URL must be ${MAX_EXTERNAL_URL_LENGTH} characters or fewer.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: 'MALFORMED',
      message:
        'External URL is not a valid absolute URL. Include the scheme, for example https://example.com/datasheet.pdf.',
    };
  }

  if (
    !EXTERNAL_URL_ALLOWED_PROTOCOLS.includes(
      parsed.protocol as (typeof EXTERNAL_URL_ALLOWED_PROTOCOLS)[number],
    )
  ) {
    return {
      ok: false,
      reason: 'UNSUPPORTED_PROTOCOL',
      message: `External URL must use http or https. Received "${parsed.protocol.replace(':', '')}".`,
    };
  }

  if (!parsed.hostname) {
    return {
      ok: false,
      reason: 'MISSING_HOST',
      message: 'External URL must include a hostname.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: 'EMBEDDED_CREDENTIALS',
      message:
        'External URL must not embed credentials. Remove the user:password portion.',
    };
  }

  return {
    ok: true,
    value: {
      url: trimmed,
      host: parsed.hostname.toLowerCase(),
      protocol: parsed.protocol as 'https:' | 'http:',
    },
  };
}

/**
 * Hostname used to label the source of an external reference. Returns `null`
 * for anything that cannot be parsed, so callers can degrade gracefully instead
 * of rendering a broken link.
 */
export function externalUrlHost(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim().length === 0) return null;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}
