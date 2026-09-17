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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type ResolvedCategoryAttributeDto,
  type SetComponentAttributeItem,
} from "@/lib/api/attributes-api";
import { unitsApi, type UnitDto } from "@/lib/api/units-api";
import {
  Sliders,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

interface ManageComponentSpecificationsDialogProps {
  isOpen: boolean;
  componentId: string;
  componentName: string;
  categoryId?: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

interface EditableAttributeState {
  code: string;
  definitionId: string;
  name: string;
  dataType: string;
  value: unknown;
  unit: string;
  optionId: string;
  selectedOptionIds: string[];
  options: Array<{ id: string; code: string; label: string }>;
  unitCategory?: string | null;
  defaultUnit?: string | null;
}

export function ManageComponentSpecificationsDialog({
  isOpen,
  componentId,
  componentName,
  categoryId,
  onClose,
  onUpdated,
}: ManageComponentSpecificationsDialogProps) {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // Data from backend
  const [allDefinitions, setAllDefinitions] = React.useState<
    AttributeDefinitionDto[]
  >([]);
  const [categoryAttributes, setCategoryAttributes] = React.useState<
    ResolvedCategoryAttributeDto[]
  >([]);
  const [units, setUnits] = React.useState<UnitDto[]>([]);

  // Local state of assigned attributes for editing
  const [assignedAttrs, setAssignedAttrs] = React.useState<
    Record<string, EditableAttributeState>
  >({});

  // Adding state
  const [selectedAddDefId, setSelectedAddDefId] = React.useState<string>("");
  const [newVal, setNewVal] = React.useState<unknown>("");
  const [newUnit, setNewUnit] = React.useState<string>("");
  const [newOptionId, setNewOptionId] = React.useState<string>("");
  const [newSelectedOptionIds, setNewSelectedOptionIds] = React.useState<
    string[]
  >([]);

  // Deletion state
  const [removingAttr, setRemovingAttr] =
    React.useState<EditableAttributeState | null>(null);
  const [removeLoading, setRemoveLoading] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentAttrs, allDefs, catAttrs, allUnits] = await Promise.all([
        attributesApi.getComponentAttributes(componentId),
        attributesApi.getAll(),
        categoryId
          ? attributesApi.getByCategory(categoryId).catch(() => [])
          : Promise.resolve([]),
        unitsApi.getAll().catch(() => []),
      ]);

      setAllDefinitions(allDefs);
      setCategoryAttributes(catAttrs);
      setUnits(allUnits);

      // Construct map of assigned editable items
      const map: Record<string, EditableAttributeState> = {};
      Object.entries(currentAttrs).forEach(([code, populated]) => {
        const def = allDefs.find(
          (d) => d.id === populated.definitionId || d.code === code,
        );
        const options = def?.options || [];

        let selectedOptionIds: string[] = [];
        if (populated.dataType === "MULTI_SELECT") {
          if (Array.isArray(populated.value)) {
            selectedOptionIds = populated.value as string[];
          } else if (typeof populated.value === "string") {
            selectedOptionIds = populated.value.split(",").map((s) => s.trim());
          }
        }

        map[code] = {
          code,
          definitionId: populated.definitionId,
          name: populated.name || def?.name || code,
          dataType: populated.dataType,
          value: populated.value,
          unit: populated.unit || def?.defaultUnit || "",
          optionId: populated.optionId || "",
          selectedOptionIds,
          options: options.map((o) => ({
            id: o.id,
            code: o.code,
            label: o.label,
          })),
          unitCategory: def?.unitCategory,
          defaultUnit: def?.defaultUnit,
        };
      });

      setAssignedAttrs(map);
    } catch {
      setError("Failed to load specifications data.");
    } finally {
      setLoading(false);
    }
  }, [componentId, categoryId]);

  React.useEffect(() => {
    if (isOpen) {
      loadData();
      setError(null);
      setSuccessMsg(null);
      setSelectedAddDefId("");
      setNewVal("");
      setNewUnit("");
      setNewOptionId("");
      setNewSelectedOptionIds([]);
    }
  }, [isOpen, loadData]);

  // Unassigned attributes available to add
  const availableToAdd = React.useMemo(() => {
    const assignedCodes = new Set(Object.keys(assignedAttrs));
    return allDefinitions.filter(
      (d) => !assignedCodes.has(d.code) && d.isActive,
    );
  }, [allDefinitions, assignedAttrs]);

  const selectedAddDef = React.useMemo(
    () => allDefinitions.find((d) => d.id === selectedAddDefId),
    [allDefinitions, selectedAddDefId],
  );

  // When selectedAddDefId changes, reset add inputs with smart defaults
  React.useEffect(() => {
    if (selectedAddDef) {
      setNewUnit(selectedAddDef.defaultUnit || "");
      if (
        selectedAddDef.dataType === "SELECT" &&
        selectedAddDef.options &&
        selectedAddDef.options.length > 0
      ) {
        setNewOptionId(selectedAddDef.options[0]!.id);
      } else {
        setNewOptionId("");
      }
      setNewSelectedOptionIds([]);
      setNewVal(selectedAddDef.dataType === "BOOLEAN" ? false : "");
    }
  }, [selectedAddDef]);

  // Helper for units belonging to an attribute
  const getUnitsForAttribute = (attr: {
    unitCategory?: string | null;
    defaultUnit?: string | null;
  }) => {
    if (!attr.unitCategory) return units;
    return units.filter((u) => u.category === attr.unitCategory);
  };

  // Handle saving modified values for already assigned attributes
  const handleSaveAssigned = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const items: SetComponentAttributeItem[] = Object.values(
        assignedAttrs,
      ).map((item) => {
        if (item.dataType === "SELECT") {
          return {
            code: item.code,
            optionId: item.optionId,
          };
        }
        if (item.dataType === "MULTI_SELECT") {
          return {
            code: item.code,
            selectedOptionIds: item.selectedOptionIds,
          };
        }
        if (item.dataType === "QUANTITY") {
          return {
            code: item.code,
            value: item.value,
            unit: item.unit || undefined,
          };
        }
        return {
          code: item.code,
          value: item.value,
        };
      });

      await attributesApi.saveComponentAttributes(componentId, items);
      setSuccessMsg("Successfully updated product specifications.");
      onUpdated();
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save specifications changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle adding a new attribute to this product
  const handleAddAttribute = async () => {
    if (!selectedAddDef) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      let item: SetComponentAttributeItem;

      if (selectedAddDef.dataType === "SELECT") {
        if (!newOptionId) {
          throw new Error("Please select an option value.");
        }
        item = {
          code: selectedAddDef.code,
          optionId: newOptionId,
        };
      } else if (selectedAddDef.dataType === "MULTI_SELECT") {
        if (newSelectedOptionIds.length === 0) {
          throw new Error("Please select at least one option.");
        }
        item = {
          code: selectedAddDef.code,
          selectedOptionIds: newSelectedOptionIds,
        };
      } else if (selectedAddDef.dataType === "QUANTITY") {
        if (newVal === "" || newVal === undefined) {
          throw new Error("Please enter a numeric quantity value.");
        }
        item = {
          code: selectedAddDef.code,
          value: Number(newVal),
          unit: newUnit || undefined,
        };
      } else if (selectedAddDef.dataType === "BOOLEAN") {
        item = {
          code: selectedAddDef.code,
          value: Boolean(newVal),
        };
      } else if (
        selectedAddDef.dataType === "NUMBER" ||
        selectedAddDef.dataType === "INTEGER"
      ) {
        if (newVal === "" || newVal === undefined) {
          throw new Error("Please enter a number.");
        }
        item = {
          code: selectedAddDef.code,
          value: Number(newVal),
        };
      } else {
        if (newVal === "" || newVal === undefined) {
          throw new Error("Please enter a value.");
        }
        item = {
          code: selectedAddDef.code,
          value: String(newVal),
        };
      }

      await attributesApi.saveComponentAttributes(componentId, [item]);
      setSuccessMsg(`Added '${selectedAddDef.name}' specification to product.`);
      setSelectedAddDefId("");
      onUpdated();
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add specification to product.",
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle removing attribute from this component only (safe delete from component_attribute_values)
  const handleConfirmRemove = async () => {
    if (!removingAttr) return;
    setRemoveLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await attributesApi.deleteComponentAttribute(
        componentId,
        removingAttr.definitionId,
      );
      setSuccessMsg(
        `Removed specification '${removingAttr.name}' from this product.`,
      );
      setRemovingAttr(null);
      onUpdated();
      await loadData();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove specification from product.",
      );
      setRemovingAttr(null);
    } finally {
      setRemoveLoading(false);
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
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            <span>Manage Specifications: {componentName}</span>
          </div>
        }
        description="Add, modify, or remove technical specifications and dynamic attributes for this component. Removing an attribute here does not delete the global definition."
        size="lg"
      >
        <DialogShellBody className="space-y-6">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">
                Loading specifications...
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Section 1: Assigned Specifications */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-primary" />
                    Currently Assigned Specifications (
                    {Object.keys(assignedAttrs).length})
                  </h4>
                  {Object.keys(assignedAttrs).length > 0 && (
                    <Button
                      size="xs"
                      onClick={handleSaveAssigned}
                      disabled={saving}
                      className="h-7 text-xs gap-1.5"
                    >
                      {saving && (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      )}
                      Save Changes
                    </Button>
                  )}
                </div>

                {Object.keys(assignedAttrs).length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-border rounded-xl bg-muted/20">
                    <Sliders className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
                    <p className="text-xs font-medium text-foreground">
                      No specifications currently assigned
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Use the section below to assign attributes from category or library.
                    </p>
                  </div>
                ) : (
                  <div className="border border-border rounded-xl divide-y divide-border/60 overflow-hidden">
                    {Object.values(assignedAttrs).map((attr) => {
                      const attrUnits = getUnitsForAttribute(attr);

                      return (
                        <div
                          key={attr.code}
                          className="p-3.5 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                        >
                          <div className="sm:w-1/3 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground">
                                {attr.name}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                                {attr.code}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Type: {attr.dataType}
                            </span>
                          </div>

                          {/* Typed Input Control for editing */}
                          <div className="sm:w-1/2 flex items-center gap-2">
                            {attr.dataType === "QUANTITY" ? (
                              <div className="flex items-center gap-1.5 w-full">
                                <Input
                                  type="number"
                                  step="any"
                                  value={
                                    attr.value !== undefined &&
                                    attr.value !== null
                                      ? String(attr.value)
                                      : ""
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAssignedAttrs((prev) => ({
                                      ...prev,
                                      [attr.code]: {
                                        ...prev[attr.code]!,
                                        value: val === "" ? "" : Number(val),
                                      },
                                    }));
                                  }}
                                  className="h-8 text-xs font-mono w-28"
                                />
                                <Select
                                  value={attr.unit || "none"}
                                  onValueChange={(val) => {
                                    const safeVal = val === "none" || !val ? "" : val;
                                    setAssignedAttrs((prev) => ({
                                      ...prev,
                                      [attr.code]: {
                                        ...prev[attr.code]!,
                                        unit: safeVal,
                                      },
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs font-mono flex-1">
                                    <SelectValue placeholder="Unit" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No Unit</SelectItem>
                                    {attrUnits.map((u) => (
                                      <SelectItem key={u.name} value={u.name}>
                                        {u.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : attr.dataType === "SELECT" ? (
                              <Select
                                value={attr.optionId || "none"}
                                onValueChange={(val) => {
                                  const safeVal = val === "none" || !val ? "" : val;
                                  setAssignedAttrs((prev) => ({
                                    ...prev,
                                    [attr.code]: {
                                      ...prev[attr.code]!,
                                      optionId: safeVal,
                                    },
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-full">
                                  <SelectValue placeholder="Select choice" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    -- Select Choice --
                                  </SelectItem>
                                  {attr.options.map((opt) => (
                                    <SelectItem key={opt.id} value={opt.id}>
                                      {opt.label} ({opt.code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : attr.dataType === "MULTI_SELECT" ? (
                              <div className="flex flex-wrap gap-1.5 max-w-xs">
                                {attr.options.map((opt) => {
                                  const isSelected =
                                    attr.selectedOptionIds.includes(opt.id);
                                  return (
                                    <button
                                      type="button"
                                      key={opt.id}
                                      onClick={() => {
                                        const next = isSelected
                                          ? attr.selectedOptionIds.filter(
                                              (id) => id !== opt.id,
                                            )
                                          : [...attr.selectedOptionIds, opt.id];
                                        setAssignedAttrs((prev) => ({
                                          ...prev,
                                          [attr.code]: {
                                            ...prev[attr.code]!,
                                            selectedOptionIds: next,
                                          },
                                        }));
                                      }}
                                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                                        isSelected
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : attr.dataType === "BOOLEAN" ? (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={Boolean(attr.value)}
                                  onCheckedChange={(checked) => {
                                    setAssignedAttrs((prev) => ({
                                      ...prev,
                                      [attr.code]: {
                                        ...prev[attr.code]!,
                                        value: checked,
                                      },
                                    }));
                                  }}
                                />
                                <span className="text-xs font-mono">
                                  {attr.value ? "Yes" : "No"}
                                </span>
                              </div>
                            ) : (
                              <Input
                                type={
                                  attr.dataType === "NUMBER" ||
                                  attr.dataType === "INTEGER"
                                    ? "number"
                                    : attr.dataType === "DATE"
                                      ? "date"
                                      : "text"
                                }
                                value={
                                  attr.value !== undefined &&
                                  attr.value !== null
                                    ? String(attr.value)
                                    : ""
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setAssignedAttrs((prev) => ({
                                    ...prev,
                                    [attr.code]: {
                                      ...prev[attr.code]!,
                                      value:
                                        attr.dataType === "NUMBER" ||
                                        attr.dataType === "INTEGER"
                                          ? v === ""
                                            ? ""
                                            : Number(v)
                                          : v,
                                    },
                                  }));
                                }}
                                className="h-8 text-xs font-mono w-full"
                              />
                            )}
                          </div>

                          {/* Remove button */}
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title="Remove specification from this product"
                              onClick={() => setRemovingAttr(attr)}
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Add New Specification */}
              <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    Add Specification to Product
                  </h4>
                  {categoryAttributes.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Sparkles className="w-3 h-3 text-primary" />
                      Category recommendations available
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Select Attribute Definition
                    </label>
                    <Select
                      value={selectedAddDefId || "none"}
                      onValueChange={(val) =>
                        setSelectedAddDefId(val === "none" || !val ? "" : val)
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="-- Choose an attribute to add --" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          -- Choose attribute --
                        </SelectItem>
                        {availableToAdd.map((def) => {
                          const isCatAttr = categoryAttributes.some(
                            (c) => c.attributeDefinition.id === def.id,
                          );
                          return (
                            <SelectItem key={def.id} value={def.id}>
                              {def.name} ({def.code}){" "}
                              {isCatAttr ? "★ [Category Spec]" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Value input based on selected attribute */}
                  {selectedAddDef && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Value ({selectedAddDef.dataType})
                      </label>
                      {selectedAddDef.dataType === "QUANTITY" ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            step="any"
                            placeholder="Value"
                            value={String(newVal || "")}
                            onChange={(e) => setNewVal(e.target.value)}
                            className="h-9 text-xs font-mono flex-1"
                          />
                          <Select
                            value={newUnit || "none"}
                            onValueChange={(val) =>
                              setNewUnit(val === "none" || !val ? "" : val)
                            }
                          >
                            <SelectTrigger className="h-9 text-xs font-mono w-28">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Unit</SelectItem>
                              {getUnitsForAttribute(selectedAddDef).map(
                                (u) => (
                                  <SelectItem key={u.name} value={u.name}>
                                    {u.name}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : selectedAddDef.dataType === "SELECT" ? (
                        <Select
                          value={newOptionId || "none"}
                          onValueChange={(val) =>
                            setNewOptionId(val === "none" || !val ? "" : val)
                          }
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Select choice" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              -- Choose Option --
                            </SelectItem>
                            {selectedAddDef.options?.map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.label} ({opt.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : selectedAddDef.dataType === "MULTI_SELECT" ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedAddDef.options?.map((opt) => {
                            const isSelected =
                              newSelectedOptionIds.includes(opt.id);
                            return (
                              <button
                                type="button"
                                key={opt.id}
                                onClick={() => {
                                  setNewSelectedOptionIds((prev) =>
                                    isSelected
                                      ? prev.filter((id) => id !== opt.id)
                                      : [...prev, opt.id],
                                  );
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted text-muted-foreground border-border"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : selectedAddDef.dataType === "BOOLEAN" ? (
                        <div className="flex items-center gap-2 pt-1.5">
                          <Switch
                            checked={Boolean(newVal)}
                            onCheckedChange={(c) => setNewVal(c)}
                          />
                          <span className="text-xs font-mono">
                            {newVal ? "Yes" : "No"}
                          </span>
                        </div>
                      ) : (
                        <Input
                          type={
                            selectedAddDef.dataType === "NUMBER" ||
                            selectedAddDef.dataType === "INTEGER"
                              ? "number"
                              : selectedAddDef.dataType === "DATE"
                                ? "date"
                                : "text"
                          }
                          placeholder={`Enter ${selectedAddDef.name}`}
                          value={String(newVal || "")}
                          onChange={(e) => setNewVal(e.target.value)}
                          className="h-9 text-xs font-mono"
                        />
                      )}
                    </div>
                  )}
                </div>

                {selectedAddDef && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-muted-foreground">
                      {selectedAddDef.description ||
                        `Dynamic attribute: ${selectedAddDef.code}`}
                    </p>
                    <Button
                      size="sm"
                      onClick={handleAddAttribute}
                      disabled={saving}
                      className="h-8 text-xs gap-1.5"
                    >
                      {saving && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      )}
                      <Plus className="w-3.5 h-3.5" />
                      Add Specification
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton>Close</DialogShellCancelButton>
        </DialogShellFooter>
      </DialogShell>

      {/* Confirmation for removing attribute from this component */}
      <ConfirmDialog
        isOpen={Boolean(removingAttr)}
        title="Remove Specification from Product"
        description={`Are you sure you want to remove '${removingAttr?.name}' from this product? The global definition '${removingAttr?.code}' in the Attribute Library will remain completely untouched.`}
        confirmText="Remove from Product"
        variant="destructive"
        loading={removeLoading}
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemovingAttr(null)}
      />
    </>
  );
}
