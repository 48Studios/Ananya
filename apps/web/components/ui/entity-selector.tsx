"use client";

import * as React from "react";
import { Search, Plus, Check, Loader2, ChevronDown } from "lucide-react";
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
  value?: string;
  onChange?: (value: string, label?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  creatable?: boolean;
  className?: string;
  id?: string;
}

interface OptionItem {
  value: string;
  label: string;
  sublabel?: string;
}

export function EntitySelector({
  entity,
  value,
  onChange,
  placeholder,
  disabled = false,
  creatable = true,
  className = "",
  id,
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

  const canCreate = React.useMemo(() => {
    if (!creatable) return false;
    if (!auth || !auth.hasPermission) return true;
    if (!requiredPermission) return true;
    return auth.hasPermission(requiredPermission);
  }, [creatable, auth, requiredPermission]);

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
        items = res.map((c) => ({
          value: c.name,
          label: `${c.code} - ${c.name}`,
        }));
      } else if (entity === "manufacturer") {
        const res = await manufacturersApi.getAll();
        items = res.map((m) => ({
          value: m.name,
          label: `${m.code} - ${m.name}`,
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
      (opt) => opt.label.toLowerCase() === q || opt.value.toLowerCase() === q,
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
          conversionFactor: "1.0000",
          precision: "0",
        });
        createdVal = newUnit.name;
        createdLabel = newUnit.name;
      } else if (entity === "category") {
        const code = query.toUpperCase().replace(/\s+/g, "-").slice(0, 10);
        const newCat = await categoriesApi.create({ code, name: query });
        createdVal = newCat.name;
        createdLabel = `${newCat.code} - ${newCat.name}`;
      } else if (entity === "manufacturer") {
        const code = query.toUpperCase().replace(/\s+/g, "-").slice(0, 10);
        const newMfg = await manufacturersApi.create({ code, name: query });
        createdVal = newMfg.name;
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
      if (onChange) {
        onChange(createdVal, createdLabel);
      }
      setSearch("");
      setOpen(false);
    } catch (err: unknown) {
      console.error(`Failed to create ${entity}:`, err);
    } finally {
      setCreating(false);
    }
  };

  const selectedOption = options.find((opt) => opt.value === value);

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
          {selectedOption ? selectedOption.label : value || defaultPlaceholder}
        </span>
        <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
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
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors text-xs ${
                    isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent text-foreground"
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
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {canCreate && search.trim() && !exactMatch && (
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
