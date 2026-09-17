"use client";

import * as React from "react";
import {
  X,
  RotateCcw,
  Search,
  ChevronDown,
  ChevronUp,
  Package,
  Check,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ComponentDto } from "@/lib/api/components-api";
import type { CategoryDto } from "@/lib/api/categories-api";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type ResolvedCategoryAttributeDto,
} from "@/lib/api/attributes-api";

export type NumericOperator = "BETWEEN" | "EQ" | "GTE" | "LTE";

export interface AttributeFilterCriteria {
  selectedOptions?: string[];
  numericOperator?: NumericOperator;
  min?: string;
  max?: string;
  targetValue?: string;
  booleanVal?: "ALL" | "true" | "false";
  textSearch?: string;
}

export interface ComponentsFilterCardProps {
  components: ComponentDto[];
  categories: CategoryDto[];
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  attributeFilters: Record<string, AttributeFilterCriteria>;
  onAttributeFiltersChange: (
    filters: Record<string, AttributeFilterCriteria>,
  ) => void;
  filteredComponents: ComponentDto[];
  onClearAll: () => void;
  inStockOnly?: boolean;
  onInStockOnlyChange?: (val: boolean) => void;
  activeOnly?: boolean;
  onActiveOnlyChange?: (val: boolean) => void;
}

interface AttributeMeta {
  code: string;
  name: string;
  dataType: string;
  defaultUnit?: string | null;
  options: Array<{ code: string; label: string }>;
  isCategoryBound?: boolean;
}

