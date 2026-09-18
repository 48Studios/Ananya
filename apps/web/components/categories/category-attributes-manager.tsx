"use client";

import * as React from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Hash,
  Loader2,
  Sparkles,
  HelpCircle,
  Check,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell, DialogShellBody, DialogShellFooter, DialogShellCancelButton } from "@/components/ui/dialog-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type ResolvedCategoryAttributeDto,
  type SuggestedCategoryAttributeItemDto,
} from "@/lib/api/attributes-api";

interface CategoryAttributesManagerProps {
  categoryId: string;
  categoryName: string;
}

export function CategoryAttributesManager({
  categoryId,
  categoryName,
}: CategoryAttributesManagerProps) {
  const [attributes, setAttributes] = React.useState<ResolvedCategoryAttributeDto[]>([]);
  const [allDefinitions, setAllDefinitions] = React.useState<AttributeDefinitionDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // AI Suggestions state
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const [suggestedCategoryAttrs, setSuggestedCategoryAttrs] = React.useState<
    SuggestedCategoryAttributeItemDto[]
  >([]);
  const [selectedCodes, setSelectedCodes] = React.useState<Set<string>>(new Set());
  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>({});
  const [dismissedCodes, setDismissedCodes] = React.useState<Set<string>>(new Set());
  const [bindingSelected, setBindingSelected] = React.useState(false);

  // Assignment dialog state
  const [isAssignOpen, setIsAssignOpen] = React.useState(false);
  const [selectedDefinitionId, setSelectedDefinitionId] = React.useState<string>("");
  const [isRequired, setIsRequired] = React.useState(false);
  const [sortOrder, setSortOrder] = React.useState<number>(10);
  const [saving, setSaving] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  // Unassign dialog state
  const [unassignTarget, setUnassignTarget] = React.useState<ResolvedCategoryAttributeDto | null>(null);
  const [unassigning, setUnassigning] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catAttrs, allDefs] = await Promise.all([
        attributesApi.getByCategory(categoryId),
        attributesApi.getAll().catch(() => []),
      ]);
      setAttributes(catAttrs);
      setAllDefinitions(allDefs);

      // Concurrently fetch AI suggestions
      setLoadingSuggestions(true);
      attributesApi
        .suggestCategoryAttributes(categoryId)
        .then((res) => {
          setSuggestedCategoryAttrs(res.suggestions || []);
        })
        .catch(() => {})
        .finally(() => setLoadingSuggestions(false));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load category specifications");
      }
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Available definitions to assign (exclude already assigned)
  const directlyAssignedIds = React.useMemo(() => {
    return new Set(
      attributes
        .filter((a) => !a.inheritedFromCategoryId)
        .map((a) => a.attributeDefinition.id),
    );
  }, [attributes]);

  const availableDefinitions = React.useMemo(() => {
    return allDefinitions.filter((d) => !directlyAssignedIds.has(d.id));
  }, [allDefinitions, directlyAssignedIds]);

  const handleOpenAssign = (existing?: ResolvedCategoryAttributeDto) => {
    if (existing) {
      setSelectedDefinitionId(existing.attributeDefinition.id);
      setIsRequired(existing.isRequired);
      setSortOrder(existing.sortOrder);
    } else {
      setSelectedDefinitionId(availableDefinitions[0]?.id ?? "");
      setIsRequired(false);
      setSortOrder((attributes.length + 1) * 10);
    }
    setAssignError(null);
    setIsAssignOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDefinitionId) {
      setAssignError("Please select a specification to assign.");
      return;
    }

    setSaving(true);
    setAssignError(null);
    try {
      await attributesApi.assignCategoryAttribute(categoryId, {
        attributeDefinitionId: selectedDefinitionId,
        isRequired,
        sortOrder: Number(sortOrder) || 0,
      });

      setIsAssignOpen(false);
      const def = allDefinitions.find((d) => d.id === selectedDefinitionId);
      setSuccessMessage(
        `Specification "${def?.name || "Attribute"}" assigned to ${categoryName}.`,
      );
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAssignError(err.message);
      } else {
        setAssignError("Failed to assign specification to category");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmUnassign = async () => {
    if (!unassignTarget) return;

    setUnassigning(true);
    try {
      await attributesApi.unassignCategoryAttribute(
        categoryId,
        unassignTarget.attributeDefinition.id,
      );

      const removedName = unassignTarget.attributeDefinition.name;
      setUnassignTarget(null);
      setSuccessMessage(`Specification "${removedName}" unassigned from ${categoryName}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to unassign specification");
      }
    } finally {
      setUnassigning(false);
    }
  };

  const pendingSuggestions = suggestedCategoryAttrs.filter(
    (s) =>
      !directlyAssignedIds.has(s.attributeDefinitionId || "") &&
      !dismissedCodes.has(s.attributeCode),
  );

  const toggleSelectCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCodes.size === pendingSuggestions.length) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(pendingSuggestions.map((s) => s.attributeCode)));
    }
  };

  const toggleWhy = (code: string) => {
    setExpandedWhy((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const handleBindSingleSuggested = async (
    sug: SuggestedCategoryAttributeItemDto,
  ) => {
    try {
      let defId = sug.attributeDefinitionId;
      if (!defId) {
        const created = await attributesApi.createDefinition({
          code: sug.attributeCode,
          name: sug.attributeName,
          dataType: (sug.dataType as AttributeDefinitionDto["dataType"]) || "TEXT",
          unitCategory: sug.unitCategory,
          defaultUnit: sug.defaultUnit,
          groupName: sug.groupName,
          isFilterable: true,
        });
        defId = created.id;
      }

      await attributesApi.assignCategoryAttribute(categoryId, {
        attributeDefinitionId: defId,
        isRequired: sug.isRequired ?? false,
        sortOrder: (attributes.length + 1) * 10,
      });

      setSuccessMessage(
        `Bound specification "${sug.attributeName}" to ${categoryName}.`,
      );
      setDismissedCodes((prev) => new Set([...prev, sug.attributeCode]));
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();

      attributesApi
        .recordFeedback({
          categoryId,
          attributeDefinitionId: defId,
          items: [
            {
              suggestionType: "CATEGORY_ATTRIBUTES",
              field: "binding",
              userAction: "ACCEPTED",
              predictedValue: sug.attributeName,
              finalValue: sug.attributeName,
              confidence: sug.confidence,
              confidenceLevel: sug.confidenceLevel,
            },
          ],
        })
        .catch(() => {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to bind suggested specification",
      );
    }
  };

  const handleRejectSuggested = (sug: SuggestedCategoryAttributeItemDto) => {
    setDismissedCodes((prev) => new Set([...prev, sug.attributeCode]));
    attributesApi
      .recordFeedback({
        categoryId,
        attributeDefinitionId: sug.attributeDefinitionId,
        items: [
          {
            suggestionType: "CATEGORY_ATTRIBUTES",
            field: "binding",
            userAction: "REJECTED",
            predictedValue: sug.attributeName,
            finalValue: null,
            confidence: sug.confidence,
            confidenceLevel: sug.confidenceLevel,
          },
        ],
      })
      .catch(() => {});
  };

  const handleBindSelected = async () => {
    const toBind = pendingSuggestions.filter((s) =>
      selectedCodes.has(s.attributeCode),
    );
    if (toBind.length === 0) return;

    setBindingSelected(true);
    try {
      for (const sug of toBind) {
        let defId = sug.attributeDefinitionId;
        if (!defId) {
          const created = await attributesApi.createDefinition({
            code: sug.attributeCode,
            name: sug.attributeName,
            dataType:
              (sug.dataType as AttributeDefinitionDto["dataType"]) || "TEXT",
            unitCategory: sug.unitCategory,
            defaultUnit: sug.defaultUnit,
            groupName: sug.groupName,
            isFilterable: true,
          });
          defId = created.id;
        }
        await attributesApi.assignCategoryAttribute(categoryId, {
          attributeDefinitionId: defId,
          isRequired: sug.isRequired ?? false,
          sortOrder: (attributes.length + 1) * 10,
        });
      }

      setSuccessMessage(
        `Bound ${toBind.length} specifications to ${categoryName}.`,
      );
      setDismissedCodes(
        (prev) =>
          new Set([...prev, ...toBind.map((s) => s.attributeCode)]),
      );
      setSelectedCodes(new Set());
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();

      attributesApi
        .recordFeedback({
          categoryId,
          items: toBind.map((sug) => ({
            suggestionType: "CATEGORY_ATTRIBUTES",
            field: "binding",
            userAction: "ACCEPTED" as const,
            predictedValue: sug.attributeName,
            finalValue: sug.attributeName,
            confidence: sug.confidence,
            confidenceLevel: sug.confidenceLevel,
          })),
        })
        .catch(() => {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to bind selected specifications",
      );
    } finally {
      setBindingSelected(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            Configured Specifications & Attributes
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Technical attributes and engineering properties configured for components in this category.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleOpenAssign()}
          disabled={loading || availableDefinitions.length === 0}
          className="self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Assign Attribute
        </Button>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* AI Suggested Attributes Section */}
      {pendingSuggestions.length > 0 && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3.5 shadow-2xs animate-in fade-in-50 duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25 shrink-0">
                <Sparkles className="size-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  AI Suggested Specifications ({pendingSuggestions.length})
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Identified from component inventory frequency, manufacturer parameters, and Data Pack taxonomy.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={toggleSelectAll}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                {selectedCodes.size === pendingSuggestions.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
              {selectedCodes.size > 0 && (
                <Button
                  type="button"
                  size="xs"
                  disabled={bindingSelected}
                  onClick={handleBindSelected}
                  className="h-7 text-xs font-medium px-3 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {bindingSelected ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Bind Selected ({selectedCodes.size})
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {pendingSuggestions.map((sug) => {
              const isSelected = selectedCodes.has(sug.attributeCode);
              const isWhyExpanded = Boolean(expandedWhy[sug.attributeCode]);

              return (
                <div
                  key={sug.attributeCode}
                  className={`p-3 rounded-lg border transition-all space-y-2 flex flex-col justify-between shadow-2xs ${
                    isSelected
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectCode(sug.attributeCode)}
                          className="text-primary hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                          title={isSelected ? "Deselect" : "Select"}
                        >
                          {isSelected ? (
                            <CheckSquare className="size-4" />
                          ) : (
                            <Square className="size-4 text-muted-foreground" />
                          )}
                        </button>
                        <span className="font-semibold text-xs text-foreground truncate">
                          {sug.attributeName}
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

                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-muted-foreground">
                      <span className="bg-muted px-1.5 py-0.2 rounded border border-border">
                        {sug.attributeCode}
                      </span>
                      <span className="bg-muted px-1.5 py-0.2 rounded border border-border">
                        {sug.dataType}
                        {sug.defaultUnit ? ` (${sug.defaultUnit})` : ""}
                      </span>
                      {sug.groupName && (
                        <span className="bg-muted px-1.5 py-0.2 rounded border border-border">
                          {sug.groupName}
                        </span>
                      )}
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
                      onClick={() => toggleWhy(sug.attributeCode)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Why this specification?"
                    >
                      <HelpCircle className="size-3.5" />
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRejectSuggested(sug)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Dismiss suggestion"
                      >
                        <X className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => handleBindSingleSuggested(sug)}
                        className="h-6 text-[11px] px-2.5 border-primary/30 text-primary hover:bg-primary/10 gap-1 font-medium"
                      >
                        <Check className="size-3" /> Bind
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attributes List */}
      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Loading category specifications...
        </div>
      ) : attributes.length > 0 ? (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {attributes.map((item) => {
            const def = item.attributeDefinition;
            const isInherited = Boolean(item.inheritedFromCategoryId);

            return (
              <div
                key={def.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {def.name}
                    </span>
                    <span className="font-mono text-[11px] bg-muted/60 text-muted-foreground px-1.5 py-0.2 rounded border border-border">
                      {def.code}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {def.dataType}
                      {def.defaultUnit ? ` (${def.defaultUnit})` : ""}
                    </span>
                  </div>
                  {def.description && (
                    <p className="text-xs text-muted-foreground">
                      {def.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {/* Scope Badge */}
                  {isInherited ? (
                    <span
                      title="Inherited from parent category"
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border"
                    >
                      <Lock className="w-3 h-3" />
                      Inherited
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Direct
                    </span>
                  )}

                  {/* Required / Optional Badge */}
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${item.isRequired
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-medium"
                        : "bg-muted/50 text-muted-foreground border-border"
                      }`}
                  >
                    {item.isRequired ? "Required" : "Optional"}
                  </span>

                  {/* Sort Order */}
                  <span
                    title="Display Sort Order"
                    className="flex items-center gap-0.5 text-xs font-mono text-muted-foreground"
                  >
                    <Hash className="w-3 h-3 text-muted-foreground/60" />
                    {item.sortOrder}
                  </span>

                  {/* Actions */}
                  {!isInherited ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleOpenAssign(item)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setUnassignTarget(item)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span
                      className="text-[11px] text-muted-foreground/60 italic"
                      title="Inherited specifications are managed on the parent category"
                    >
                      Managed upstream
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center border border-dashed border-border rounded-lg bg-muted/5">
          <Sliders className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">
            No specifications configured
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto">
            Assign specifications (e.g. resistance, package, tolerance) to enable dynamic technical fields on all components under {categoryName}.
          </p>
          {availableDefinitions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAssign()}
              className="mt-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Assign First Specification
            </Button>
          )}
        </div>
      )}

      {/* Assign / Configure Modal */}
      <DialogShell
        open={isAssignOpen}
        onOpenChange={setIsAssignOpen}
        title="Assign Specification to Category"
        description={`Configure an engineering attribute definition for items in "${categoryName}".`}
        size="sm"
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4">
          <DialogShellBody className="space-y-4">
            {assignError && (
              <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                {assignError}
              </div>
            )}

            <Field>
              <FieldLabel>
                Attribute Definition <span className="text-destructive">*</span>
              </FieldLabel>
              <SearchableSelect
                placeholder="Select an attribute definition..."
                searchPlaceholder="Search definitions by name or code..."
                value={selectedDefinitionId}
                onValueChange={(val) => setSelectedDefinitionId(val)}
                options={allDefinitions.map((def) => {
                  const isAssigned =
                    directlyAssignedIds.has(def.id) &&
                    def.id !== selectedDefinitionId;
                  return {
                    value: def.id,
                    label: def.name,
                    chip: def.code,
                    sublabel: isAssigned ? "(Already assigned)" : def.dataType,
                    disabled: isAssigned,
                  };
                })}
              />
            </Field>

            <Field>
              <FieldLabel>Display Order</FieldLabel>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                placeholder="10"
              />
              <FieldError>Controls ordering relative to other attributes in the product form.</FieldError>
            </Field>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-foreground block">
                  Mandatory Specification
                </span>
                <span className="text-xs text-muted-foreground block">
                  Require components in this category to specify a value.
                </span>
              </div>
              <Switch
                checked={isRequired}
                onCheckedChange={setIsRequired}
              />
            </div>
          </DialogShellBody>

          <DialogShellFooter>
            <DialogShellCancelButton
              type="button"
              disabled={saving}
              onClick={() => setIsAssignOpen(false)}
            >
              Cancel
            </DialogShellCancelButton>
            <Button type="submit" disabled={saving || !selectedDefinitionId}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Specification
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>

      {/* Confirm Unassign Dialog */}
      <ConfirmDialog
        isOpen={Boolean(unassignTarget)}
        title="Unassign Specification"
        description={`Are you sure you want to unassign "${unassignTarget?.attributeDefinition.name}" from ${categoryName}? Existing component attribute data will be preserved in history.`}
        confirmText="Unassign"
        variant="destructive"
        loading={unassigning}
        onConfirm={handleConfirmUnassign}
        onCancel={() => setUnassignTarget(null)}
      />
    </div>
  );
}
