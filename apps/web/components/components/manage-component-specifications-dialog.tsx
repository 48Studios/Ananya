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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type ResolvedCategoryAttributeDto,
  type SetComponentAttributeItem,
} from "@/lib/api/attributes-api";
import { unitsApi, type UnitDto } from "@/lib/api/units-api";
import { cn } from "@/lib/utils";
import {
  Sliders,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Save,
  Sparkles,
  Search,
  RotateCcw,
  Tag,
  Check,
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
  description?: string | null;
  isCategorySpec: boolean;
  isRequired: boolean;
  sortOrder: number;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  TEXT: {
    label: "Text",
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  },
  NUMBER: {
    label: "Number",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  },
  INTEGER: {
    label: "Integer",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  },
  BOOLEAN: {
    label: "Boolean",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  },
  DATE: {
    label: "Date",
    badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  },
  SELECT: {
    label: "Select",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  },
  MULTI_SELECT: {
    label: "Multi-Select",
    badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  },
  QUANTITY: {
    label: "Quantity",
    badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  },
};

// ─── Value Editor Component ────────────────────────────────────────────────
function AttributeValueEditor({
  attribute,
  units,
  onChange,
}: {
  attribute: EditableAttributeState;
  units: UnitDto[];
  onChange: (patch: Partial<EditableAttributeState>) => void;
}) {
  const { dataType, value, unit, optionId, selectedOptionIds, options, unitCategory } =
    attribute;

  const filteredUnits = React.useMemo(() => {
    if (!unitCategory) return units;
    const matched = units.filter((u) => u.category === unitCategory);
    return matched.length > 0 ? matched : units;
  }, [units, unitCategory]);

  if (dataType === "BOOLEAN") {
    const isChecked = Boolean(value);
    return (
      <div className="flex h-9 items-center justify-end gap-2.5">
        <span className="text-xs text-muted-foreground select-none">
          {isChecked ? "Yes" : "No"}
        </span>
        <Switch
          id={`switch-${attribute.code}`}
          checked={isChecked}
          onCheckedChange={(v) => onChange({ value: v })}
        />
      </div>
    );
  }

  if (dataType === "SELECT") {
    return (
      <Select
        value={(optionId as string) || "none"}
        onValueChange={(v) =>
          onChange({ optionId: v === "none" ? "" : (v ?? "") })
        }
      >
        <SelectTrigger className="!h-9 w-full text-xs">
          <SelectValue placeholder="Choose an option…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground italic">— None specified —</span>
          </SelectItem>
          {(options ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <div className="flex items-center gap-2">
                <span>{o.label}</span>
                <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] text-muted-foreground leading-none">
                  {o.code}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (dataType === "MULTI_SELECT") {
    const selected = selectedOptionIds ?? [];
    return (
      <div className="flex flex-wrap justify-end gap-1.5 py-0.5">
        {(options ?? []).length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            No options defined
          </span>
        ) : (
          options.map((o) => {
            const active = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  onChange({
                    selectedOptionIds: active
                      ? selected.filter((id) => id !== o.id)
                      : [...selected, o.id],
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border transition-all cursor-pointer select-none",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                )}
              >
                {active && <Check className="size-3 shrink-0" />}
                <span>{o.label}</span>
              </button>
            );
          })
        )}
      </div>
    );
  }

  if (dataType === "QUANTITY") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="any"
          placeholder="0"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) =>
            onChange({
              value: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
          className="!h-9 text-xs font-mono text-left flex-1 min-w-0"
        />
        <div className="w-20 shrink-0">
          <Select
            value={(unit as string) || "none"}
            onValueChange={(v) =>
              onChange({ unit: v === "none" ? "" : (v ?? "") })
            }
          >
            <SelectTrigger className="!h-9 w-full text-xs font-mono">
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground italic">No unit</span>
              </SelectItem>
              {filteredUnits.map((u) => (
                <SelectItem key={u.id || u.name} value={u.name}>
                  <span className="font-mono text-xs">{u.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (dataType === "NUMBER" || dataType === "INTEGER") {
    return (
      <Input
        type="number"
        step={dataType === "INTEGER" ? "1" : "any"}
        placeholder="0"
        value={value !== undefined && value !== null ? String(value) : ""}
        onChange={(e) =>
          onChange({
            value: e.target.value === "" ? "" : Number(e.target.value),
          })
        }
        className="!h-9 text-xs font-mono text-left w-full"
      />
    );
  }

  if (dataType === "DATE") {
    return (
      <Input
        type="date"
        value={value !== undefined && value !== null ? String(value) : ""}
        onChange={(e) => onChange({ value: e.target.value })}
        className="!h-9 text-xs text-left w-full"
      />
    );
  }

  // Default: TEXT
  return (
    <Input
      type="text"
      placeholder="Value…"
      value={value !== undefined && value !== null ? String(value) : ""}
      onChange={(e) => onChange({ value: e.target.value })}
      className="!h-9 text-xs text-left w-full"
    />
  );
}

// ─── Main Manage Dialog ────────────────────────────────────────────────────
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

  const [allDefinitions, setAllDefinitions] = React.useState<
    AttributeDefinitionDto[]
  >([]);
  const [categoryAttributes, setCategoryAttributes] = React.useState<
    ResolvedCategoryAttributeDto[]
  >([]);
  const [units, setUnits] = React.useState<UnitDto[]>([]);

  // Staged attribute state: map of code -> EditableAttributeState
  const [assignedAttrs, setAssignedAttrs] = React.useState<
    Record<string, EditableAttributeState>
  >({});

  // Original definition IDs present when dialog opened (to compute deletions on save)
  const [initialAssignedDefIds, setInitialAssignedDefIds] = React.useState<
    Map<string, string>
  >(new Map());
  // Staged removed attribute codes/names for undo notice
  const [stagedRemovals, setStagedRemovals] = React.useState<
    Array<{ code: string; name: string; state: EditableAttributeState }>
  >([]);

  // Toolbar state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterTab, setFilterTab] = React.useState<
    "all" | "category" | "custom"
  >("all");
  const [addPopoverOpen, setAddPopoverOpen] = React.useState(false);
  const [popoverSearch, setPopoverSearch] = React.useState("");

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

      const initialMap = new Map<string, string>();
      const map: Record<string, EditableAttributeState> = {};

      Object.entries(currentAttrs).forEach(([code, populated]) => {
        const def = allDefs.find(
          (d) => d.id === populated.definitionId || d.code === code,
        );
        const catSpec = catAttrs.find(
          (c) => c.attributeDefinition.id === (def?.id || populated.definitionId),
        );
        const options = def?.options ?? [];

        let selectedOptionIds: string[] = [];
        if (populated.dataType === "MULTI_SELECT") {
          if (Array.isArray(populated.value)) {
            selectedOptionIds = populated.value as string[];
          } else if (typeof populated.value === "string") {
            selectedOptionIds = populated.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }

        const defId = populated.definitionId || def?.id || "";
        if (defId) {
          initialMap.set(code, defId);
        }

        map[code] = {
          code,
          definitionId: defId,
          name: populated.name || def?.name || code,
          dataType: populated.dataType,
          value: populated.value ?? "",
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
          description: def?.description,
          isCategorySpec: Boolean(catSpec),
          isRequired: Boolean(catSpec?.isRequired),
          sortOrder: catSpec?.sortOrder ?? def?.sortOrder ?? 999,
        };
      });

      setAssignedAttrs(map);
      setInitialAssignedDefIds(initialMap);
      setStagedRemovals([]);
    } catch {
      setError("Failed to load specifications and attributes.");
    } finally {
      setLoading(false);
    }
  }, [componentId, categoryId]);

  React.useEffect(() => {
    if (isOpen) {
      loadData();
      setError(null);
      setSuccessMsg(null);
      setSearchQuery("");
      setFilterTab("all");
      setAddPopoverOpen(false);
      setPopoverSearch("");
    }
  }, [isOpen, loadData]);

  // Unassigned category attributes that haven't been added to assignedAttrs yet
  const unassignedCategorySpecs = React.useMemo(() => {
    return categoryAttributes.filter(
      (cat) => !assignedAttrs[cat.attributeDefinition.code],
    );
  }, [categoryAttributes, assignedAttrs]);

  // Global attributes available to add (not yet in assignedAttrs)
  const availableDefinitionsToAdd = React.useMemo(() => {
    const assignedCodes = new Set(Object.keys(assignedAttrs));
    return allDefinitions
      .filter((d) => d.isActive && !assignedCodes.has(d.code))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allDefinitions, assignedAttrs]);

  // Filtered available definitions inside popover search
  const filteredAvailable = React.useMemo(() => {
    if (!popoverSearch.trim()) return availableDefinitionsToAdd;
    const q = popoverSearch.toLowerCase().trim();
    return availableDefinitionsToAdd.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q)),
    );
  }, [availableDefinitionsToAdd, popoverSearch]);

  // Add a specific attribute definition to staged state
  const handleAddDefinition = React.useCallback(
    (
      def: AttributeDefinitionDto,
      catSpec?: ResolvedCategoryAttributeDto | null,
    ) => {
      const options = (def.options ?? []).map((o) => ({
        id: o.id,
        code: o.code,
        label: o.label,
      }));

      const isCat = Boolean(
        catSpec ||
        categoryAttributes.some((c) => c.attributeDefinition.id === def.id),
      );
      const isReq = Boolean(
        catSpec?.isRequired ||
        categoryAttributes.find((c) => c.attributeDefinition.id === def.id)
          ?.isRequired,
      );

      const newState: EditableAttributeState = {
        code: def.code,
        definitionId: def.id,
        name: def.name,
        dataType: def.dataType,
        value: def.dataType === "BOOLEAN" ? false : "",
        unit: def.defaultUnit ?? "",
        optionId: def.dataType === "SELECT" ? options[0]?.id ?? "" : "",
        selectedOptionIds: [],
        options,
        unitCategory: def.unitCategory,
        defaultUnit: def.defaultUnit,
        description: def.description,
        isCategorySpec: isCat,
        isRequired: isReq,
        sortOrder: catSpec?.sortOrder ?? def.sortOrder ?? 999,
      };

      setAssignedAttrs((prev) => ({
        ...prev,
        [def.code]: newState,
      }));

      // Remove from staged removals if it was previously removed
      setStagedRemovals((prev) => prev.filter((r) => r.code !== def.code));
      setAddPopoverOpen(false);
      setPopoverSearch("");
      setError(null);
    },
    [categoryAttributes],
  );

  // Add all unassigned category specifications in one click
  const handleAddAllCategorySpecs = React.useCallback(() => {
    setAssignedAttrs((prev) => {
      const next = { ...prev };
      unassignedCategorySpecs.forEach((cat) => {
        const def = cat.attributeDefinition;
        const options = (def.options ?? []).map((o) => ({
          id: o.id,
          code: o.code,
          label: o.label,
        }));

        next[def.code] = {
          code: def.code,
          definitionId: def.id,
          name: def.name,
          dataType: def.dataType,
          value: def.dataType === "BOOLEAN" ? false : "",
          unit: def.defaultUnit ?? "",
          optionId: def.dataType === "SELECT" ? options[0]?.id ?? "" : "",
          selectedOptionIds: [],
          options,
          unitCategory: def.unitCategory,
          defaultUnit: def.defaultUnit,
          description: def.description,
          isCategorySpec: true,
          isRequired: cat.isRequired,
          sortOrder: cat.sortOrder,
        };
      });
      return next;
    });

    // Clear any matching staged removals
    const addedCodes = new Set(
      unassignedCategorySpecs.map((c) => c.attributeDefinition.code),
    );
    setStagedRemovals((prev) => prev.filter((r) => !addedCodes.has(r.code)));
    setError(null);
  }, [unassignedCategorySpecs]);

  // Remove an attribute from staged state
  const handleRemoveAttribute = React.useCallback(
    (code: string) => {
      const target = assignedAttrs[code];
      if (!target) return;

      setStagedRemovals((prev) => [
        ...prev.filter((r) => r.code !== code),
        { code, name: target.name, state: target },
      ]);

      setAssignedAttrs((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
    },
    [assignedAttrs],
  );

  // Undo removal of an attribute
  const handleUndoRemoval = React.useCallback(
    (code: string) => {
      const staged = stagedRemovals.find((r) => r.code === code);
      if (!staged) return;

      setAssignedAttrs((prev) => ({
        ...prev,
        [code]: staged.state,
      }));
      setStagedRemovals((prev) => prev.filter((r) => r.code !== code));
    },
    [stagedRemovals],
  );

  // Save all changes atomically
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const currentList = Object.values(assignedAttrs);

      // Validate required category attributes
      for (const attr of currentList) {
        if (attr.isRequired) {
          if (attr.dataType === "SELECT" && !attr.optionId) {
            throw new Error(`'${attr.name}' is a required specification.`);
          }
          if (
            attr.dataType === "MULTI_SELECT" &&
            attr.selectedOptionIds.length === 0
          ) {
            throw new Error(
              `'${attr.name}' requires at least one option selected.`,
            );
          }
          if (
            attr.dataType === "QUANTITY" &&
            (attr.value === "" || attr.value === undefined || attr.value === null)
          ) {
            throw new Error(`'${attr.name}' quantity value is required.`);
          }
          if (
            attr.dataType !== "BOOLEAN" &&
            attr.dataType !== "SELECT" &&
            attr.dataType !== "MULTI_SELECT" &&
            attr.dataType !== "QUANTITY" &&
            (attr.value === "" || attr.value === undefined || attr.value === null)
          ) {
            throw new Error(`'${attr.name}' specification is required.`);
          }
        }
      }

      // 1. Identify which original attributes were removed and delete them
      const currentCodes = new Set(Object.keys(assignedAttrs));
      const defsToDelete: string[] = [];
      initialAssignedDefIds.forEach((defId, code) => {
        if (!currentCodes.has(code)) {
          defsToDelete.push(defId);
        }
      });

      for (const defId of defsToDelete) {
        await attributesApi.deleteComponentAttribute(componentId, defId);
      }

      // 2. Prepare payload for saving assigned attributes
      const itemsToSave: SetComponentAttributeItem[] = currentList.map((item) => {
        if (item.dataType === "SELECT") {
          return { code: item.code, optionId: item.optionId || undefined };
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
            value: item.value === "" ? undefined : Number(item.value),
            unit: item.unit || undefined,
          };
        }
        if (item.dataType === "BOOLEAN") {
          return { code: item.code, value: Boolean(item.value) };
        }
        if (item.dataType === "NUMBER" || item.dataType === "INTEGER") {
          return {
            code: item.code,
            value: item.value === "" ? undefined : Number(item.value),
          };
        }
        return {
          code: item.code,
          value: item.value === "" ? undefined : item.value,
        };
      });

      if (itemsToSave.length > 0) {
        await attributesApi.saveComponentAttributes(componentId, itemsToSave);
      }

      setSuccessMsg("Attributes updated successfully.");
      onUpdated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save attributes.");
    } finally {
      setSaving(false);
    }
  };

  // Filtered assigned attributes list based on toolbar search and tabs
  const filteredAssignedList = React.useMemo(() => {
    let list = Object.values(assignedAttrs);

    if (filterTab === "category") {
      list = list.filter((a) => a.isCategorySpec);
    } else if (filterTab === "custom") {
      list = list.filter((a) => !a.isCategorySpec);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)),
      );
    }

    // Sort: Category specs first by sortOrder, then custom alphabetically
    return list.sort((a, b) => {
      if (a.isCategorySpec && !b.isCategorySpec) return -1;
      if (!a.isCategorySpec && b.isCategorySpec) return 1;
      if (a.isCategorySpec && b.isCategorySpec) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }, [assignedAttrs, filterTab, searchQuery]);

  const totalAssignedCount = Object.keys(assignedAttrs).length;
  const categoryAssignedCount = Object.values(assignedAttrs).filter(
    (a) => a.isCategorySpec,
  ).length;
  const customAssignedCount = totalAssignedCount - categoryAssignedCount;

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sliders className="size-4" />
          </div>
          <span>Manage Attributes</span>
        </div>
      }
      description={`Configure technical specifications and dynamic attributes for ${componentName}.`}
      size="md"
    >
      <DialogShellBody className="space-y-4">
        {/* Error / Success alert banners */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs font-medium">Loading attributes…</span>
          </div>
        ) : (
          <>
            {/* ── Category Suggestions Callout ────────────────────────── */}
            {unassignedCategorySpecs.length > 0 && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary shrink-0 mt-0.5">
                      <Sparkles className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Recommended Category Specifications
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        This product’s category defines{" "}
                        <span className="font-semibold text-foreground">
                          {unassignedCategorySpecs.length}
                        </span>{" "}
                        {unassignedCategorySpecs.length === 1
                          ? "specification"
                          : "specifications"}{" "}
                        not yet assigned.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddAllCategorySpecs}
                    className="h-8 text-xs gap-1.5 shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="size-3.5" />
                    Add All Category Specs
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-3 border-t border-primary/15">
                  {unassignedCategorySpecs.map((catSpec) => (
                    <button
                      key={catSpec.attributeDefinition.id}
                      type="button"
                      onClick={() =>
                        handleAddDefinition(
                          catSpec.attributeDefinition,
                          catSpec,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-background/90 px-2.5 py-1 text-xs text-foreground hover:border-primary hover:bg-primary/10 transition-colors cursor-pointer select-none"
                    >
                      <Plus className="size-3 text-primary" />
                      <span className="font-medium">
                        {catSpec.attributeDefinition.name}
                      </span>
                      {catSpec.isRequired && (
                        <span className="text-[10px] text-destructive font-bold">
                          *
                        </span>
                      )}
                      <span className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] font-normal text-muted-foreground leading-none">
                        {catSpec.attributeDefinition.dataType}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Toolbar: Search, Filters, + Add Attribute Popover ──── */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              {/* Search input fills all available space */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search attributes…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="!h-9 pl-9 text-xs w-full"
                />
              </div>

              {/* Filter tab pills */}
              {totalAssignedCount > 0 && (
                <div className="!h-9 flex items-center rounded-lg border border-border p-1 bg-muted/40 shrink-0 box-border">
                  <button
                    type="button"
                    onClick={() => setFilterTab("all")}
                    className={cn(
                      "h-full inline-flex items-center px-3 rounded-md text-xs font-medium transition-colors cursor-pointer select-none",
                      filterTab === "all"
                        ? "bg-background text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All ({totalAssignedCount})
                  </button>
                  {categoryAssignedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab("category")}
                      className={cn(
                        "h-full inline-flex items-center px-3 rounded-md text-xs font-medium transition-colors cursor-pointer select-none",
                        filterTab === "category"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Category ({categoryAssignedCount})
                    </button>
                  )}
                  {customAssignedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab("custom")}
                      className={cn(
                        "h-full inline-flex items-center px-3 rounded-md text-xs font-medium transition-colors cursor-pointer select-none",
                        filterTab === "custom"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Custom ({customAssignedCount})
                    </button>
                  )}
                </div>
              )}

              {/* Add Attribute Button with Dropdown Popover */}
              <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
                <PopoverTrigger
                  type="button"
                  disabled={availableDefinitionsToAdd.length === 0}
                  className="!h-9 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-medium rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Plus className="size-4" />
                  <span>Add Attribute</span>
                </PopoverTrigger>

                <PopoverContent className="w-80 p-0 shadow-lg border-border" align="end">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search available attributes…"
                        value={popoverSearch}
                        onChange={(e) => setPopoverSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
                    {filteredAvailable.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        No matching attributes found
                      </div>
                    ) : (
                      filteredAvailable.map((def) => {
                        const isCat = categoryAttributes.some(
                          (c) => c.attributeDefinition.id === def.id,
                        );
                        const typeInfo = TYPE_CONFIG[def.dataType] ?? {
                          label: def.dataType,
                          badgeClass: "bg-muted text-muted-foreground border-border",
                        };

                        return (
                          <button
                            key={def.id}
                            type="button"
                            onClick={() => handleAddDefinition(def)}
                            className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted/60 transition-colors text-left group cursor-pointer"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                {isCat && (
                                  <Sparkles className="size-3 text-primary shrink-0" />
                                )}
                                <span className="text-xs font-medium text-foreground truncate">
                                  {def.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {def.code}
                                </span>
                                {def.description && (
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                    • {def.description}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono font-medium border",
                                typeInfo.badgeClass,
                              )}
                            >
                              {typeInfo.label}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Staged Removal Undo Strip ───────────────────────────── */}
            {stagedRemovals.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-2">
                  <Tag className="size-3.5 shrink-0" />
                  <span>
                    {stagedRemovals.length}{" "}
                    {stagedRemovals.length === 1 ? "attribute" : "attributes"}{" "}
                    staged for removal.
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {stagedRemovals.map((r) => (
                    <Button
                      key={r.code}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUndoRemoval(r.code)}
                      className="h-6 text-[11px] gap-1 px-2 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300"
                    >
                      <RotateCcw className="size-3" />
                      Undo {r.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Attributes Cards List ────────────────────────────────── */}
            {totalAssignedCount === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center bg-card/40">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                  <Sliders className="size-5" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  No attributes configured
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Technical specifications help filter, organize, and inspect
                  components. Add attributes from the toolbar above.
                </p>
                {unassignedCategorySpecs.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddAllCategorySpecs}
                    className="mt-2 text-xs gap-1.5"
                  >
                    <Sparkles className="size-3.5" />
                    Add Category Specifications
                  </Button>
                )}
              </div>
            ) : filteredAssignedList.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                No attributes match “{searchQuery}”
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAssignedList.map((attr) => (
                  <div
                    key={attr.code}
                    className={cn(
                      "group rounded-xl border border-border/80 bg-card/70 p-4 transition-all hover:bg-card hover:border-border hover:shadow-xs",
                      attr.isCategorySpec && "border-l-[3px] border-l-primary",
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                      {/* Left column: Attribute Metadata */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground tracking-tight">
                            {attr.name}
                          </span>
                          {attr.isRequired && (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive border border-destructive/20 uppercase tracking-wider">
                              Required
                            </span>
                          )}
                          {attr.isCategorySpec && (
                            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
                              <Sparkles className="size-3" />
                              Category
                            </span>
                          )}
                        </div>

                        {attr.description && (
                          <p
                            className="text-xs text-muted-foreground/80 leading-relaxed pt-0.5 line-clamp-1"
                            title={attr.description}
                          >
                            {attr.description}
                          </p>
                        )}
                      </div>

                      {/* Right column: Value Input Control (Right-Aligned) + Trash Button */}
                      <div className="flex items-center gap-2 shrink-0 justify-end w-full sm:w-auto">
                        <div className="w-full sm:w-56 md:w-60">
                          <AttributeValueEditor
                            attribute={attr}
                            units={units}
                            onChange={(patch) =>
                              setAssignedAttrs((prev) => ({
                                ...prev,
                                [attr.code]: {
                                  ...prev[attr.code]!,
                                  ...patch,
                                },
                              }))
                            }
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveAttribute(attr.code)}
                          title={`Remove ${attr.name}`}
                          className="size-9 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogShellBody>

      <DialogShellFooter>
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] text-muted-foreground">
            {totalAssignedCount}{" "}
            {totalAssignedCount === 1 ? "specification" : "specifications"}{" "}
            active
          </span>
          <div className="flex items-center gap-2">
            <DialogShellCancelButton disabled={saving}>
              Cancel
            </DialogShellCancelButton>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogShellFooter>
    </DialogShell>
  );
}