export function ComponentsFilterCard({
  components,
  categories,
  selectedCategoryId,
  onCategoryChange,
  attributeFilters,
  onAttributeFiltersChange,
  filteredComponents,
  onClearAll,
  inStockOnly = false,
  onInStockOnlyChange,
  activeOnly = false,
  onActiveOnlyChange,
}: ComponentsFilterCardProps) {
  const [allDefinitions, setAllDefinitions] = React.useState<
    AttributeDefinitionDto[]
  >([]);
  const [categoryAttributes, setCategoryAttributes] = React.useState<
    ResolvedCategoryAttributeDto[]
  >([]);
  const [activeAttrCodes, setActiveAttrCodes] = React.useState<string[]>([]);
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [columnSearches, setColumnSearches] = React.useState<
    Record<string, string>
  >({});
  const [columnModes, setColumnModes] = React.useState<
    Record<string, "values" | "range">
  >({});
  const [addParamOpen, setAddParamOpen] = React.useState(false);
  const [addParamSearch, setAddParamSearch] = React.useState("");

  // 1. Fetch all system attribute definitions once
  React.useEffect(() => {
    attributesApi
      .getAll()
      .then((defs) => {
        setAllDefinitions(defs.filter((d) => d.isFilterable && d.isActive));
      })
      .catch(() => {
        setAllDefinitions([]);
      });
  }, []);

  // 2. Fetch category-bound attributes when category changes
  React.useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryAttributes([]);
      return;
    }
    attributesApi
      .getByCategory(selectedCategoryId)
      .then((attrs) => {
        setCategoryAttributes(
          attrs.filter((a) => a.attributeDefinition.isFilterable),
        );
      })
      .catch(() => {
        setCategoryAttributes([]);
      });
  }, [selectedCategoryId]);

  // 3. Build comprehensive attribute metadata dictionary
  const attributeMetaMap = React.useMemo(() => {
    const map = new Map<string, AttributeMeta>();

    for (const def of allDefinitions) {
      map.set(def.code, {
        code: def.code,
        name: def.name,
        dataType: def.dataType,
        defaultUnit: def.defaultUnit,
        options: (def.options ?? []).map((o) => ({
          code: o.code,
          label: o.label,
        })),
        isCategoryBound: false,
      });
    }

    for (const catAttr of categoryAttributes) {
      const def = catAttr.attributeDefinition;
      const opts = (catAttr.options ?? []).map((o) => ({
        code: o.code,
        label: o.label,
      }));
      map.set(def.code, {
        code: def.code,
        name: def.name,
        dataType: def.dataType,
        defaultUnit: def.defaultUnit,
        options: opts.length > 0 ? opts : (map.get(def.code)?.options ?? []),
        isCategoryBound: true,
      });
    }

    for (const comp of components) {
      if (!comp.attributes) continue;
      for (const [code, val] of Object.entries(comp.attributes)) {
        let existing = map.get(code);
        if (!existing) {
          existing = {
            code,
            name: val.name || code,
            dataType: val.dataType || "TEXT",
            defaultUnit: val.unit,
            options: [],
            isCategoryBound: false,
          };
          map.set(code, existing);
        }
        if (val.optionCode && val.optionLabel) {
          if (!existing.options.some((o) => o.code === val.optionCode)) {
            existing.options.push({
              code: val.optionCode,
              label: val.optionLabel,
            });
          }
        }
      }
    }

    return map;
  }, [allDefinitions, categoryAttributes, components]);

  // 4. Determine which attributes should be shown as parametric columns
  React.useEffect(() => {
    const codes = new Set<string>();

    if (selectedCategoryId) {
      // Show category attributes first
      if (categoryAttributes.length > 0) {
        categoryAttributes.forEach((a) =>
          codes.add(a.attributeDefinition.code),
        );
      }
      // Also show any attributes that components in this category have
      const catComps = components.filter(
        (c) => c.categoryId === selectedCategoryId,
      );
      for (const comp of catComps) {
        if (comp.attributes) {
          Object.keys(comp.attributes).forEach((c) => codes.add(c));
        }
      }
    } else {
      // When "All Categories" is selected:
      // Show universal parameters first (e.g. Package, Mounting Type, or any filtered specs)
      const universalCodes = ["package", "mounting_type"];
      universalCodes.forEach((c) => {
        if (attributeMetaMap.has(c)) codes.add(c);
      });

      // Include attributes from components with values
      const attrUsageCount = new Map<string, number>();
      for (const comp of components) {
        if (comp.attributes) {
          for (const c of Object.keys(comp.attributes)) {
            attrUsageCount.set(c, (attrUsageCount.get(c) ?? 0) + 1);
          }
        }
      }

      // Add top used attributes
      const sortedByUsage = Array.from(attrUsageCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([c]) => c);

      sortedByUsage.forEach((c) => codes.add(c));
    }

    // Always include any attribute that currently has an active filter
    Object.keys(attributeFilters).forEach((c) => {
      const crit = attributeFilters[c];
      if (
        crit &&
        ((crit.selectedOptions && crit.selectedOptions.length > 0) ||
          (crit.min !== undefined && crit.min !== "") ||
          (crit.max !== undefined && crit.max !== "") ||
          (crit.targetValue !== undefined && crit.targetValue !== "") ||
          (crit.booleanVal && crit.booleanVal !== "ALL") ||
          (crit.textSearch && crit.textSearch.trim() !== ""))
      ) {
        codes.add(c);
      }
    });

    setActiveAttrCodes(Array.from(codes));
  }, [selectedCategoryId, categoryAttributes, components, attributeFilters, attributeMetaMap]);

  // 5. Matcher function for individual attribute criteria
  const componentMatchesAttribute = React.useCallback(
    (
      comp: ComponentDto,
      code: string,
      criteria: AttributeFilterCriteria,
    ): boolean => {
      if (!criteria) return true;
      const compAttr = comp.attributes?.[code];

      // Option-based selection
      if (criteria.selectedOptions && criteria.selectedOptions.length > 0) {
        if (!compAttr) return false;
        const searchCodes = criteria.selectedOptions.map((s) =>
          s.toLowerCase(),
        );

        const optCode = compAttr.optionCode?.toLowerCase();
        const optLabel = compAttr.optionLabel?.toLowerCase();
        const dispVal = compAttr.displayValue?.toLowerCase();
        const rawVal = String(compAttr.value ?? "").toLowerCase();

        const matchesSingle =
          (optCode && searchCodes.includes(optCode)) ||
          (optLabel && searchCodes.includes(optLabel)) ||
          (dispVal && searchCodes.includes(dispVal)) ||
          searchCodes.includes(rawVal);

        if (matchesSingle) return true;

        if (Array.isArray(compAttr.value)) {
          const compValArray = compAttr.value.map((v) =>
            String(v).toLowerCase(),
          );
          if (compValArray.some((v) => searchCodes.includes(v))) {
            return true;
          }
        }

        return false;
      }

      // Boolean filter
      if (criteria.booleanVal && criteria.booleanVal !== "ALL") {
        if (!compAttr) return false;
        const expected = criteria.booleanVal === "true";
        const actual =
          compAttr.value === true ||
          compAttr.displayValue === "Yes" ||
          compAttr.displayValue === "true";
        if (actual !== expected) return false;
      }

      // Numeric / Quantity Relational filter
      const op = criteria.numericOperator || "BETWEEN";
      const hasMin = criteria.min !== undefined && criteria.min !== "";
      const hasMax = criteria.max !== undefined && criteria.max !== "";
      const hasTarget =
        criteria.targetValue !== undefined && criteria.targetValue !== "";

      if (hasMin || hasMax || hasTarget) {
        if (!compAttr) return false;
        const valNum =
          compAttr.normalizedValue !== null &&
          compAttr.normalizedValue !== undefined
            ? compAttr.normalizedValue
            : typeof compAttr.value === "number"
              ? compAttr.value
              : parseFloat(String(compAttr.value));

        if (isNaN(valNum)) return false;

        if (op === "BETWEEN") {
          if (hasMin && valNum < parseFloat(criteria.min!)) return false;
          if (hasMax && valNum > parseFloat(criteria.max!)) return false;
        } else if (op === "EQ") {
          if (
            hasTarget &&
            Math.abs(valNum - parseFloat(criteria.targetValue!)) > 0.0001
          ) {
            return false;
          }
        } else if (op === "GTE") {
          const threshold = parseFloat(
            criteria.targetValue || criteria.min || "0",
          );
          if (!isNaN(threshold) && valNum < threshold) return false;
        } else if (op === "LTE") {
          const threshold = parseFloat(
            criteria.targetValue || criteria.max || "0",
          );
          if (!isNaN(threshold) && valNum > threshold) return false;
        }
      }

      // Text search
      if (criteria.textSearch && criteria.textSearch.trim() !== "") {
        if (!compAttr) return false;
        const q = criteria.textSearch.toLowerCase().trim();
        const combined = `${compAttr.displayValue} ${compAttr.value} ${compAttr.optionLabel}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }

      return true;
    },
    [],
  );

  // 6. Faceted Relative Candidate Generator:
  // Evaluates components against category filter AND all attribute filters EXCEPT one
  const getCandidateComponentsExcluding = React.useCallback(
    (excludeAttrCode?: string): ComponentDto[] => {
      return components.filter((comp) => {
        if (selectedCategoryId && comp.categoryId !== selectedCategoryId) {
          return false;
        }

        for (const [code, criteria] of Object.entries(attributeFilters)) {
          if (code === excludeAttrCode) continue;
          if (!componentMatchesAttribute(comp, code, criteria)) {
            return false;
          }
        }

        return true;
      });
    },
    [components, selectedCategoryId, attributeFilters, componentMatchesAttribute],
  );

  // 7. Relative Category Counts
  const categoryCounts = React.useMemo(() => {
    const matchingComps = components.filter((comp) => {
      for (const [code, criteria] of Object.entries(attributeFilters)) {
        if (!componentMatchesAttribute(comp, code, criteria)) {
          return false;
        }
      }
      return true;
    });

    const map = new Map<string, number>();
    for (const comp of matchingComps) {
      if (comp.categoryId) {
        map.set(comp.categoryId, (map.get(comp.categoryId) ?? 0) + 1);
      }
    }
    return map;
  }, [components, attributeFilters, componentMatchesAttribute]);

  // 8. Active Filter Summary Count
  const activeFiltersCount = React.useMemo(() => {
    let count = selectedCategoryId ? 1 : 0;
    if (inStockOnly) count++;
    if (activeOnly) count++;
    for (const crit of Object.values(attributeFilters)) {
      if (
        (crit.selectedOptions && crit.selectedOptions.length > 0) ||
        (crit.booleanVal && crit.booleanVal !== "ALL") ||
        (crit.min !== undefined && crit.min !== "") ||
        (crit.max !== undefined && crit.max !== "") ||
        (crit.targetValue !== undefined && crit.targetValue !== "") ||
        (crit.textSearch && crit.textSearch.trim() !== "")
      ) {
        count++;
      }
    }
    return count;
  }, [selectedCategoryId, inStockOnly, activeOnly, attributeFilters]);

  const handleUpdateFilter = (
    code: string,
    patch: Partial<AttributeFilterCriteria>,
  ) => {
    onAttributeFiltersChange({
      ...attributeFilters,
      [code]: {
        ...attributeFilters[code],
        ...patch,
      },
    });
  };

  const handleRemoveFilter = (code: string) => {
    const next = { ...attributeFilters };
    delete next[code];
    onAttributeFiltersChange(next);
  };

  const handleToggleOption = (code: string, optionCode: string) => {
    const current = attributeFilters[code]?.selectedOptions || [];
    const exists = current.includes(optionCode);
    const next = exists
      ? current.filter((c) => c !== optionCode)
      : [...current, optionCode];
    handleUpdateFilter(code, { selectedOptions: next });
  };

  // Top categories with non-zero or notable items for quick category pills
  const topCategories = React.useMemo(() => {
    return categories.filter((cat) => {
      const cnt = categoryCounts.get(cat.id) ?? 0;
      return cnt > 0 || cat.id === selectedCategoryId;
    });
  }, [categories, categoryCounts, selectedCategoryId]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden transition-all">
      {/* ── DigiKey Header Bar ───────────────────────────────────────── */}
      <div className="p-4 border-b border-border/80 bg-muted/20">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
              <SlidersHorizontal className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  Parametric Filter Matrix
                </span>
                {activeFiltersCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/20">
                    {activeFiltersCount} active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Showing{" "}
                <span className="font-mono font-semibold text-foreground">
                  {filteredComponents.length}
                </span>{" "}
                of{" "}
                <span className="font-mono text-muted-foreground">
                  {components.length}
                </span>{" "}
                matching components
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
            {/* Quick stock toggles */}
            {onInStockOnlyChange && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-2 py-1 rounded-md border border-border/60 bg-background/60">
                <Checkbox
                  checked={inStockOnly}
                  onCheckedChange={(c) => onInStockOnlyChange(Boolean(c))}
                  className="size-3.5"
                />
                <span>In Stock Only</span>
              </label>
            )}

            {onActiveOnlyChange && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none px-2 py-1 rounded-md border border-border/60 bg-background/60">
                <Checkbox
                  checked={activeOnly}
                  onCheckedChange={(c) => onActiveOnlyChange(Boolean(c))}
                  className="size-3.5"
                />
                <span>Active Only</span>
              </label>
            )}

            {/* Add Parameter Button */}
            <Popover open={addParamOpen} onOpenChange={setAddParamOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 font-normal"
                  >
                    <Plus className="size-3.5 text-muted-foreground" />
                    <span>Add Parameter</span>
                  </Button>
                }
              />
              <PopoverContent
                className="w-72 p-2 space-y-2 text-xs"
                align="end"
              >
                <div className="relative">
                  <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search parameter..."
                    value={addParamSearch}
                    onChange={(e) => setAddParamSearch(e.target.value)}
                    className="h-8 text-xs pl-8"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {Array.from(attributeMetaMap.values())
                    .filter(
                      (meta) =>
                        !activeAttrCodes.includes(meta.code) &&
                        (!addParamSearch.trim() ||
                          meta.name
                            .toLowerCase()
                            .includes(addParamSearch.toLowerCase()) ||
                          meta.code
                            .toLowerCase()
                            .includes(addParamSearch.toLowerCase())),
                    )
                    .map((meta) => (
                      <button
                        key={meta.code}
                        type="button"
                        onClick={() => {
                          setActiveAttrCodes((prev) => [...prev, meta.code]);
                          setAddParamOpen(false);
                          setAddParamSearch("");
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-muted text-left text-xs transition-colors cursor-pointer"
                      >
                        <span className="font-medium text-foreground">
                          {meta.name}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                          {meta.dataType}
                        </span>
                      </button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear All */}
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
                title="Reset all filters"
              >
                <RotateCcw className="size-3 mr-1" />
                Reset All
              </Button>
            )}

            {/* Collapse/Expand toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((v) => !v)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3.5 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5 mr-1" />
                  Expand
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ── Category Pill Filter Tabs (DigiKey Product Family Bar) ─── */}
        <div className="flex items-center gap-1.5 pt-3 mt-3 border-t border-border/50 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Package className="size-3 text-muted-foreground/80" />
            Category:
          </span>

          <button
            type="button"
            onClick={() => onCategoryChange("")}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 cursor-pointer",
              !selectedCategoryId
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span>All Categories</span>
            <span
              className={cn(
                "font-mono text-[10px] px-1.5 py-0.2 rounded",
                !selectedCategoryId
                  ? "bg-black/20 text-primary-foreground"
                  : "bg-background/80 text-muted-foreground",
              )}
            >
              {components.length}
            </span>
          </button>

          {topCategories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            const count = categoryCounts.get(cat.id) ?? 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(isSelected ? "" : cat.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 cursor-pointer border",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground",
                  count === 0 &&
                    !isSelected &&
                    "opacity-50 hover:opacity-100",
                )}
              >
                <span>{cat.name}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] px-1.5 py-0.2 rounded",
                    isSelected
                      ? "bg-black/20 text-primary-foreground"
                      : "bg-background/80 text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* More categories dropdown if applicable */}
          {categories.length > topCategories.length && (
            <div className="shrink-0 ml-1">
              <Select
                value={
                  selectedCategoryId &&
                  !topCategories.some((c) => c.id === selectedCategoryId)
                    ? selectedCategoryId
                    : ""
                }
                onValueChange={(val) => onCategoryChange(val || "")}
              >
                <SelectTrigger className="h-7 text-xs border-dashed px-2">
                  <SelectValue placeholder="More Categories..." />
                </SelectTrigger>
                <SelectContent align="start">
                  {categories
                    .filter((c) => !topCategories.some((tc) => tc.id === c.id))
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name} ({categoryCounts.get(cat.id) ?? 0})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* ── Active Filter Pills Bar (DigiKey Applied Filters) ─────────── */}
      {activeFiltersCount > 0 && (
        <div className="px-4 py-2 bg-muted/40 border-b border-border/80 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Applied:
          </span>

          {selectedCategory && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs">
              <span className="text-[10px] text-muted-foreground uppercase font-mono">
                Cat:
              </span>
              <span className="font-medium">{selectedCategory.name}</span>
              <button
                type="button"
                onClick={() => onCategoryChange("")}
                className="hover:bg-primary/20 rounded p-0.5 ml-0.5 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </span>
          )}

          {Object.entries(attributeFilters).map(([code, crit]) => {
            const meta = attributeMetaMap.get(code);
            const name = meta?.name || code;
            const hasOptions =
              crit.selectedOptions && crit.selectedOptions.length > 0;
            const hasNumeric =
              (crit.min !== undefined && crit.min !== "") ||
              (crit.max !== undefined && crit.max !== "") ||
              (crit.targetValue !== undefined && crit.targetValue !== "");
            const hasBool = crit.booleanVal && crit.booleanVal !== "ALL";
            const hasText = crit.textSearch && crit.textSearch.trim() !== "";

            if (!hasOptions && !hasNumeric && !hasBool && !hasText) return null;

            let labelContent = "";
            if (hasOptions) {
              labelContent = crit.selectedOptions!.join(", ");
            } else if (hasBool) {
              labelContent = crit.booleanVal === "true" ? "Yes" : "No";
            } else if (hasNumeric) {
              const op = crit.numericOperator || "BETWEEN";
              const unit = meta?.defaultUnit ? ` ${meta.defaultUnit}` : "";
              if (op === "BETWEEN") {
                labelContent = `${crit.min || "0"} – ${crit.max || "∞"}${unit}`;
              } else if (op === "EQ") {
                labelContent = `= ${crit.targetValue}${unit}`;
              } else if (op === "GTE") {
                labelContent = `≥ ${crit.targetValue || crit.min}${unit}`;
              } else if (op === "LTE") {
                labelContent = `≤ ${crit.targetValue || crit.max}${unit}`;
              }
            } else if (hasText) {
              labelContent = `"${crit.textSearch}"`;
            }

            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-card text-foreground border border-border text-xs shadow-2xs"
              >
                <span className="text-[10px] text-muted-foreground uppercase font-mono">
                  {name}:
                </span>
                <span className="font-medium font-mono text-xs truncate max-w-[150px]">
                  {labelContent}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter(code)}
                  className="hover:bg-muted rounded p-0.5 ml-0.5 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* ── DigiKey Parametric Filter Columns Container ─────────────── */}
      {isExpanded && activeAttrCodes.length > 0 && (
        <div className="p-4 overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-[220px] md:auto-cols-[240px] gap-3 min-w-full pb-2">
            {activeAttrCodes.map((code) => {
              const meta = attributeMetaMap.get(code);
              if (!meta) return null;

              const criteria = attributeFilters[code] || {};
              const candidates = getCandidateComponentsExcluding(code);
              const filterSearch = columnSearches[code] || "";
              const columnMode = columnModes[code] || "values";

              // ── Collect values & relative counts from candidate components ──
              const optionCounts = new Map<string, number>();
              const labelToOptionMap = new Map<string, string>();
              let relativeMin: number | null = null;
              let relativeMax: number | null = null;

              for (const comp of candidates) {
                const compAttr = comp.attributes?.[code];
                if (!compAttr) continue;

                const valKey =
                  compAttr.optionCode ||
                  compAttr.displayValue ||
                  String(compAttr.value ?? "");

                if (valKey) {
                  optionCounts.set(
                    valKey,
                    (optionCounts.get(valKey) ?? 0) + 1,
                  );
                  if (compAttr.optionLabel) {
                    labelToOptionMap.set(valKey, compAttr.optionLabel);
                  }
                }

                // Numeric bounds tracking
                const num =
                  compAttr.normalizedValue !== null &&
                  compAttr.normalizedValue !== undefined
                    ? compAttr.normalizedValue
                    : typeof compAttr.value === "number"
                      ? compAttr.value
                      : parseFloat(String(compAttr.value));

                if (!isNaN(num)) {
                  if (relativeMin === null || num < relativeMin) relativeMin = num;
                  if (relativeMax === null || num > relativeMax) relativeMax = num;
                }
              }

              // Also include predefined options from definition if SELECT/MULTI_SELECT
              const optionsList: Array<{ code: string; label: string }> = [];
              const seenCodes = new Set<string>();

              // Seed from definition options
              for (const opt of meta.options) {
                optionsList.push({ code: opt.code, label: opt.label });
                seenCodes.add(opt.code);
              }

              // Include any values found in candidate components not in options
              for (const valKey of optionCounts.keys()) {
                if (!seenCodes.has(valKey)) {
                  optionsList.push({
                    code: valKey,
                    label: labelToOptionMap.get(valKey) || valKey,
                  });
                  seenCodes.add(valKey);
                }
              }

              // Sort options: Selected first, then count descending, then alphabetical
              const selectedSet = new Set(criteria.selectedOptions || []);
              optionsList.sort((a, b) => {
                const aSel = selectedSet.has(a.code);
                const bSel = selectedSet.has(b.code);
                if (aSel && !bSel) return -1;
                if (!aSel && bSel) return 1;
                const countA = optionCounts.get(a.code) ?? 0;
                const countB = optionCounts.get(b.code) ?? 0;
                if (countB !== countA) return countB - countA;
                return a.label.localeCompare(b.label);
              });

              // Filter by in-column search query
              const filteredOptions = optionsList.filter((opt) => {
                if (!filterSearch.trim()) return true;
                const q = filterSearch.toLowerCase().trim();
                return (
                  opt.label.toLowerCase().includes(q) ||
                  opt.code.toLowerCase().includes(q)
                );
              });

              const isNumeric =
                meta.dataType === "QUANTITY" ||
                meta.dataType === "NUMBER" ||
                meta.dataType === "INTEGER";

              const activeColCount =
                (criteria.selectedOptions?.length || 0) +
                ((criteria.min || criteria.max || criteria.targetValue) ? 1 : 0) +
                (criteria.booleanVal && criteria.booleanVal !== "ALL" ? 1 : 0);

              return (
                <div
                  key={code}
                  className={cn(
                    "flex flex-col rounded-lg border bg-card/60 transition-all shadow-2xs overflow-hidden",
                    activeColCount > 0
                      ? "border-primary/50 ring-1 ring-primary/20"
                      : "border-border/80",
                  )}
                >
                  {/* Column Header */}
                  <div className="p-2.5 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p
                        className="text-xs font-semibold text-foreground truncate"
                        title={meta.name}
                      >
                        {meta.name}
                      </p>
                      {meta.defaultUnit && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {meta.defaultUnit}
                        </p>
                      )}
                    </div>
                    {activeColCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFilter(code)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        title="Clear parameter"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Mode Selector for Numeric Parameters (Values vs Range) */}
                  {isNumeric && (
                    <div className="grid grid-cols-2 p-1 bg-muted/20 border-b border-border/40 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() =>
                          setColumnModes((prev) => ({
                            ...prev,
                            [code]: "values",
                          }))
                        }
                        className={cn(
                          "py-1 rounded text-center transition-colors cursor-pointer",
                          columnMode === "values"
                            ? "bg-background text-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Values
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setColumnModes((prev) => ({
                            ...prev,
                            [code]: "range",
                          }))
                        }
                        className={cn(
                          "py-1 rounded text-center transition-colors cursor-pointer",
                          columnMode === "range"
                            ? "bg-background text-foreground shadow-2xs font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Range (Min–Max)
                      </button>
                    </div>
                  )}

                  {/* Search inside column */}
                  {columnMode === "values" && optionsList.length > 5 && (
                    <div className="p-1.5 border-b border-border/40 bg-background/50">
                      <div className="relative">
                        <Search className="size-3 absolute left-2 top-2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Filter values..."
                          value={filterSearch}
                          onChange={(e) =>
                            setColumnSearches((prev) => ({
                              ...prev,
                              [code]: e.target.value,
                            }))
                          }
                          className="h-7 text-[11px] pl-7 pr-2"
                        />
                      </div>
                    </div>
                  )}

                  {/* Listbox Body */}
                  {columnMode === "values" ? (
                    <div className="h-44 overflow-y-auto p-1 space-y-0.5 scrollbar-thin text-xs">
                      {filteredOptions.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-[11px]">
                          No options match
                        </div>
                      ) : (
                        filteredOptions.map((opt) => {
                          const isChecked = selectedSet.has(opt.code);
                          const count = optionCounts.get(opt.code) ?? 0;
                          return (
                            <button
                              key={opt.code}
                              type="button"
                              onClick={() =>
                                handleToggleOption(code, opt.code)
                              }
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors cursor-pointer select-none text-xs",
                                isChecked
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "hover:bg-muted/60 text-foreground",
                                count === 0 &&
                                  !isChecked &&
                                  "opacity-40 text-muted-foreground hover:opacity-80",
                              )}
                            >
                              <div className="flex items-center gap-2 truncate pr-1">
                                <div
                                  className={cn(
                                    "size-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                    isChecked
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-input bg-background/60",
                                  )}
                                >
                                  {isChecked && <Check className="size-2.5" />}
                                </div>
                                <span
                                  className="font-mono text-xs truncate"
                                  title={opt.label}
                                >
                                  {opt.label}
                                </span>
                              </div>
                              <span
                                className={cn(
                                  "font-mono text-[10px] px-1 py-0.2 rounded shrink-0",
                                  count > 0
                                    ? "text-muted-foreground bg-muted/60 font-semibold"
                                    : "text-muted-foreground/40",
                                )}
                              >
                                {count}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    /* Range Input Mode for Numeric Parameter */
                    <div className="p-3 space-y-2.5 h-44 flex flex-col justify-center text-xs">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono text-muted-foreground">
                          Minimum
                        </label>
                        <Input
                          type="number"
                          placeholder={
                            relativeMin !== null ? String(relativeMin) : "Min"
                          }
                          value={criteria.min || ""}
                          onChange={(e) =>
                            handleUpdateFilter(code, {
                              min: e.target.value,
                              numericOperator: "BETWEEN",
                            })
                          }
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-mono text-muted-foreground">
                          Maximum
                        </label>
                        <Input
                          type="number"
                          placeholder={
                            relativeMax !== null ? String(relativeMax) : "Max"
                          }
                          value={criteria.max || ""}
                          onChange={(e) =>
                            handleUpdateFilter(code, {
                              max: e.target.value,
                              numericOperator: "BETWEEN",
                            })
                          }
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      {(criteria.min || criteria.max) && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            handleUpdateFilter(code, { min: "", max: "" })
                          }
                          className="w-full text-xs text-muted-foreground hover:text-foreground h-7"
                        >
                          Clear Range
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Column Footer: Selection count */}
                  <div className="p-1.5 bg-muted/30 border-t border-border/60 text-[10px] font-mono text-muted-foreground flex items-center justify-between">
                    <span>
                      {selectedSet.size > 0
                        ? `${selectedSet.size} selected`
                        : "Any"}
                    </span>
                    <span>{optionsList.length} options</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
