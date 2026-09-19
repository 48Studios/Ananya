"use client";

import * as React from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Sliders, Sparkles, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { mlApi, type ComponentSuggestionResponseDto } from "@/lib/api/ml-api";
import { AiSuggestionReviewCard } from "./ai-suggestion-review-card";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { EntitySelector } from "@/components/ui/entity-selector";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  componentsApi,
  type ComponentDto,
  type CreateComponentPayload,
  type UpdateComponentPayload,
} from "@/lib/api/components-api";
import {
  attributesApi,
  type ResolvedCategoryAttributeDto,
} from "@/lib/api/attributes-api";

const componentSchema = z.object({
  sku: z
    .string()
    .transform((val) => val?.trim().toUpperCase() ?? ""),
  manufacturerPartNumber: z.string().optional().nullable(),
  name: z
    .string()
    .min(1, "Component name is required")
    .transform((val) => val.trim()),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  manufacturerId: z.string().optional().nullable(),
  unit: z
    .string()
    .min(1, "Unit of measure is required")
    .transform((val) => val.trim().toLowerCase()),
  defaultLocationId: z.string().optional().nullable(),
});

export type ComponentFormValues = z.infer<typeof componentSchema>;

interface ComponentFormProps {
  initialData?: ComponentDto | null;
  onSuccess: (savedComponent: ComponentDto) => void;
  onCancel: () => void;
}

const COMPATIBLE_UNITS: Record<string, string[]> = {
  Resistance: ["ohm", "kohm", "Mohm"],
  Capacitance: ["uF", "nF", "pF", "F"],
  Voltage: ["V", "mV", "kV"],
  Power: ["W", "mW", "kW"],
  Current: ["mA", "A", "uA"],
  Inductance: ["uH", "mH", "H"],
  Length: ["mm", "cm", "m"],
  Percentage: ["%"],
  Temperature: ["°C"],
};

