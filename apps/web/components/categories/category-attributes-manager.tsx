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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell, DialogShellBody, DialogShellFooter, DialogShellCancelButton } from "@/components/ui/dialog-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type ResolvedCategoryAttributeDto,
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
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      item.isRequired
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
              <Select
                value={selectedDefinitionId}
                onValueChange={(val) => val && setSelectedDefinitionId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an attribute definition..." />
                </SelectTrigger>
                <SelectContent>
                  {allDefinitions.map((def) => {
                    const isAssigned = directlyAssignedIds.has(def.id) && def.id !== selectedDefinitionId;
                    return (
                      <SelectItem
                        key={def.id}
                        value={def.id}
                        disabled={isAssigned}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{def.name}</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] text-muted-foreground leading-none">
                            {def.code}
                          </span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            {def.dataType}
                          </span>
                          {isAssigned && (
                            <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-600 dark:text-amber-400 leading-none">
                              Already assigned
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
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
