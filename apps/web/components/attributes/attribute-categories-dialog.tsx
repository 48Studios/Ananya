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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type AttributeCategoryBindingDto,
} from "@/lib/api/attributes-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
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

          {/* Context Header Strip */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <FolderTree className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {attribute?.name}
                  </span>
                  <span className="font-mono text-[11px] bg-background px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                    {attribute?.code}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] text-muted-foreground">Type:</span>
                  <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-background border border-border font-mono text-[10px] text-foreground leading-none">
                    {attribute?.dataType}
                  </span>
                  {attribute?.defaultUnit && (
                    <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-background border border-border font-mono text-[10px] text-muted-foreground leading-none">
                      {attribute.defaultUnit}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-medium text-muted-foreground bg-background px-2.5 py-1 rounded-md border border-border">
              {bindings.length} {bindings.length === 1 ? "category" : "categories"} bound
            </span>
          </div>

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

            <form onSubmit={handleBindCategory} className="space-y-3">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/40">
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
                        className="p-3.5 bg-primary/5 border-l-2 border-l-primary flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {binding.categoryName}
                          </span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] text-muted-foreground leading-none">
                            {binding.categoryCode}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              Order:
                            </span>
                            <Input
                              type="number"
                              value={editSortOrder}
                              onChange={(e) =>
                                setEditSortOrder(Number(e.target.value))
                              }
                              className="h-8 w-20 text-xs font-mono"
                            />
                          </div>

                          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-background border border-border">
                            <Switch
                              id={`edit-req-${binding.id}`}
                              checked={editIsRequired}
                              onCheckedChange={setEditIsRequired}
                            />
                            <label
                              htmlFor={`edit-req-${binding.id}`}
                              className="text-xs font-medium cursor-pointer"
                            >
                              Required
                            </label>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              size="xs"
                              variant="default"
                              disabled={isUpdating}
                              onClick={() => handleSaveEdit(binding)}
                              className="gap-1 h-8 text-xs"
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Save
                            </Button>

                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={isUpdating}
                              onClick={() => setEditingBindingId(null)}
                              className="h-8 text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
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
