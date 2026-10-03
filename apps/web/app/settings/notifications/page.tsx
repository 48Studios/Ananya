"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionGuard } from "@/lib/auth/auth-context";
import {
  emailTemplatesApi,
  type EmailEventDefinitionDto,
  type EmailOutboxDto,
  type EmailPreviewDto,
  type EmailTemplateDto,
  type MailStatusDto,
} from "@/lib/api/email-templates-api";
import {
  describeOutboxStatus,
  draftFromTemplate,
  findUnknownVariables,
  hasUnsavedChanges,
  outboxStatusClassName,
  type EmailTemplateDraft,
} from "@/lib/email-template-editor";
import { formatDate } from "@/lib/utils";

type Notice = { type: "success" | "error"; message: string } | null;

export default function NotificationSettingsPage() {
  const [templates, setTemplates] = React.useState<EmailTemplateDto[]>([]);
  const [registry, setRegistry] = React.useState<EmailEventDefinitionDto[]>([]);
  const [mailStatus, setMailStatus] = React.useState<MailStatusDto | null>(null);
  const [outbox, setOutbox] = React.useState<EmailOutboxDto[]>([]);
  const [outboxCounts, setOutboxCounts] = React.useState<Record<
    string,
    number
  > | null>(null);

  const [selectedEventType, setSelectedEventType] = React.useState<
    string | null
  >(null);
  const [draft, setDraft] = React.useState<EmailTemplateDraft | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [testSending, setTestSending] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<EmailPreviewDto | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);

  const selectedTemplate = React.useMemo(
    () =>
      templates.find((template) => template.eventType === selectedEventType) ??
      null,
    [templates, selectedEventType],
  );
  const selectedDefinition = React.useMemo(
    () =>
      registry.find((entry) => entry.eventType === selectedEventType) ?? null,
    [registry, selectedEventType],
  );

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [templateData, registryData] = await Promise.all([
        emailTemplatesApi.listTemplates(),
        emailTemplatesApi.getVariables(),
      ]);
      setTemplates(templateData);
      setRegistry(registryData);

      const firstTemplate = templateData[0] ?? null;
      if (firstTemplate) {
        setSelectedEventType((current) => current ?? firstTemplate.eventType);
        setDraft((current) => current ?? draftFromTemplate(firstTemplate));
      }
    } catch {
      setLoadError("Failed to load email templates.");
    } finally {
      setLoading(false);
    }

    const [statusResult, outboxResult, countsResult] =
      await Promise.allSettled([
        emailTemplatesApi.getMailStatus(),
        emailTemplatesApi.getOutbox(20),
        emailTemplatesApi.getOutboxCounts(),
      ]);
    if (statusResult.status === "fulfilled") setMailStatus(statusResult.value);
    if (outboxResult.status === "fulfilled") setOutbox(outboxResult.value);
    if (countsResult.status === "fulfilled")
      setOutboxCounts(countsResult.value);
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectTemplate = (template: EmailTemplateDto) => {
    setSelectedEventType(template.eventType);
    setDraft(draftFromTemplate(template));
    setPreview(null);
    setNotice(null);
  };

  const updateDraft = (patch: Partial<EmailTemplateDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const unsaved =
    selectedTemplate && draft
      ? hasUnsavedChanges(selectedTemplate, draft)
      : false;

  const unknownVariables =
    draft && selectedDefinition
      ? findUnknownVariables(
          draft,
          selectedDefinition.variables.map((variable) => variable.name),
        )
      : [];

  const refreshOutbox = async () => {
    const [rows, counts] = await Promise.allSettled([
      emailTemplatesApi.getOutbox(20),
      emailTemplatesApi.getOutboxCounts(),
    ]);
    if (rows.status === "fulfilled") setOutbox(rows.value);
    if (counts.status === "fulfilled") setOutboxCounts(counts.value);
  };

  const handleSave = async () => {
    if (!selectedTemplate || !draft) return;
    if (unknownVariables.length > 0) {
      setNotice({
        type: "error",
        message: `Unknown variable(s): ${unknownVariables
          .map((name) => `{{${name}}}`)
          .join(", ")}. Remove them or use the variable reference.`,
      });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const updated = await emailTemplatesApi.updateTemplate(
        selectedTemplate.eventType,
        {
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          bodyText: draft.bodyText,
          isEnabled: draft.isEnabled,
          expectedVersion: selectedTemplate.version,
        },
      );
      setTemplates((current) =>
        current.map((template) =>
          template.eventType === updated.eventType ? updated : template,
        ),
      );
      setDraft(draftFromTemplate(updated));
      setNotice({ type: "success", message: "Template saved." });
    } catch (error: unknown) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save the template.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate || !draft) return;
    setPreviewing(true);
    setNotice(null);
    try {
      const rendered = await emailTemplatesApi.previewTemplate(
        selectedTemplate.eventType,
        {
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          bodyText: draft.bodyText,
        },
      );
      setPreview(rendered);
    } catch (error: unknown) {
      setPreview(null);
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to render the preview.",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleTestSend = async () => {
    if (!selectedTemplate || !draft) return;
    setTestSending(true);
    setNotice(null);
    try {
      const result = await emailTemplatesApi.testSend(
        selectedTemplate.eventType,
        {
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          bodyText: draft.bodyText,
        },
      );
      setNotice({
        type: "success",
        message: `Test email accepted by the mail transport for ${result.recipient}.`,
      });
      await refreshOutbox();
    } catch (error: unknown) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Test email could not be sent.",
      });
    } finally {
      setTestSending(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedTemplate) return;
    setRestoring(true);
    setNotice(null);
    try {
      const restored = await emailTemplatesApi.restoreDefault(
        selectedTemplate.eventType,
      );
      setTemplates((current) =>
        current.map((template) =>
          template.eventType === restored.eventType ? restored : template,
        ),
      );
      setDraft(draftFromTemplate(restored));
      setPreview(null);
      setNotice({
        type: "success",
        message: "Default template restored.",
      });
    } catch (error: unknown) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to restore the default template.",
      });
    } finally {
      setRestoring(false);
      setRestoreOpen(false);
    }
  };

  const copyVariable = async (name: string) => {
    const token = `{{${name}}}`;
    try {
      await navigator.clipboard.writeText(token);
      setNotice({ type: "success", message: `Copied ${token}.` });
    } catch {
      setNotice({ type: "error", message: `Could not copy ${token}.` });
    }
  };

  return (
    <PermissionGuard permission="Administration.Settings">
      <div className="space-y-6">
        <PageHeader
          backHref="/settings"
          backLabel="Back to Settings"
          title="Notifications & Email"
          description="Manage the templates used for inventory alert emails, preview them with sample data, and review delivery outcomes."
        />

        {loading ? (
          <LoadingState message="Loading notification settings..." />
        ) : loadError ? (
          <ErrorState
            title="Could not load notification settings"
            message={loadError}
            onRetry={() => void loadData()}
          />
        ) : (
          <>
            {mailStatus && (
              <div
                className={`flex flex-wrap items-center gap-3 p-3 text-xs border rounded-lg ${
                  mailStatus.enabled
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span className="font-semibold">
                  {mailStatus.enabled
                    ? "Outbound email is enabled"
                    : "Outbound email is disabled"}
                </span>
                <span className="text-muted-foreground">
                  transport: {mailStatus.transport} · from: {mailStatus.from}
                </span>
                {mailStatus.configErrors.length > 0 && (
                  <span className="text-destructive">
                    {mailStatus.configErrors.join(" ")}
                  </span>
                )}
              </div>
            )}

            {notice && (
              <div
                className={`flex items-start gap-2 p-3 text-xs border rounded-lg ${
                  notice.type === "error"
                    ? "bg-destructive/10 border-destructive/20 text-destructive"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {notice.type === "error" ? (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" />
                )}
                <span>{notice.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-bold text-foreground">
                  Event templates
                </h3>
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No templates are available.
                  </p>
                ) : (
                  templates.map((template) => {
                    const definition = registry.find(
                      (entry) => entry.eventType === template.eventType,
                    );
                    const isSelected =
                      template.eventType === selectedEventType;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? "border-primary/40 bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {definition?.name ?? template.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              template.isEnabled
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {template.isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-muted-foreground mt-1">
                          {template.eventType}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Updated {formatDate(template.updatedAt)} · v
                          {template.version}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedTemplate && draft ? (
                <div className="space-y-6">
                  <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          {selectedDefinition?.name ?? selectedTemplate.name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {selectedDefinition?.description ??
                            selectedTemplate.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {unsaved && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            Unsaved changes
                          </span>
                        )}
                        <Switch
                          checked={draft.isEnabled}
                          onCheckedChange={(checked) =>
                            updateDraft({ isEnabled: checked })
                          }
                          aria-label="Template enabled"
                        />
                      </div>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="template-subject">
                        Subject
                      </FieldLabel>
                      <Input
                        id="template-subject"
                        value={draft.subject}
                        maxLength={255}
                        onChange={(event) =>
                          updateDraft({ subject: event.target.value })
                        }
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="template-html">HTML body</FieldLabel>
                      <Textarea
                        id="template-html"
                        value={draft.bodyHtml}
                        rows={10}
                        className="font-mono text-xs"
                        onChange={(event) =>
                          updateDraft({ bodyHtml: event.target.value })
                        }
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="template-text">
                        Plain-text fallback
                      </FieldLabel>
                      <Textarea
                        id="template-text"
                        value={draft.bodyText}
                        rows={6}
                        className="font-mono text-xs"
                        onChange={(event) =>
                          updateDraft({ bodyText: event.target.value })
                        }
                      />
                    </Field>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleSave()}
                        disabled={saving}
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Save template
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handlePreview()}
                        disabled={previewing}
                      >
                        {previewing ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleTestSend()}
                        disabled={testSending}
                      >
                        {testSending ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Send test to me
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRestoreOpen(true)}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Restore defaults
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-card border border-border rounded-xl p-6 space-y-3">
                      <h3 className="text-sm font-bold text-foreground">
                        Available variables
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Use <span className="font-mono">{"{{name}}"}</span>{" "}
                        placeholders. Unknown variables are rejected when you
                        save.
                      </p>
                      <div className="space-y-2">
                        {(selectedDefinition?.variables ?? []).map(
                          (variable) => (
                            <div
                              key={variable.name}
                              className="flex items-start justify-between gap-3 p-2 rounded-md border border-border"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono text-foreground">
                                  {`{{${variable.name}}}`}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {variable.description}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Example: {variable.example}
                                </p>
                              </div>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                title={`Copy {{${variable.name}}}`}
                                aria-label={`Copy {{${variable.name}}}`}
                                onClick={() => void copyVariable(variable.name)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-6 space-y-3">
                      <h3 className="text-sm font-bold text-foreground">
                        Preview
                      </h3>
                      {preview ? (
                        <div className="space-y-3">
                          <p className="text-xs text-foreground">
                            <span className="text-muted-foreground">
                              Subject:
                            </span>{" "}
                            {preview.subject}
                          </p>
                          <iframe
                            title="Email preview"
                            sandbox=""
                            srcDoc={preview.html}
                            className="w-full h-64 rounded-md border border-border bg-white"
                          />
                          <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground border border-border rounded-md p-2 max-h-40 overflow-auto">
                            {preview.text}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Render the current draft with sample data to check
                          layout and variable output.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl p-6">
                  <p className="text-sm text-muted-foreground">
                    Select an event template to edit it.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-primary" />
                  Delivery log
                </h3>
                {outboxCounts && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {Object.entries(outboxCounts).map(([status, total]) => (
                      <span
                        key={status}
                        className={`px-2 py-0.5 rounded-full border ${outboxStatusClassName(
                          status,
                        )}`}
                      >
                        {describeOutboxStatus(status)}: {total}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {outbox.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No email has been queued yet. Alert emails appear here after
                  the next inventory alert fires.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3 font-medium">Event</th>
                        <th className="py-2 pr-3 font-medium">Recipient</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Attempts</th>
                        <th className="py-2 pr-3 font-medium">Last error</th>
                        <th className="py-2 pr-3 font-medium">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outbox.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border/60 align-top"
                        >
                          <td className="py-2 pr-3 font-mono text-[11px]">
                            {row.eventType}
                          </td>
                          <td className="py-2 pr-3">{row.recipientEmail}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`px-2 py-0.5 rounded-full border ${outboxStatusClassName(
                                row.status,
                              )}`}
                            >
                              {describeOutboxStatus(row.status)}
                            </span>
                          </td>
                          <td className="py-2 pr-3 font-mono">
                            {row.attempts}/{row.maxAttempts}
                          </td>
                          <td className="py-2 pr-3 text-destructive max-w-[240px] truncate">
                            {row.lastError ?? "—"}
                          </td>
                          <td className="py-2 pr-3 font-mono text-muted-foreground">
                            {row.sentAt ? formatDate(row.sentAt) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <ConfirmDialog
              isOpen={restoreOpen}
              title="Restore default template?"
              description="This replaces the current subject and bodies with the shipped defaults. Custom edits to this event will be lost."
              confirmText="Restore defaults"
              loading={restoring}
              onConfirm={() => void handleRestore()}
              onCancel={() => setRestoreOpen(false)}
            />
          </>
        )}
      </div>
    </PermissionGuard>
  );
}
