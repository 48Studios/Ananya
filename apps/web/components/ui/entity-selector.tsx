"use client";

import * as React from "react";
import { Search, Plus, Check, Loader2, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth/auth-context";
import { unitsApi } from "@/lib/api/units-api";
import { categoriesApi } from "@/lib/api/categories-api";
import { manufacturersApi } from "@/lib/api/manufacturers-api";
import { suppliersApi } from "@/lib/api/suppliers-api";
import { warehousesApi, WarehouseDto } from "@/lib/api/warehouses-api";
import { locationsApi } from "@/lib/api/locations-api";
import { customersApi, CustomerDto } from "@/lib/api/customers-api";
import { projectsApi } from "@/lib/api/projects-api";

export type EntityType =
  | "unit"
  | "category"
  | "manufacturer"
  | "supplier"
  | "warehouse"
  | "location"
  | "customer"
  | "project";

export interface EntitySelectorProps {
  entity: EntityType;
  value?: string | null;
  onChange?: (value: string | null, label?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  creatable?: boolean;
  /**
   * Explicit capability for the create affordance.
   *
   * When provided it replaces this component's own per-entity permission
   * mapping. Callers that already derive their own capability from the real
   * permission vocabulary (`Inventory.Update`, for example) must be able to say
   * so: the strings mapped above predate that vocabulary, so a reviewer who
   * legitimately holds write access would otherwise be denied the create button.
   * Omitting it leaves the previous behaviour untouched.
   */
  canCreate?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  createParentId?: string | null;
  aiSuggestion?: {
    label: string;
    resolution: "EXISTING" | "NEW_CANDIDATE" | "UNKNOWN";
    value?: string | null;
  } | null;
  pendingOption?: {
    label: string;
    sublabel?: string;
  } | null;
}

interface OptionItem {
  value: string;
  label: string;
  sublabel?: string;
  normalizedLabel?: string;
}

export function EntitySelector({
  entity,
  value,
  onChange,
  placeholder,
  disabled = false,
  creatable = true,
  canCreate,
  clearable = true,
  className = "",
  id,
  createParentId,
  aiSuggestion,
  pendingOption,
}: EntitySelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [options, setOptions] = React.useState<OptionItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  let auth: ReturnType<typeof useAuth> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    auth = useAuth();
  } catch {
    auth = null;
  }

  const requiredPermission = React.useMemo(() => {
    switch (entity) {
      case "unit":
        return "component:write";
      case "category":
        return "component:write";
      case "manufacturer":
        return "component:write";
      case "supplier":
        return "supplier:write";
      case "warehouse":
        return "inventory:adjust";
      case "location":
        return "inventory:adjust";
      case "customer":
        return "sales:write";
      case "project":
        return "project:write";
      default:
        return "";
    }
  }, [entity]);

  const canCreateOption = React.useMemo(() => {
    if (!creatable) return false;
    if (canCreate !== undefined) return canCreate;
    if (!auth || !auth.hasPermission) return true;
    if (!requiredPermission) return true;
    return auth.hasPermission(requiredPermission);
  }, [creatable, canCreate, auth, requiredPermission]);

  const loadOptions = React.useCallback(async () => {
    setLoading(true);
    try {
      let items: OptionItem[] = [];
      if (entity === "unit") {
        const res = await unitsApi.getAll();
        items = res.map((u) => ({
          value: u.name,
          label: u.name,
          sublabel: u.category,
        }));
      } else if (entity === "category") {
        const res = await categoriesApi.getAll();
        const byId = new Map(res.map((category) => [category.id, category]));
        const getPath = (category: (typeof res)[number]) => {
          const path: string[] = [category.name];
          let parentId = category.parentId;
          while (parentId) {
            const parent = byId.get(parentId);
            if (!parent) break;
            path.unshift(parent.name);
            parentId = parent.parentId;
          }
          return path.join(" → ");
        };
        items = res.map((c) => ({
          value: c.id,
          label: getPath(c),
          sublabel: c.code,
          normalizedLabel: c.name,
        }));
      } else if (entity === "manufacturer") {
        const res = await manufacturersApi.getAll();
        items = res.map((m) => ({
          value: m.id,
          label: m.name,
          sublabel: m.code.toUpperCase(),
          normalizedLabel: m.name,
        }));
      } else if (entity === "supplier") {
        const res = await suppliersApi.getAll();
        items = res.map((s) => ({
          value: s.id,
          label: `${s.code} - ${s.name}`,
        }));
      } else if (entity === "warehouse") {
        const res: WarehouseDto[] = await warehousesApi.getAll();
        items = res.map((w: WarehouseDto) => ({
          value: w.id,
          label: `${w.code} - ${w.name}`,
        }));
      } else if (entity === "location") {
        const res = await locationsApi.getAll();
        items = res.map((l) => ({
          value: l.id,
          label: `${l.code} - ${l.name}`,
          sublabel: l.kind,
        }));
      } else if (entity === "customer") {
        const res: CustomerDto[] = await customersApi.getAll();
        items = res.map((c: CustomerDto) => ({
          value: c.id,
          label: `${c.customerNumber} - ${c.name}`,
        }));
      } else if (entity === "project") {
        const res = await projectsApi.getAll();
        items = res.map((p) => ({
          value: p.id,
          label: `${p.projectNumber} - ${p.name}`,
        }));
      }
      setOptions(items);
    } catch {
      // Non-blocking load error
    } finally {
      setLoading(false);
    }
  }, [entity]);

  React.useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        opt.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  const exactMatch = React.useMemo(() => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return options.some(
      (opt) =>
        opt.label.toLowerCase() === q ||
        opt.normalizedLabel?.toLowerCase() === q ||
        opt.value.toLowerCase() === q,
    );
  }, [options, search]);

  const handleCreate = async () => {
    if (!search.trim() || creating) return;
    const query = search.trim();
    setCreating(true);

    try {
      let createdVal = query;
      let createdLabel = query;

      if (entity === "unit") {
        const newUnit = await unitsApi.create({
          name: query.toLowerCase(),
          category: "Count",
          conversionFactor: 1.0,
          precision: 0,
        });
        createdVal = newUnit.name;
        createdLabel = newUnit.name;
      } else if (entity === "category") {
        const code = query.toUpperCase().replace(/\s+/g, "-").slice(0, 10);
        const newCat = await categoriesApi.create({
          code,
          name: query,
          parentId: createParentId ?? null,
        });
        createdVal = newCat.id;
        createdLabel = `${newCat.code} - ${newCat.name}`;
      } else if (entity === "manufacturer") {
        const code = query.toUpperCase().replace(/\s+/g, "-").slice(0, 10);
        const newMfg = await manufacturersApi.create({ code, name: query });
        createdVal = newMfg.id;
        createdLabel = `${newMfg.code} - ${newMfg.name}`;
      } else if (entity === "supplier") {
        const code = `SUP-${query.toUpperCase().replace(/\s+/g, "-").slice(0, 6)}`;
        const newSup = await suppliersApi.create({ code, name: query });
        createdVal = newSup.id;
        createdLabel = `${newSup.code} - ${newSup.name}`;
      } else if (entity === "warehouse") {
        const code = `WH-${query.toUpperCase().replace(/\s+/g, "-").slice(0, 6)}`;
        const newWh = await warehousesApi.create({ code, name: query });
        createdVal = newWh.id;
        createdLabel = `${newWh.code} - ${newWh.name}`;
      } else if (entity === "location") {
        const code = `LOC-${query.toUpperCase().replace(/\s+/g, "-").slice(0, 6)}`;
        const newLoc = await locationsApi.create({
          code,
          name: query,
          kind: "STORAGE",
        });
        createdVal = newLoc.id;
        createdLabel = `${newLoc.code} - ${newLoc.name}`;
      } else if (entity === "customer") {
        const num = `CUST-${query.toUpperCase().replace(/\s+/g, "-").slice(0, 6)}`;
        const newCust = await customersApi.create({
          customerNumber: num,
          name: query,
        });
        createdVal = newCust.id;
        createdLabel = `${newCust.customerNumber} - ${newCust.name}`;
      } else if (entity === "project") {
        const now = new Date().toISOString();
        const newPrj = await projectsApi.create({
          name: query,
          projectManager: "System Administrator",
          startDate: now,
          targetCompletionDate: now,
        });
        createdVal = newPrj.id;
        createdLabel = `${newPrj.projectNumber} - ${newPrj.name}`;
      }

      await loadOptions();
      if (onChange) onChange(createdVal, createdLabel);
      setSearch("");
      setOpen(false);
    } catch (err: unknown) {
      console.error(`Failed to create ${entity}:`, err);
    } finally {
      setCreating(false);
    }
  };

  const selectedOption = options.find((opt) => opt.value === value);
  const aiSelectedOption =
    value && aiSuggestion?.resolution === "EXISTING" && aiSuggestion.value === value
      ? { label: aiSuggestion.label, sublabel: "" }
      : null;
  const displayedOption = selectedOption ?? aiSelectedOption;
  const hasSelection = Boolean(value || pendingOption);

  const defaultPlaceholder = React.useMemo(() => {
    if (placeholder) return placeholder;
    return `Select ${entity.charAt(0).toUpperCase() + entity.slice(1)}...`;
  }, [entity, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border border-input bg-transparent font-normal text-xs h-9 hover:bg-accent transition-colors ${className}`}
      >
        <span className="truncate">
          {pendingOption ? (
            <span className="block truncate min-w-0 text-left">
              {pendingOption.label}{" "}
              <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-primary">
                NEW
              </span>
            </span>
          ) : displayedOption ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate text-left">
              <span className="truncate">{displayedOption.label}</span>
              {displayedOption.sublabel && (
                <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {displayedOption.sublabel}
                </span>
              )}
            </span>
          ) : (
            value || defaultPlaceholder
          )}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {clearable && hasSelection && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                if (onChange) onChange(null, "");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  if (onChange) onChange(null, "");
                }
              }}
              className="p-0.5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2 space-y-2 text-xs" align="start">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder={`Search or type to create ${entity}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8"
            autoFocus
          />
        </div>

        <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
          {clearable && hasSelection && (
            <button
              type="button"
              onClick={() => {
                if (onChange) onChange(null, "");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive italic border-b border-border/50 mb-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>None (Clear selection)</span>
            </button>
          )}
          {loading ? (
            <div className="p-4 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Loading options...</span>
            </div>
          ) : filteredOptions.length === 0 && exactMatch ? (
            <div className="p-3 text-center text-muted-foreground">
              No matching records found.
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (onChange) onChange(opt.value, opt.label);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors text-xs cursor-pointer ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent hover:text-accent-foreground text-foreground"
                  }`}
                >
                  <div className="truncate">
                    <span className="block truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[10px] text-muted-foreground font-mono block">
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-accent-foreground shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {aiSuggestion && aiSuggestion.resolution !== "UNKNOWN" && (
          <div className="border-t border-border pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              AI suggested
            </div>
            <button
              type="button"
              className="w-full rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2 text-left text-xs hover:bg-primary/10"
              onClick={() => {
                if (aiSuggestion.value) {
                  onChange?.(aiSuggestion.value, aiSuggestion.label);
                  setOpen(false);
                }
              }}
            >
              <span className="block font-medium">{aiSuggestion.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {aiSuggestion.resolution === "EXISTING" ? "Existing record" : "New candidate"}
              </span>
            </button>
            {aiSuggestion.resolution === "NEW_CANDIDATE" && (
              <div className="mt-1 rounded-md px-2.5 py-1 text-[10px] text-muted-foreground">
                New • will be created on save
              </div>
            )}
          </div>
        )}

        {canCreateOption && search.trim() && !exactMatch && (
          <div className="pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="w-full justify-start text-xs text-primary font-semibold hover:bg-primary/10 gap-1.5 h-8"
            >
              {creating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating &quot;{search.trim()}&quot;...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Create &quot;{search.trim()}&quot;
                </>
              )}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
