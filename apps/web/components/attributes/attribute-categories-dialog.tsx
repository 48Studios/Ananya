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
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type AttributeCategoryBindingDto,
  type SuggestedCategoryBindingDto,
  type SuspiciousBindingDto,
} from "@/lib/api/attributes-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { useAuth } from "@/lib/auth/auth-context";
import { ATTRIBUTE_WRITE_PERMISSION } from "@/lib/attribute-review-queue";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  FolderTree,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Hash,
  Check,
  Sparkles,
  HelpCircle,
  X,
  ShieldAlert,
} from "lucide-react";

interface AttributeCategoriesDialogProps {
  isOpen: boolean;
  attribute: AttributeDefinitionDto | null;
  onClose: () => void;
  onBindingsUpdated?: () => void;
}

export function AttributeCategoriesDialog({
  isOpen,
  attribute,
  onClose,
  onBindingsUpdated,
}: AttributeCategoriesDialogProps) {
  /**
   * Applying a suggested binding writes `category_attributes`, so the two apply
   * actions below require the attribute-write permission. The endpoint behind them
   * (`POST /ml/attributes/apply-bindings`) is guarded with the same permission, so
   * hiding the controls here only avoids offering an action the API would refuse.
   */
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(ATTRIBUTE_WRITE_PERMISSION);

  const [bindings, setBindings] = React.useState<AttributeCategoryBindingDto[]>(
    [],
  );
  const [allCategories, setAllCategories] = React.useState<CategoryDto[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // New binding form state
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("");
  const [isRequired, setIsRequired] = React.useState<boolean>(false);
  const [sortOrder, setSortOrder] = React.useState<number>(10);
  const [isBinding, setIsBinding] = React.useState(false);

  // Inline editing state for an existing binding
  const [editingBindingId, setEditingBindingId] = React.useState<string | null>(
    null,
  );
  const [editIsRequired, setEditIsRequired] = React.useState<boolean>(false);
  const [editSortOrder, setEditSortOrder] = React.useState<number>(0);
  const [isUpdating, setIsUpdating] = React.useState(false);

  // Deletion state
  const [unbindingTarget, setUnbindingTarget] =
    React.useState<AttributeCategoryBindingDto | null>(null);
  const [isUnbinding, setIsUnbinding] = React.useState(false);

  // AI Suggestions & Suspicious Bindings state
  const [aiSuggestions, setAiSuggestions] = React.useState<
    SuggestedCategoryBindingDto[]
  >([]);
  const [suspiciousBindings, setSuspiciousBindings] = React.useState<
    SuspiciousBindingDto[]
  >([]);
  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>(
    {},
  );
  const [dismissedSuggestions, setDismissedSuggestions] = React.useState<
    Set<string>
  >(new Set());
  const [dismissedSuspicious, setDismissedSuspicious] = React.useState<
    Set<string>
  >(new Set());
  const [applyingAllHigh, setApplyingAllHigh] = React.useState(false);

  const loadData = React.useCallback(async () => {
    if (!attribute) return;
    setLoading(true);
    setError(null);
    try {
      const [fetchedBindings, categories] = await Promise.all([
        attributesApi.getAttributeCategories(attribute.id),
        categoriesApi.getAll().catch(() => []),
      ]);
      setBindings(fetchedBindings);
      setAllCategories(categories);

      // Fetch AI suggestions concurrently
      attributesApi
        .suggestBindings({
          attributeId: attribute.id,
          attributeCode: attribute.code,
          attributeName: attribute.name,
          dataType: attribute.dataType,
          unitCategory: attribute.unitCategory || undefined,
        })
        .then((res) => {
          setAiSuggestions(res.suggestions || []);
          setSuspiciousBindings(res.suspiciousExistingBindings || []);
        })
        .catch(() => {});
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load category bindings.",
      );
    } finally {
      setLoading(false);
    }
  }, [attribute]);

  React.useEffect(() => {
    if (isOpen && attribute) {
      loadData();
      setSelectedCategoryId("");
      setIsRequired(false);
      setSortOrder((attribute.categoryBindings?.length ?? 0) * 10 + 10);
      setEditingBindingId(null);
      setError(null);
      setSuccessMsg(null);
      setDismissedSuggestions(new Set());
      setDismissedSuspicious(new Set());
    }
  }, [isOpen, attribute, loadData]);

  // Set of category IDs already bound
  const boundCategoryIds = React.useMemo(() => {
    return new Set(bindings.map((b) => b.categoryId));
  }, [bindings]);

  // Available categories for binding
  const availableCategories = React.useMemo(() => {
    return allCategories.filter((c) => !boundCategoryIds.has(c.id));
  }, [allCategories, boundCategoryIds]);

  // Handle creating a new binding
  const handleBindCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attribute || !selectedCategoryId) {
      setError("Please select a category to bind.");
      return;
    }

    setIsBinding(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const cat = allCategories.find((c) => c.id === selectedCategoryId);
      await attributesApi.bindCategory(attribute.id, {
        categoryId: selectedCategoryId,
        isRequired,
        sortOrder: Number(sortOrder) || 0,
      });

      setSelectedCategoryId("");
      setIsRequired(false);
      setSortOrder((bindings.length + 1) * 10 + 10);
      setSuccessMsg(
        `Successfully bound to category "${cat?.name || selectedCategoryId}".`,
      );
      await loadData();
      onBindingsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to bind category to attribute.",
      );
    } finally {
      setIsBinding(false);
    }
  };

  // Start editing a binding
  const handleStartEdit = (binding: AttributeCategoryBindingDto) => {
    setEditingBindingId(binding.id);
    setEditIsRequired(binding.isRequired);
    setEditSortOrder(binding.sortOrder);
  };

  // Save updated binding
  const handleSaveEdit = async (binding: AttributeCategoryBindingDto) => {
    if (!attribute) return;
    setIsUpdating(true);
    setError(null);
    try {
      await attributesApi.updateCategoryBinding(
        attribute.id,
        binding.categoryId,
        {
          isRequired: editIsRequired,
          sortOrder: Number(editSortOrder) || 0,
        },
      );
      setEditingBindingId(null);
      setSuccessMsg(`Updated binding for "${binding.categoryName}".`);
      await loadData();
      onBindingsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update category binding.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  // Unbind confirm
  const handleConfirmUnbind = async () => {
    if (!attribute || !unbindingTarget) return;
    setIsUnbinding(true);
    setError(null);
    try {
      await attributesApi.unbindCategory(
        attribute.id,
        unbindingTarget.categoryId,
      );
      setSuccessMsg(
        `Unbound from category "${unbindingTarget.categoryName}".`,
      );
      setUnbindingTarget(null);
      await loadData();
      onBindingsUpdated?.();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to unbind category.",
      );
    } finally {
      setIsUnbinding(false);
    }
  };

  const toggleWhy = (catId: string) => {
    setExpandedWhy((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleAcceptAiSuggestion = async (sug: SuggestedCategoryBindingDto) => {
    if (!attribute) return;
    try {
      await attributesApi.bindCategory(attribute.id, {
        categoryId: sug.categoryId,
        isRequired: sug.suggestedRequired ?? false,
        sortOrder: (bindings.length + 1) * 10,
      });
      setSuccessMsg(`Bound category "${sug.categoryName}" via AI proposal.`);
      setDismissedSuggestions((prev) => new Set([...prev, sug.categoryId]));
      await loadData();
      onBindingsUpdated?.();

      attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          categoryId: sug.categoryId,
          items: [
            {
              suggestionType: "ATTRIBUTE_BINDING",
              field: "binding",
              userAction: "ACCEPTED",
              predictedValue: sug.categoryName,
              finalValue: sug.categoryName,
              confidence: sug.confidence,
              confidenceLevel: sug.confidenceLevel,
            },
          ],
        })
        .catch(() => {});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to apply suggested binding",
      );
    }
  };

  const handleRejectAiSuggestion = (sug: SuggestedCategoryBindingDto) => {
    if (!attribute) return;
    setDismissedSuggestions((prev) => new Set([...prev, sug.categoryId]));
    attributesApi
      .recordFeedback({
        attributeDefinitionId: attribute.id,
        categoryId: sug.categoryId,
        items: [
          {
            suggestionType: "ATTRIBUTE_BINDING",
            field: "binding",
            userAction: "REJECTED",
            predictedValue: sug.categoryName,
            finalValue: null,
            confidence: sug.confidence,
            confidenceLevel: sug.confidenceLevel,
          },
        ],
      })
      .catch(() => {});
  };

  const handleAcceptAllHighConfidence = async () => {
    if (!attribute) return;
    const highSuggestions = aiSuggestions.filter(
      (s) =>
        s.confidenceLevel === "HIGH" &&
        !boundCategoryIds.has(s.categoryId) &&
        !dismissedSuggestions.has(s.categoryId),
    );
    if (highSuggestions.length === 0) return;

    setApplyingAllHigh(true);
    try {
      await attributesApi.applyBindings({
        attributeId: attribute.id,
        bindings: highSuggestions.map((s, idx) => ({
          categoryId: s.categoryId,
          isRequired: s.suggestedRequired ?? false,
          sortOrder: (bindings.length + idx + 1) * 10,
        })),
      });
      setSuccessMsg(`Applied ${highSuggestions.length} high-confidence bindings.`);
      setDismissedSuggestions(
        (prev) =>
          new Set([...prev, ...highSuggestions.map((s) => s.categoryId)]),
      );
      await loadData();
      onBindingsUpdated?.();

      attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          items: highSuggestions.map((s) => ({
            suggestionType: "ATTRIBUTE_BINDING",
            field: "binding",
            userAction: "ACCEPTED" as const,
            predictedValue: s.categoryName,
            finalValue: s.categoryName,
            confidence: s.confidence,
            confidenceLevel: s.confidenceLevel,
          })),
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply bindings");
    } finally {
      setApplyingAllHigh(false);
    }
  };

  const handleKeepSuspicious = (susp: SuspiciousBindingDto) => {
    setDismissedSuspicious((prev) => new Set([...prev, susp.categoryId]));
    if (attribute) {
      attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          categoryId: susp.categoryId,
          items: [
            {
              suggestionType: "SUSPICIOUS_BINDING",
              field: "binding",
              userAction: "ACCEPTED",
              predictedValue: susp.categoryName,
              finalValue: susp.categoryName,
              confidenceLevel: susp.confidenceLevel,
            },
          ],
        })
        .catch(() => {});
    }
  };

  const handleRemoveSuspicious = async (susp: SuspiciousBindingDto) => {
    if (!attribute) return;
    try {
      await attributesApi.unbindCategory(attribute.id, susp.categoryId);
      setSuccessMsg(
        `Removed suspicious binding from category "${susp.categoryName}".`,
      );
      setDismissedSuspicious((prev) => new Set([...prev, susp.categoryId]));
      await loadData();
      onBindingsUpdated?.();

      attributesApi
        .recordFeedback({
          attributeDefinitionId: attribute.id,
          categoryId: susp.categoryId,
          items: [
            {
              suggestionType: "SUSPICIOUS_BINDING",
              field: "binding",
              userAction: "REJECTED",
              predictedValue: susp.categoryName,
              finalValue: null,
              confidenceLevel: susp.confidenceLevel,
            },
          ],
        })
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove binding");
    }
  };

  const pendingAiSuggestions = aiSuggestions.filter(
    (s) =>
      !boundCategoryIds.has(s.categoryId) &&
      !dismissedSuggestions.has(s.categoryId),
  );

  const highConfidenceCount = pendingAiSuggestions.filter(
    (s) => s.confidenceLevel === "HIGH",
  ).length;

  const activeSuspiciousBindings = suspiciousBindings.filter(
    (s) =>
      boundCategoryIds.has(s.categoryId) &&
      !dismissedSuspicious.has(s.categoryId),
  );

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Category Bindings"
        description={
          attribute
            ? `Manage category assignments and inheritance rules for "${attribute.name}" (${attribute.code}).`
            : "Manage category assignments"
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

          {/* Suspicious Bindings Warning Banner */}
          {activeSuspiciousBindings.length > 0 && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-3 text-xs text-rose-950 dark:text-rose-200 animate-in fade-in-50 duration-150">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Suspicious Category Binding Detected</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Statistical analysis indicates unusual or low-frequency usage for this attribute in the following bound categories:
              </p>
              <div className="space-y-2">
                {activeSuspiciousBindings.map((susp) => (
                  <div
                    key={susp.categoryId}
                    className="p-2.5 rounded-lg bg-background/90 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{susp.categoryName}</span>
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border">
                          {susp.categoryCode}
                        </span>
                        <StatusBadge status="DRAFT" label="LOW CONFIDENCE" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">{susp.reason}</p>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => handleKeepSuspicious(susp)}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Keep Binding
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        onClick={() => handleRemoveSuspicious(susp)}
                        className="h-7 text-xs gap-1"
                      >
                        <Trash2 className="size-3" /> Remove Binding
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Suggested Bindings Section */}
          {pendingAiSuggestions.length > 0 && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3 shadow-2xs animate-in fade-in-50 duration-150">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">
                      AI Suggested Category Bindings
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Proposals based on active Data Packs, component frequency, and semantic classification.
                    </p>
                  </div>
                </div>

                {highConfidenceCount > 0 && (
                  <Button
                    type="button"
                    size="xs"
                    disabled={applyingAllHigh || !canWrite}
                    onClick={handleAcceptAllHighConfidence}
                    title={
                      canWrite
                        ? "Apply all high-confidence suggested bindings"
                        : `Applying suggested bindings requires the ${ATTRIBUTE_WRITE_PERMISSION} permission.`
                    }
                    className="h-7 text-xs font-medium px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {applyingAllHigh ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}
                    Accept High-Confidence ({highConfidenceCount})
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {pendingAiSuggestions.map((sug) => {
                  const isWhyExpanded = Boolean(expandedWhy[sug.categoryId]);
                  return (
                    <div
                      key={sug.categoryId}
                      className="p-3 bg-background border border-border rounded-lg space-y-2 shadow-2xs flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-xs text-foreground truncate">
                              {sug.categoryName}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border">
                              {sug.categoryCode}
                            </span>
                          </div>
                          <StatusBadge
                            status={
                              sug.confidenceLevel === "HIGH"
                                ? "SUCCESS"
                                : sug.confidenceLevel === "MEDIUM"
                                ? "IN_REVIEW"
                                : "DRAFT"
                            }
                            label={`${Math.round(sug.confidence * 100)}%`}
                          />
                        </div>

                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {sug.reason}
                        </p>

                        {/* Why Evidence Accordion */}
                        {isWhyExpanded && (
                          <div className="pt-2 border-t border-border/60 text-[11px] space-y-1 animate-in fade-in-50 duration-150">
                            <span className="font-semibold text-foreground text-[10px] uppercase tracking-wider block">
                              Evidence:
                            </span>
                            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                              {sug.evidence.map((ev, idx) => (
                                <li key={idx}>
                                  <span className="text-foreground">{ev.description}</span>
                                  {ev.source && (
                                    <span className="ml-1 text-[9px] font-mono text-muted-foreground">
                                      [{ev.source}]
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => toggleWhy(sug.categoryId)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Why this category?"
                        >
                          <HelpCircle className="size-3.5" />
                        </Button>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleRejectAiSuggestion(sug)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Reject suggestion"
                          >
                            <X className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={!canWrite}
                            onClick={() => handleAcceptAiSuggestion(sug)}
                            title={
                              canWrite
                                ? "Apply this suggested binding"
                                : `Applying suggested bindings requires the ${ATTRIBUTE_WRITE_PERMISSION} permission.`
                            }
                            className="h-6 text-[11px] px-2.5 border-primary/30 text-primary hover:bg-primary/10 gap-1 font-medium"
                          >
                            <Check className="size-3" /> Accept
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Category Binding Section */}
          <div className="p-4 bg-card border border-border rounded-xl space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-primary" />
                Assign to Category
              </h4>
              {availableCategories.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {availableCategories.length} available
                </span>
              )}
            </div>

            <form onSubmit={handleBindCategory} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Category Select */}
                <div className="sm:col-span-8">
                  <Field>
                    <FieldLabel className="text-[11px] font-medium">
                      Category <span className="text-destructive">*</span>
                    </FieldLabel>
                    <SearchableSelect
                      id="dialog-bind-category"
                      placeholder="Choose a category to bind..."
                      searchPlaceholder="Search categories..."
                      emptyText={
                        allCategories.length === 0
                          ? "No categories found"
                          : "All categories are already bound"
                      }
                      value={selectedCategoryId}
                      onValueChange={(val) => setSelectedCategoryId(val)}
                      options={availableCategories.map((c) => ({
                        value: c.id,
                        label: c.name,
                        chip: c.code,
                      }))}
                    />
                  </Field>
                </div>

                {/* Display Order */}
                <div className="sm:col-span-4">
                  <Field>
                    <FieldLabel className="text-[11px] font-medium">
                      Sort Order
                    </FieldLabel>
                    <Input
                      type="number"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(Number(e.target.value))}
                      className="h-9 text-xs font-mono"
                      placeholder="10"
                    />
                  </Field>
                </div>
              </div>

              {/* Requirement Switch & Submit Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <Switch
                    id="dialog-bind-required"
                    checked={isRequired}
                    onCheckedChange={setIsRequired}
                  />
                  <label
                    htmlFor="dialog-bind-required"
                    className="text-xs text-muted-foreground cursor-pointer select-none"
                  >
                    <strong className="text-foreground font-medium">
                      Required
                    </strong>{" "}
                    — mandate this specification on components in this category
                  </label>
                </div>

                <Button
                  type="submit"
                  size="sm"
                  disabled={isBinding || !selectedCategoryId}
                  className="gap-1.5 self-end sm:self-auto shrink-0 h-8 text-xs font-medium px-4"
                >
                  {isBinding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Bind Category
                </Button>
              </div>
            </form>
          </div>

          {/* Bound Categories Management List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="font-medium text-foreground">
                Assigned Categories ({bindings.length})
              </span>
              <span className="text-[11px]">Ordered by display priority</span>
            </div>

            {loading ? (
              <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading category bindings...
              </div>
            ) : bindings.length > 0 ? (
              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card shadow-2xs">
                {/* Column Headers */}
                <div className="hidden sm:grid sm:grid-cols-12 px-3.5 py-2 text-[11px] font-medium text-muted-foreground bg-muted/40 border-b border-border">
                  <div className="col-span-5">Category</div>
                  <div className="col-span-3">Requirement</div>
                  <div className="col-span-2">Order</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {bindings.map((binding) => {
                  const isEditingThis = editingBindingId === binding.id;

                  if (isEditingThis) {
                    return (
                      <div
                        key={binding.id}
                        className="p-3.5 border-l-2 border-l-primary bg-primary/[0.03] flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-2"
                      >
                        {/* Category Info (5 cols) */}
                        <div className="sm:col-span-5 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-foreground">
                              {binding.categoryName}
                            </span>
                            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                              {binding.categoryCode}
                            </span>
                          </div>
                        </div>

                        {/* Requirement Toggle (3 cols) */}
                        <div className="sm:col-span-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`edit-req-${binding.id}`}
                              checked={editIsRequired}
                              onCheckedChange={setEditIsRequired}
                            />
                            <label
                              htmlFor={`edit-req-${binding.id}`}
                              className="text-[11px] font-medium cursor-pointer select-none text-foreground"
                            >
                              Required
                            </label>
                          </div>
                        </div>

                        {/* Sort Order Input (2 cols) */}
                        <div className="sm:col-span-2">
                          <Input
                            type="number"
                            value={editSortOrder}
                            onChange={(e) =>
                              setEditSortOrder(Number(e.target.value))
                            }
                            className="h-7 w-16 text-xs font-mono"
                          />
                        </div>

                        {/* Save / Cancel Actions (2 cols) */}
                        <div className="sm:col-span-2 flex items-center sm:justify-end gap-1 self-end sm:self-auto">
                          <Button
                            size="xs"
                            variant="default"
                            disabled={isUpdating}
                            onClick={() => handleSaveEdit(binding)}
                            className="gap-1 h-7 text-xs px-2.5"
                          >
                            {isUpdating ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Save
                          </Button>

                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={isUpdating}
                            onClick={() => setEditingBindingId(null)}
                            className="h-7 text-xs px-2"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={binding.id}
                      className="p-3.5 flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-2 hover:bg-muted/30 transition-colors"
                    >
                      {/* Category Info (5 cols) */}
                      <div className="sm:col-span-5 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-foreground">
                            {binding.categoryName}
                          </span>
                          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                            {binding.categoryCode}
                          </span>
                        </div>
                      </div>

                      {/* Requirement Badge (3 cols) */}
                      <div className="sm:col-span-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border ${binding.isRequired
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium"
                            : "bg-muted text-muted-foreground border-border"
                            }`}
                        >
                          {binding.isRequired && (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {binding.isRequired ? "Required" : "Optional"}
                        </span>
                      </div>

                      {/* Sort Order (2 cols) */}
                      <div className="sm:col-span-2">
                        <span className="text-xs font-mono text-muted-foreground flex items-center gap-0.5">
                          <Hash className="w-3 h-3 text-muted-foreground/60" />
                          {binding.sortOrder}
                        </span>
                      </div>

                      {/* Action Buttons (2 cols) */}
                      <div className="sm:col-span-2 flex items-center sm:justify-end gap-1 self-end sm:self-auto">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleStartEdit(binding)}
                          className="text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Edit Binding Settings"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setUnbindingTarget(binding)}
                          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Unbind Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center border border-dashed border-border rounded-xl bg-muted/5">
                <FolderTree className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">
                  Not bound to any categories
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-sm mx-auto">
                  Assign this specification to one or more categories above to enable
                  it for components and products in those groups.
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

      {/* Confirm Unbind Dialog */}
      <ConfirmDialog
        isOpen={Boolean(unbindingTarget)}
        title="Unbind Category"
        description={`Are you sure you want to remove the binding with category "${unbindingTarget?.categoryName}"? Products in this category will no longer have this attribute assigned automatically.`}
        confirmText="Unbind Category"
        variant="destructive"
        loading={isUnbinding}
        onConfirm={handleConfirmUnbind}
        onCancel={() => setUnbindingTarget(null)}
      />
    </>
  );
}