export function ComponentForm({
  initialData,
  onSuccess,
  onCancel,
}: ComponentFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const [categoryAttributes, setCategoryAttributes] = React.useState<
    ResolvedCategoryAttributeDto[]
  >([]);
  const [loadingAttrs, setLoadingAttrs] = React.useState(false);
  const [attrValues, setAttrValues] = React.useState<
    Record<
      string,
      {
        value?: unknown;
        attributeDefinitionId?: string | null;
        unit?: string | null;
        optionCode?: string;
        selectedOptionCodes?: string[];
      }
    >
  >({});

  const [suggestion, setSuggestion] = React.useState<ComponentSuggestionResponseDto | null>(null);
  const [loadingAi, setLoadingAi] = React.useState(false);
  const [showDatasheetBox, setShowDatasheetBox] = React.useState(false);
  const [datasheetInput, setDatasheetInput] = React.useState("");

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ComponentFormValues>({
    resolver: zodResolver(componentSchema),
    defaultValues: {
      sku: initialData?.sku ?? "",
      manufacturerPartNumber: initialData?.manufacturerPartNumber ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      categoryId: initialData?.categoryId ?? "",
      manufacturerId: initialData?.manufacturerId ?? "",
      unit: initialData?.unit ?? "pcs",
      defaultLocationId: initialData?.defaultLocationId ?? "",
    },
  });

  const selectedCategoryId = useWatch({ control, name: "categoryId" });
  const attributeConflicts = React.useMemo(() => {
    if (!initialData?.attributes || !suggestion) return [];
    return Object.entries(suggestion.attributes).flatMap(([code, extracted]) => {
      const existing = initialData.attributes?.[code];
      if (!existing || String(existing.displayValue) === extracted.formatted) return [];
      return [{ code, existing: existing.displayValue, extracted: extracted.formatted }];
    });
  }, [initialData, suggestion]);

  // Initialize form and attribute state from initialData
  React.useEffect(() => {
    reset({
      sku: initialData?.sku ?? "",
      manufacturerPartNumber: initialData?.manufacturerPartNumber ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      categoryId: initialData?.categoryId ?? "",
      manufacturerId: initialData?.manufacturerId ?? "",
      unit: initialData?.unit ?? "pcs",
      defaultLocationId: initialData?.defaultLocationId ?? "",
    });

    if (initialData?.attributes) {
      const initialAttrs: Record<
        string,
        {
          value?: unknown;
          attributeDefinitionId?: string | null;
          unit?: string | null;
          optionCode?: string;
          selectedOptionCodes?: string[];
        }
      > = {};
      for (const [code, item] of Object.entries(initialData.attributes)) {
        let selectedOptionCodes: string[] | undefined;
        if (Array.isArray(item.value)) {
          selectedOptionCodes = item.value.map(String);
        }
        initialAttrs[code] = {
          value: item.value,
          unit: item.unit,
          optionCode:
            item.optionCode ??
            (typeof item.value === "string" ? item.value : ""),
          attributeDefinitionId: item.definitionId,
          selectedOptionCodes,
        };
      }
      setAttrValues(initialAttrs);
    }
  }, [initialData, reset]);

  // Load category attributes when category changes
  React.useEffect(() => {
    let isCurrent = true;
    if (!selectedCategoryId) {
      setCategoryAttributes([]);
      return;
    }

    setLoadingAttrs(true);
    attributesApi
      .getByCategory(selectedCategoryId)
      .then((data) => {
        if (isCurrent) {
          setCategoryAttributes(data);
          // Set default units for QUANTITY attributes if not already populated
          setAttrValues((prev) => {
            const next = { ...prev };
            for (const item of data) {
              const code = item.attributeDefinition.code;
              if (
                item.attributeDefinition.dataType === "QUANTITY" &&
                !next[code]?.unit
              ) {
                const defUnit =
                  item.attributeDefinition.defaultUnit ||
                  (item.attributeDefinition.unitCategory &&
                    COMPATIBLE_UNITS[item.attributeDefinition.unitCategory]?.[0]) ||
                  "";
                next[code] = {
                  ...next[code],
                  unit: defUnit,
                };
              }
            }
            return next;
          });
        }
      })
      .catch(() => {
        if (isCurrent) setCategoryAttributes([]);
      })
      .finally(() => {
        if (isCurrent) setLoadingAttrs(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedCategoryId]);

  const handleAttrChange = (code: string, field: string, val: unknown) => {
    setAttrValues((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: val,
      },
    }));
  };

  const toggleMultiSelectOption = (code: string, optCode: string) => {
    setAttrValues((prev) => {
      const currentList = prev[code]?.selectedOptionCodes ?? [];
      const exists = currentList.includes(optCode);
      const nextList = exists
        ? currentList.filter((c) => c !== optCode)
        : [...currentList, optCode];
      return {
        ...prev,
        [code]: {
          ...prev[code],
          value: nextList,
          selectedOptionCodes: nextList,
        },
      };
    });
  };

  const handleFetchAiSuggestions = async (overrideQuery?: string) => {
    const q = overrideQuery || datasheetInput || watch("manufacturerPartNumber") || watch("name");
    if (!q || q.trim().length === 0) return;

    setLoadingAi(true);
    setServerError(null);
    try {
      const res = await mlApi.suggest({
        query: q.trim(),
        partNumber: watch("manufacturerPartNumber") || undefined,
        description: watch("name") || datasheetInput || undefined,
        datasheetText: datasheetInput || undefined,
      });
      setSuggestion(res);
    } catch (err: unknown) {
      console.warn("AI suggestion fetch failed:", err);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleApplyAllSuggestions = () => {
    if (!suggestion) return;

    if (suggestion.manufacturerPartNumber) {
      setValue("manufacturerPartNumber", suggestion.manufacturerPartNumber, {
        shouldDirty: true,
      });
    }
    if (suggestion.suggestedName) {
      setValue("name", suggestion.suggestedName, { shouldValidate: true });
    }
    if (suggestion.suggestedDescription) {
      setValue("description", suggestion.suggestedDescription, {
        shouldDirty: true,
      });
    }
    if (suggestion.category?.categoryId) {
      setValue("categoryId", suggestion.category.categoryId, { shouldValidate: true });
    }
    if (suggestion.manufacturer?.manufacturerId) {
      setValue("manufacturerId", suggestion.manufacturer.manufacturerId, { shouldValidate: true });
    }
    if (suggestion.suggestedUnit) {
      setValue("unit", suggestion.suggestedUnit, { shouldValidate: true });
    }

    if (suggestion.attributes && Object.keys(suggestion.attributes).length > 0) {
      setAttrValues((prev) => {
        const next = { ...prev };
        for (const [code, attr] of Object.entries(suggestion.attributes)) {
          next[code] = {
            attributeDefinitionId: attr.attributeDefinitionId,
            value: attr.value,
            unit: attr.unit || next[code]?.unit,
            optionCode: typeof attr.value === "string" ? attr.value : undefined,
          };
        }
        return next;
      });
    }
  };

  const handleApplyCategory = () => {
    if (suggestion?.category?.categoryId) {
      setValue("categoryId", suggestion.category.categoryId, { shouldValidate: true });
    }
  };

  const handleApplyManufacturer = () => {
    if (suggestion?.manufacturer?.manufacturerId) {
      setValue("manufacturerId", suggestion.manufacturer.manufacturerId, { shouldValidate: true });
    }
  };

  const handleApplyAttributes = (attrs: Record<string, unknown>) => {
    setAttrValues((prev) => {
      const next = { ...prev };
      for (const [code, attrRaw] of Object.entries(attrs)) {
        const attr = attrRaw as {
          value?: unknown;
          unit?: string | null;
          attributeDefinitionId?: string | null;
        };
        next[code] = {
          attributeDefinitionId: attr.attributeDefinitionId,
          value: attr.value,
          unit: attr.unit || next[code]?.unit,
          optionCode: typeof attr.value === "string" ? attr.value : undefined,
        };
      }
      return next;
    });
  };

  const onSubmit = async (values: ComponentFormValues) => {
    setServerError(null);

    // Validate required dynamic attributes
    for (const item of categoryAttributes) {
      if (item.isRequired) {
        const current = attrValues[item.attributeDefinition.code];
        const val = current?.value;
        const opt = current?.optionCode;
        const multi = current?.selectedOptionCodes;

        if (item.attributeDefinition.dataType === "MULTI_SELECT") {
          if (!multi || multi.length === 0) {
            setServerError(
              `Required specification missing: "${item.attributeDefinition.name}" requires at least one selection.`,
            );
            return;
          }
        } else if (item.attributeDefinition.dataType === "SELECT") {
          if (!opt || opt === "") {
            setServerError(
              `Required specification missing: "${item.attributeDefinition.name}" is required for this category.`,
            );
            return;
          }
        } else if (val === undefined || val === null || val === "") {
          setServerError(
            `Required specification missing: "${item.attributeDefinition.name}" is required for this category.`,
          );
          return;
        }
      }
    }

    try {
      if (isEditing && initialData) {
        const payload: UpdateComponentPayload = {
          manufacturerPartNumber: values.manufacturerPartNumber || null,
          name: values.name,
          description: values.description || null,
          categoryId: values.categoryId || null,
          manufacturerId: values.manufacturerId || null,
          unit: values.unit,
          defaultLocationId: values.defaultLocationId || null,
          attributes: attrValues,
        };
        const updated = await componentsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateComponentPayload = {
          ...(values.sku ? { sku: values.sku } : {}),
          name: values.name,
          manufacturerPartNumber: values.manufacturerPartNumber || null,
          description: values.description || null,
          categoryId: values.categoryId || null,
          manufacturerId: values.manufacturerId || null,
          unit: values.unit,
          defaultLocationId: values.defaultLocationId || null,
          attributes: attrValues,
        };
        const created = await componentsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing
            ? "Failed to update component"
            : "Failed to create component",
        );
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogShellBody className="space-y-4">
        {serverError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {serverError}
          </div>
        )}

        {/* ── AI Suggestion Review Card ────────────────────────────────────── */}
        {suggestion && (
          <AiSuggestionReviewCard
            suggestion={suggestion}
            creationContext={{
              sku: watch("sku"),
              manufacturerPartNumber: watch("manufacturerPartNumber"),
              name: watch("name"),
              description: watch("description") || datasheetInput,
              query: datasheetInput || watch("manufacturerPartNumber") || watch("name"),
            }}
            onApplyAll={handleApplyAllSuggestions}
            onApplyIdentity={() => {
              if (suggestion.manufacturerPartNumber) {
                setValue("manufacturerPartNumber", suggestion.manufacturerPartNumber, {
                  shouldDirty: true,
                });
              }
              handleApplyManufacturer();
            }}
            onApplyClassification={handleApplyCategory}
            onApplyNameDescription={() => {
              if (suggestion.suggestedName) {
                setValue("name", suggestion.suggestedName, { shouldDirty: true });
              }
              if (suggestion.suggestedDescription) {
                setValue("description", suggestion.suggestedDescription, {
                  shouldDirty: true,
                });
              }
            }}
            attributeConflicts={attributeConflicts}
            onApplyCategory={handleApplyCategory}
            onApplyManufacturer={handleApplyManufacturer}
            onApplyAttributes={handleApplyAttributes}
            onDismiss={() => setSuggestion(null)}
          />
        )}

        {/* ── AI Quick Actions Bar ─────────────────────────────────────────── */}
        {!suggestion && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              <span>Smart Component Intelligence</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDatasheetBox(!showDatasheetBox)}
                className="h-7 text-xs font-medium px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <FileText className="size-3" />
                {showDatasheetBox ? "Hide Datasheet Box" : "Paste Datasheet"}
                {showDatasheetBox ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingAi}
                onClick={() => handleFetchAiSuggestions()}
                className="h-7 text-xs font-medium px-2.5 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 bg-primary/5"
              >
                {loadingAi ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3 text-primary" />
                )}
                {loadingAi ? "Analyzing…" : "Auto-detect with AI"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Expandable Datasheet Text Box ─────────────────────────────────── */}
        {showDatasheetBox && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 shadow-2xs">
            <FieldLabel htmlFor="datasheet-input" className="text-xs">
              Raw Datasheet or Spec Text
            </FieldLabel>
            <Textarea
              id="datasheet-input"
              rows={3}
              placeholder="Paste component specs, e.g.: '0805 SMD Resistor 10k Ohm 1% 1/4W 50V Thin Film Yageo' or raw datasheet snippets..."
              value={datasheetInput}
              onChange={(e) => setDatasheetInput(e.target.value)}
              className="text-xs font-mono"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={loadingAi || !datasheetInput.trim()}
                onClick={() => handleFetchAiSuggestions(datasheetInput)}
                className="h-7 text-xs font-medium px-2.5 gap-1.5 bg-primary text-primary-foreground"
              >
                {loadingAi ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                Extract & Suggest
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* SKU */}
          <Field>
            <FieldLabel htmlFor="component-sku">
              Internal SKU
            </FieldLabel>
            <Input
              id="component-sku"
              type="text"
              placeholder={isEditing ? "CMP-000123" : "Assigned on save"}
              {...register("sku")}
              disabled={isEditing}
              className="font-mono"
            />
            {errors.sku?.message && (
              <FieldError>{errors.sku.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="component-mpn">Manufacturer Part Number</FieldLabel>
            <Input
              id="component-mpn"
              type="text"
              placeholder="e.g. RC0805FR-0727RL"
              {...register("manufacturerPartNumber")}
              className="font-mono"
            />
            <FieldDescription>Manufacturer identity, separate from Ananya's internal SKU.</FieldDescription>
          </Field>

          {/* Unit */}
          <Field>
            <FieldLabel htmlFor="component-unit">
              Default Unit <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="unit"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-unit"
                  entity="unit"
                  value={field.value}
                  onChange={(val) => field.onChange(val)}
                  creatable
                  clearable={false}
                />
              )}
            />
            {errors.unit?.message && (
              <FieldError>{errors.unit.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Name */}
        <Field>
          <FieldLabel htmlFor="component-name">
            Component Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="component-name"
            type="text"
            placeholder="e.g. 10k Ohm 0805 SMD Resistor"
            {...register("name")}
          />
          {errors.name?.message && (
            <FieldError>{errors.name.message}</FieldError>
          )}
        </Field>

        {/* Category and Manufacturer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <Field>
            <FieldLabel htmlFor="component-category">Category</FieldLabel>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-category"
                  entity="category"
                  value={field.value ?? ""}
                  onChange={(val) => field.onChange(val)}
                  placeholder="Select or search category..."
                  creatable
                  clearable
                />
              )}
            />
            {errors.categoryId?.message && (
              <FieldError>{errors.categoryId.message}</FieldError>
            )}
          </Field>

          {/* Manufacturer */}
          <Field>
            <FieldLabel htmlFor="component-manufacturer">
              Manufacturer
            </FieldLabel>
            <Controller
              name="manufacturerId"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-manufacturer"
                  entity="manufacturer"
                  value={field.value ?? ""}
                  onChange={(val) => field.onChange(val)}
                  placeholder="Select or search manufacturer..."
                  creatable
                  clearable
                />
              )}
            />
            {errors.manufacturerId?.message && (
              <FieldError>{errors.manufacturerId.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Dynamic Category Specifications Section */}
        {loadingAttrs && (
          <div className="py-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            Loading category specifications...
          </div>
        )}

        {categoryAttributes.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <div className="flex items-center gap-1.5">
                <Sliders className="size-3.5 text-primary" />
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Category Specifications
                </h4>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Dynamic technical parameters defined for this category and its hierarchy.
              </p>
            </div>

            <div className="space-y-4">
              {categoryAttributes.map((attr) => {
                const def = attr.attributeDefinition;
                const code = def.code;
                const current = attrValues[code] ?? {};
                const inputId = `attr-${code}`;

                // Render control based on data type
                if (def.dataType === "SELECT") {
                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <SearchableSelect
                        id={inputId}
                        value={current.optionCode ?? ""}
                        onValueChange={(val) =>
                          handleAttrChange(code, "optionCode", val)
                        }
                        placeholder={`Select ${def.name.toLowerCase()}...`}
                        searchPlaceholder={`Search ${def.name.toLowerCase()}...`}
                        triggerClassName="h-9"
                        clearable={!attr.isRequired}
                        options={attr.options.map((opt) => ({
                          value: opt.code,
                          label: opt.label,
                          chip: opt.code !== opt.label ? opt.code : undefined,
                        }))}
                      />
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "MULTI_SELECT") {
                  const selected = current.selectedOptionCodes || [];
                  return (
                    <Field key={code} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor={inputId}>
                          {def.name}{" "}
                          {attr.isRequired && (
                            <span className="text-destructive">*</span>
                          )}
                        </FieldLabel>
                        {selected.length > 0 && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {selected.length} selected
                          </span>
                        )}
                      </div>
                      {attr.options && attr.options.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {attr.options.map((opt) => {
                            const isChecked = selected.includes(opt.code);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  toggleMultiSelectOption(code, opt.code)
                                }
                                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer ${isChecked
                                    ? "bg-primary text-primary-foreground border-primary font-medium shadow-xs"
                                    : "bg-muted/40 hover:bg-muted text-foreground border-border hover:border-border/80"
                                  }`}
                              >
                                {isChecked ? (
                                  <Check className="w-3 h-3 shrink-0" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                )}
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No options configured for this specification.
                        </p>
                      )}
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "BOOLEAN") {
                  return (
                    <Field
                      key={code}
                      className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
                    >
                      <div className="space-y-0.5">
                        <FieldLabel htmlFor={inputId}>
                          {def.name}{" "}
                          {attr.isRequired && (
                            <span className="text-destructive">*</span>
                          )}
                        </FieldLabel>
                        {def.description && (
                          <FieldDescription>{def.description}</FieldDescription>
                        )}
                      </div>
                      <Switch
                        id={inputId}
                        checked={Boolean(current.value)}
                        onCheckedChange={(checked) =>
                          handleAttrChange(code, "value", checked)
                        }
                      />
                    </Field>
                  );
                }

                if (def.dataType === "QUANTITY") {
                  const unitOptions =
                    (def.unitCategory && COMPATIBLE_UNITS[def.unitCategory]) ||
                    (def.defaultUnit ? [def.defaultUnit] : ["pcs"]);

                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <div className="flex w-full gap-2">
                        <Input
                          id={inputId}
                          type="number"
                          step="any"
                          placeholder="e.g. 10"
                          value={(current.value as string | number) ?? ""}
                          onChange={(e) =>
                            handleAttrChange(code, "value", e.target.value)
                          }
                          className="flex-1 min-w-0 font-mono"
                        />
                        <div className="w-24 shrink-0">
                          <Select
                            value={current.unit || def.defaultUnit || unitOptions[0] || ""}
                            onValueChange={(val) =>
                              handleAttrChange(code, "unit", val)
                            }
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {unitOptions.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "NUMBER" || def.dataType === "INTEGER") {
                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <Input
                        id={inputId}
                        type="number"
                        step={def.dataType === "INTEGER" ? "1" : "any"}
                        placeholder="e.g. 64"
                        value={(current.value as string | number) ?? ""}
                        onChange={(e) =>
                          handleAttrChange(code, "value", e.target.value)
                        }
                        className="font-mono"
                      />
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                if (def.dataType === "DATE") {
                  return (
                    <Field key={code}>
                      <FieldLabel htmlFor={inputId}>
                        {def.name}{" "}
                        {attr.isRequired && (
                          <span className="text-destructive">*</span>
                        )}
                      </FieldLabel>
                      <Input
                        id={inputId}
                        type="date"
                        value={(current.value as string | number) ?? ""}
                        onChange={(e) =>
                          handleAttrChange(code, "value", e.target.value)
                        }
                      />
                      {def.description && (
                        <FieldDescription>{def.description}</FieldDescription>
                      )}
                    </Field>
                  );
                }

                // Default: TEXT
                return (
                  <Field key={code}>
                    <FieldLabel htmlFor={inputId}>
                      {def.name}{" "}
                      {attr.isRequired && (
                        <span className="text-destructive">*</span>
                      )}
                    </FieldLabel>
                    <Input
                      id={inputId}
                      type="text"
                      placeholder={`Enter ${def.name.toLowerCase()}...`}
                      value={(current.value as string | number) ?? ""}
                      onChange={(e) =>
                        handleAttrChange(code, "value", e.target.value)
                      }
                    />
                    {def.description && (
                      <FieldDescription>{def.description}</FieldDescription>
                    )}
                  </Field>
                );
              })}
            </div>
          </div>
        )}

        {/* Default Location */}
        <Field>
          <FieldLabel htmlFor="component-location">
            Default Storage Location
          </FieldLabel>
          <Controller
            name="defaultLocationId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="component-location"
                entity="location"
                value={field.value ?? ""}
                onChange={(val) => field.onChange(val)}
                placeholder="Select storage location..."
                creatable
                clearable
              />
            )}
          />
        </Field>

        {/* Description */}
        <Field>
          <FieldLabel htmlFor="component-desc">Description</FieldLabel>
          <Textarea
            id="component-desc"
            rows={3}
            placeholder="Detailed component specification..."
            {...register("description")}
            className="resize-none"
          />
        </Field>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Component"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
