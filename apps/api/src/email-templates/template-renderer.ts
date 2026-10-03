/**
 * Minimal, non-evaluating template renderer.
 *
 * Syntax is `{{variable_name}}` only. There is no expression language, no
 * conditionals, no function calls, and no filesystem or network access: a
 * template can only interpolate values the server puts into the context.
 */

export const MAX_SUBJECT_LENGTH = 255;
export const MAX_BODY_LENGTH = 20000;

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const INTERNAL_URL_PATTERN = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;

export type TemplateContextValue = string | number | boolean | null | undefined;
export type TemplateContext = Record<string, TemplateContextValue>;

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  unknownVariables: string[];
}

export function extractTemplateVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only relative, internal paths are accepted. Anything that could navigate the
 * recipient off-site (scheme, host, protocol-relative, backslashes, control
 * characters) collapses to an empty string.
 */
export function sanitizeInternalUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return '';
  if (trimmed.startsWith('//')) return '';
  if (trimmed.includes('\\')) return '';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return '';
  if (!INTERNAL_URL_PATTERN.test(trimmed)) return '';
  return trimmed;
}

/** Subjects must stay single-line: CR/LF are header-injection vectors. */
export function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function validateTemplateContent(
  content: { subject: string; bodyHtml: string; bodyText: string },
  allowedVariables: string[],
): TemplateValidationResult {
  const errors: string[] = [];
  const unknownVariables = new Set<string>();

  if (!content.subject.trim()) {
    errors.push('Subject is required.');
  }
  if (content.subject.length > MAX_SUBJECT_LENGTH) {
    errors.push(`Subject must be at most ${MAX_SUBJECT_LENGTH} characters.`);
  }
  if (!content.bodyHtml.trim()) {
    errors.push('HTML body is required.');
  }
  if (content.bodyHtml.length > MAX_BODY_LENGTH) {
    errors.push(`HTML body must be at most ${MAX_BODY_LENGTH} characters.`);
  }
  if (!content.bodyText.trim()) {
    errors.push('Plain-text body is required.');
  }
  if (content.bodyText.length > MAX_BODY_LENGTH) {
    errors.push(
      `Plain-text body must be at most ${MAX_BODY_LENGTH} characters.`,
    );
  }

  const allowed = new Set(allowedVariables);
  for (const field of [content.subject, content.bodyHtml, content.bodyText]) {
    for (const variable of extractTemplateVariables(field)) {
      if (!allowed.has(variable)) unknownVariables.add(variable);
    }
  }

  for (const variable of unknownVariables) {
    errors.push(`Unknown variable "{{${variable}}}" for this event type.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    unknownVariables: [...unknownVariables],
  };
}

export function renderTemplate(
  template: string,
  context: TemplateContext,
  options: { escapeHtml: boolean; urlVariables?: string[] },
): string {
  const urlVariables = new Set(options.urlVariables ?? []);

  return template.replace(
    VARIABLE_PATTERN,
    (_match: string, rawName: string): string => {
      const name = rawName;
      const rawValue = context[name];

      if (urlVariables.has(name)) {
        return sanitizeInternalUrl(rawValue);
      }

      if (rawValue === null || rawValue === undefined) return '';
      const value = String(rawValue);
      return options.escapeHtml ? escapeHtml(value) : value;
    },
  );
}

export function renderEmailContent(
  content: { subject: string; bodyHtml: string; bodyText: string },
  context: TemplateContext,
  urlVariables: string[],
): { subject: string; html: string; text: string } {
  return {
    subject: sanitizeSubject(
      renderTemplate(content.subject, context, {
        escapeHtml: false,
        urlVariables,
      }),
    ),
    html: renderTemplate(content.bodyHtml, context, {
      escapeHtml: true,
      urlVariables,
    }),
    text: renderTemplate(content.bodyText, context, {
      escapeHtml: false,
      urlVariables,
    }),
  };
}
