"use client";

import * as React from "react";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type AttributeOptionDto,
  type EnumOptionSuggestionDto,
} from "@/lib/api/attributes-api";
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tag,
  Hash,
  Sparkles,
  RefreshCw,
  X,
  Check,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface AttributeOptionsDialogProps {
  isOpen: boolean;
  attribute: AttributeDefinitionDto | null;
  onClose: () => void;
  onOptionsUpdated?: () => void;
}

export function AttributeOptionsDialog({
  isOpen,
  attribute,
  onClose,
  onOptionsUpdated,
}: AttributeOptionsDialogProps) {
  const [options, setOptions] = React.useState<AttributeOptionDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newCode, setNewCode] = React.useState("");
  const [addingOption, setAddingOption] = React.useState(false);
  const [deletingOption, setDeletingOption] =
    React.useState<AttributeOptionDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // AI Suggestion State
  const [aiSuggestions, setAiSuggestions] = React.useState<
    EnumOptionSuggestionDto[]
  >([]);
  const [loadingAi, setLoadingAi] = React.useState(false);
  const [addingCode, setAddingCode] = React.useState<string | null>(null);
  const [batchAdding, setBatchAdding] = React.useState(false);
  const [dismissedCodes, setDismissedCodes] = React.useState<Set<string>>(
    new Set(),
  );

  const fetchOptions = React.useCallback(async () => {
    if (!attribute?.id) return;
    setLoading(true);
    setError(null);
    try {
      const refreshed = await attributesApi.getById(attribute.id);
      setOptions(refreshed.options || []);
    } catch {
      setError("Failed to fetch current attribute options.");
    } finally {
      setLoading(false);
    }
  }, [attribute?.id]);

  const fetchAiSuggestions = React.useCallback(
    async (currentOptions?: AttributeOptionDto[]) => {
      if (!attribute?.id) return;
      setLoadingAi(true);
      try {
        const optsToCompare = currentOptions ?? options;
        const existing = optsToCompare.map((o) => o.code);
        const res = await attributesApi.suggestEnumValues({
          attributeId: attribute.id,
          attributeCode: attribute.code,
          attributeName: attribute.name,
          existingOptions: existing,
        });
        setAiSuggestions(res.suggestedOptions || []);
      } catch {
        // Non-critical fallback
      } finally {
        setLoadingAi(false);
      }
    },
    // Only recreate if attribute ID or code changes, not when options changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attribute?.id, attribute?.code, attribute?.name],
  );

  React.useEffect(() => {
    if (!isOpen || !attribute?.id) return;

    let cancelled = false;

    // Reset local UI states
    const initialOptions = attribute.options || [];
    setOptions(initialOptions);
    setNewLabel("");
    setNewCode("");
    setError(null);
    setSuccessMsg(null);
    setDismissedCodes(new Set());

    // Single unified initial load for dialog open
    const loadDialogData = async () => {
      setLoading(true);
      try {
        const refreshed = await attributesApi.getById(attribute.id);
        if (cancelled) return;
        const freshOptions = refreshed.options || [];
        setOptions(freshOptions);

        setLoadingAi(true);
        try {
          const res = await attributesApi.suggestEnumValues({
            attributeId: attribute.id,
            attributeCode: attribute.code,
            attributeName: attribute.name,
            existingOptions: freshOptions.map((o) => o.code),
          });
          if (!cancelled) {
            setAiSuggestions(res.suggestedOptions || []);
          }
        } catch {
          // ignore
        } finally {
          if (!cancelled) setLoadingAi(false);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to fetch current attribute options.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDialogData();

    return () => {
      cancelled = true;
    };
  }, [isOpen, attribute?.id]);

  // Set of already configured codes or labels (case-insensitive)
  const existingSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const o of options) {
      set.add(o.code.toLowerCase());
      set.add(o.label.toLowerCase());
    }
    return set;
  }, [options]);

  // Available suggestions excluding existing or dismissed
  const pendingSuggestions = React.useMemo(() => {
    return aiSuggestions.filter(
      (s) =>
        !existingSet.has(s.code.toLowerCase()) &&
        !existingSet.has(s.label.toLowerCase()) &&
        !dismissedCodes.has(s.code.toLowerCase()),
    );
  }, [aiSuggestions, existingSet, dismissedCodes]);

  const highConfidenceCount = React.useMemo(() => {
    return pendingSuggestions.filter(
      (s) => !s.confidenceLevel || s.confidenceLevel === "HIGH",
    ).length;
  }, [pendingSuggestions]);

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attribute || !newLabel.trim()) return;

    const label = newLabel.trim();
    const code = (newCode.trim() || label)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");

    setAddingOption(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await attributesApi.addOption(attribute.id, {
        code,
        label,
        sortOrder: options.length,
      });
      setNewLabel("");
      setNewCode("");
      setSuccessMsg(`Added option "${label}".`);
      await fetchOptions();
      onOptionsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to add attribute option.",
      );
    } finally {
      setAddingOption(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion: EnumOptionSuggestionDto) => {
    if (!attribute) return;
    setAddingCode(suggestion.code);
    setError(null);
    setSuccessMsg(null);
    try {
      await attributesApi.addOption(attribute.id, {
        code: suggestion.code,
        label: suggestion.label,
        sortOrder: options.length,
      });

      await attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          items: [
            {
              suggestionType: "ENUM_OPTION",
              field: "option_value",
              userAction: "ACCEPTED",
              predictedValue: suggestion.label,
              finalValue: suggestion.label,
              confidenceLevel: suggestion.confidenceLevel || "HIGH",
            },
          ],
        })
        .catch(() => { });

      setSuccessMsg(`Added suggested option "${suggestion.label}".`);
      await fetchOptions();
      onOptionsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to add suggested option.",
      );
    } finally {
      setAddingCode(null);
    }
  };

  const handleAddAllHighConfidence = async () => {
    if (!attribute || pendingSuggestions.length === 0) return;
    const highConf = pendingSuggestions.filter(
      (s) => !s.confidenceLevel || s.confidenceLevel === "HIGH",
    );
    if (highConf.length === 0) return;

    setBatchAdding(true);
    setError(null);
    setSuccessMsg(null);
    let addedCount = 0;
    try {
      for (const s of highConf) {
        try {
          await attributesApi.addOption(attribute.id, {
            code: s.code,
            label: s.label,
            sortOrder: options.length + addedCount,
          });
          addedCount++;
        } catch {
          // continue with next
        }
      }

      await attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          items: highConf.map((s) => ({
            suggestionType: "ENUM_OPTION",
            field: "option_value",
            userAction: "ACCEPTED" as const,
            predictedValue: s.label,
            finalValue: s.label,
            confidenceLevel: s.confidenceLevel || ("HIGH" as const),
          })),
        })
        .catch(() => { });

      setSuccessMsg(
        `Added ${addedCount} standard option${addedCount === 1 ? "" : "s"}.`,
      );
      await fetchOptions();
      onOptionsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to complete batch option addition.",
      );
    } finally {
      setBatchAdding(false);
    }
  };

  const handleDismissSuggestion = (suggestion: EnumOptionSuggestionDto) => {
    setDismissedCodes((prev) => new Set([...prev, suggestion.code.toLowerCase()]));
    if (attribute) {
      attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          items: [
            {
              suggestionType: "ENUM_OPTION",
              field: "option_value",
              userAction: "REJECTED",
              predictedValue: suggestion.label,
              finalValue: null,
              confidenceLevel: suggestion.confidenceLevel || "MEDIUM",
            },
          ],
        })
        .catch(() => { });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingOption) return;
    setDeleteLoading(true);
    setError(null);
    try {
      await attributesApi.deleteOption(deletingOption.id);
      setSuccessMsg(`Removed option "${deletingOption.label}".`);
      setDeletingOption(null);
      await fetchOptions();
      onOptionsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove option. It may be referenced by existing products.",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={
          attribute
            ? `Manage Options: ${attribute.name}`
            : "Manage Options"
        }
        description={
          attribute
            ? `Configure predefined selection choices for "${attribute.name}" (${attribute.code}). Products can select from these options.`
            : "Configure predefined selection choices."
        }
        size="lg"
      >
        <DialogShellBody className="space-y-4">
          {/* Notifications */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* AI Suggestions Section */}
          <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex size-10 m-0 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    AI Option Suggestions
                    {pendingSuggestions.length > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        {pendingSuggestions.length} available
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Standard values grounded in electronics taxonomies and catalog data.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={loadingAi}
                  onClick={() => fetchAiSuggestions()}
                  className="h-7 text-xs gap-1"
                  title="Scan for standard options"
                >
                  <RefreshCw
                    className={`size-3 ${loadingAi ? "animate-spin" : ""}`}
                  />
                  Scan
                </Button>

                {highConfidenceCount >= 2 && (
                  <Button
                    type="button"
                    size="xs"
                    disabled={batchAdding}
                    onClick={handleAddAllHighConfidence}
                    className="h-7 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                  >
                    {batchAdding ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}
                    Add All High Confidence ({highConfidenceCount})
                  </Button>
                )}
              </div>
            </div>

            {loadingAi ? (
              <div className="py-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>Checking standard option taxonomy...</span>
              </div>
            ) : pendingSuggestions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                {pendingSuggestions.map((suggestion) => {
                  const isAddingThis = addingCode === suggestion.code;
                  return (
                    <div
                      key={suggestion.code}
                      className="p-2.5 rounded-lg bg-card border border-border flex items-center justify-between gap-2 hover:border-primary/40 transition-colors shadow-2xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-foreground truncate">
                            {suggestion.label}
                          </span>
                          <code className="text-[10px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border/80">
                            {suggestion.code}
                          </code>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge
                            status={
                              suggestion.confidenceLevel === "HIGH" ||
                                suggestion.confidence >= 0.9
                                ? "SUCCESS"
                                : "IN_REVIEW"
                            }
                            label={
                              suggestion.confidenceLevel === "HIGH" ||
                                suggestion.confidence >= 0.9
                                ? "HIGH"
                                : "MEDIUM"
                            }
                          />
                          {(suggestion.source || suggestion.provenance) && (
                            <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[120px]">
                              {suggestion.source || suggestion.provenance}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDismissSuggestion(suggestion)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Dismiss suggestion"
                        >
                          <X className="size-3" />
                        </Button>

                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isAddingThis || batchAdding}
                          onClick={() => handleAcceptSuggestion(suggestion)}
                          className="h-6 text-[11px] px-2 border-primary/30 text-primary hover:bg-primary/10 gap-1 font-medium"
                        >
                          {isAddingThis ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Plus className="size-3" />
                          )}
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-2.5 text-center text-xs text-muted-foreground/80 bg-background/50 rounded-lg border border-dashed border-border/60">
                {options.length > 0
                  ? "Standard options up to date. You can add custom choices using the manual form below."
                  : "No automated suggestions found for this attribute. Add custom choices below."}
              </div>
            )}
          </div>

          {/* Add New Option Form Card */}
          <div className="p-4 bg-card border border-border rounded-xl space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-primary" />
                Add Custom Option
              </h4>
              {options.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {options.length} configured
                </span>
              )}
            </div>

            <form onSubmit={handleAddOption} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Option Label */}
                <div className="sm:col-span-8">
                  <Field>
                    <FieldLabel className="text-[11px] font-medium">
                      Option Label <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value);
                        if (!newCode || newCode === newLabel.toLowerCase()) {
                          setNewCode(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_-]/g, "_"),
                          );
                        }
                      }}
                      placeholder="e.g. 0805, SMD, Gold Plated"
                      className="h-9 text-xs"
                      disabled={addingOption}
                    />
                  </Field>
                </div>

                {/* Option Code */}
                <div className="sm:col-span-4">
                  <Field>
                    <FieldLabel className="text-[11px] font-medium">
                      Code
                    </FieldLabel>
                    <Input
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="Auto Generated"
                      className="h-9 text-xs font-mono"
                      disabled={addingOption}
                    />
                  </Field>
                </div>
              </div>

              {/* Submit Row */}
              <div className="flex justify-end pt-3 border-t border-border/40">
                <Button
                  type="submit"
                  size="sm"
                  disabled={addingOption || !newLabel.trim()}
                  className="gap-1.5 shrink-0 h-8 text-xs font-medium px-4"
                >
                  {addingOption ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Add Option
                </Button>
              </div>
            </form>
          </div>

          {/* Options List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-medium text-foreground">
                Configured Choices ({options.length})
              </span>
              <span className="text-[11px]">Sorted by priority</span>
            </div>

            {loading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading options...
              </div>
            ) : options.length > 0 ? (
              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card shadow-2xs max-h-[300px] overflow-y-auto">
                {/* Column Headers */}
                <div className="hidden sm:grid sm:grid-cols-12 px-3.5 py-2 text-[11px] font-medium text-muted-foreground bg-muted/40 border-b border-border sticky top-0">
                  <div className="col-span-1">#</div>
                  <div className="col-span-5">Label</div>
                  <div className="col-span-4">Code</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {options.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className="p-3.5 flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-2 hover:bg-muted/30 transition-colors"
                  >
                    {/* Index (1 col) */}
                    <div className="sm:col-span-1">
                      <span className="text-xs font-mono text-muted-foreground flex items-center gap-0.5">
                        <Hash className="w-3 h-3 text-muted-foreground/60 sm:hidden" />
                        {idx + 1}
                      </span>
                    </div>

                    {/* Label (5 cols) */}
                    <div className="sm:col-span-5">
                      <span className="text-xs font-medium text-foreground">
                        {opt.label}
                      </span>
                    </div>

                    {/* Code (4 cols) */}
                    <div className="sm:col-span-4">
                      <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                        {opt.code}
                      </span>
                    </div>

                    {/* Actions (2 cols) */}
                    <div className="sm:col-span-2 flex items-center sm:justify-end gap-1 self-end sm:self-auto">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeletingOption(opt)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Remove Option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center border border-dashed border-border rounded-xl bg-muted/5">
                <Tag className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">
                  No options defined
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-sm mx-auto">
                  Add predefined choices using the AI suggestions or custom form above. Products will select from these options.
                </p>
              </div>
            )}
          </div>
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton onClick={onClose}>
            Done
          </DialogShellCancelButton>
        </DialogShellFooter>
      </DialogShell>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingOption)}
        title="Remove Option"
        description={`Are you sure you want to remove "${deletingOption?.label}"? This option will no longer be available for assignment.`}
        confirmText="Remove Option"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingOption(null)}
      />
    </>
  );
}
