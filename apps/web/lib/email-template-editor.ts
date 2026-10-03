import type { EmailTemplateDto } from "./api/email-templates-api";

/**
 * Pure editor helpers shared by the notification settings page and its tests.
 * Variable validation mirrors the server allowlist; the server remains the
 * authority and re-validates every save.
 */

export interface EmailTemplateDraft {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isEnabled: boolean;
}

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function extractTemplateVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function findUnknownVariables(
  draft: EmailTemplateDraft,
  allowedVariables: string[],
): string[] {
  const allowed = new Set(allowedVariables);
  const unknown = new Set<string>();
  for (const field of [draft.subject, draft.bodyHtml, draft.bodyText]) {
    for (const variable of extractTemplateVariables(field)) {
      if (!allowed.has(variable)) unknown.add(variable);
    }
  }
  return [...unknown];
}

export function draftFromTemplate(template: EmailTemplateDto): EmailTemplateDraft {
  return {
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    bodyText: template.bodyText,
    isEnabled: template.isEnabled,
  };
}

export function hasUnsavedChanges(
  template: EmailTemplateDto,
  draft: EmailTemplateDraft,
): boolean {
  return (
    template.subject !== draft.subject ||
    template.bodyHtml !== draft.bodyHtml ||
    template.bodyText !== draft.bodyText ||
    template.isEnabled !== draft.isEnabled
  );
}

export function describeOutboxStatus(status: string): string {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "SENDING":
      return "Sending";
    case "SENT":
      return "Accepted by provider";
    case "FAILED":
      return "Failed";
    case "SKIPPED":
      return "Skipped (mail disabled)";
    default:
      return status;
  }
}

export function outboxStatusClassName(status: string): string {
  if (status === "SENT") {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  }
  if (status === "FAILED") {
    return "bg-destructive/10 text-destructive border-destructive/20";
  }
  if (status === "SKIPPED") {
    return "bg-muted text-muted-foreground border-border";
  }
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
}
