"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  attributesApi,
  type AttributeDefinitionDto,
  type CreateAttributeDefinitionPayload,
  type UpdateAttributeDefinitionPayload,
} from "@/lib/api/attributes-api";
import { unitsApi, type UnitDto } from "@/lib/api/units-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";

const attributeSchema = z.object({
  code: z
    .string()
    .min(1, "Code is required")
    .regex(/^[a-zA-Z0-9_-]+$/, "Code must be alphanumeric with underscores or dashes"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  dataType: z.enum([
    "TEXT",
    "NUMBER",
    "INTEGER",
    "BOOLEAN",
    "SELECT",
    "MULTI_SELECT",
    "QUANTITY",
    "DATE",
  ]),
  unitCategory: z.string().optional().nullable(),
  defaultUnit: z.string().optional().nullable(),
  isFilterable: z.boolean(),
  isActive: z.boolean(),
  initialOptions: z.string().optional(),
});

type AttributeFormValues = z.infer<typeof attributeSchema>;

interface AttributeFormDialogProps {
  isOpen: boolean;
  initialData?: AttributeDefinitionDto | null;
  onSuccess: (attribute: AttributeDefinitionDto) => void;
  onCancel: () => void;
}

export function AttributeFormDialog({
  isOpen,
  initialData,
  onSuccess,
  onCancel,
}: AttributeFormDialogProps) {
  const [units, setUnits] = React.useState<UnitDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<string[]>([]);
  const [bindAsRequired, setBindAsRequired] = React.useState<boolean>(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  // Fetch units for quantity selection and categories for initial binding
  React.useEffect(() => {
    if (isOpen) {
      unitsApi
        .getAll()
        .then((all) => setUnits(all.filter((u) => u.isActive)))
        .catch(() => { });
      categoriesApi
        .getAll()
        .then((all) => setCategories(all.filter((c) => c.isActive)))
        .catch(() => { });
      setSelectedCategoryIds([]);
      setBindAsRequired(false);
    }
  }, [isOpen]);

  // Derive distinct unit categories
  const unitCategories = React.useMemo(() => {
    const set = new Set<string>();
    units.forEach((u) => {
      if (u.category) set.add(u.category);
    });
    return Array.from(set).sort();
  }, [units]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AttributeFormValues>({
    resolver: zodResolver(attributeSchema),
    defaultValues: {
      code: initialData?.code ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      dataType: initialData?.dataType ?? "TEXT",
      unitCategory: initialData?.unitCategory ?? "",
      defaultUnit: initialData?.defaultUnit ?? "",
      isFilterable: initialData?.isFilterable ?? false,
      isActive: initialData?.isActive ?? true,
      initialOptions: "",
    },
  });

  // Reset form values when initialData or isOpen changes
  React.useEffect(() => {
    if (isOpen) {
      reset({
        code: initialData?.code ?? "",
        name: initialData?.name ?? "",
        description: initialData?.description ?? "",
        dataType: initialData?.dataType ?? "TEXT",
        unitCategory: initialData?.unitCategory ?? "",
        defaultUnit: initialData?.defaultUnit ?? "",
        isFilterable: initialData?.isFilterable ?? false,
        isActive: initialData?.isActive ?? true,
        initialOptions: "",
      });
      setServerError(null);
    }
  }, [isOpen, initialData, reset]);

  const selectedDataType = watch("dataType");
  const selectedUnitCategory = watch("unitCategory");

  // Filter available units for selected category
  const availableUnitsForCategory = React.useMemo(() => {
    if (!selectedUnitCategory) return units;
    return units.filter((u) => u.category === selectedUnitCategory);
  }, [units, selectedUnitCategory]);

  const onSubmit = async (values: AttributeFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        const payload: UpdateAttributeDefinitionPayload = {
          name: values.name,
          description: values.description || undefined,
          isFilterable: values.isFilterable,
          isActive: values.isActive,
          unitCategory: values.unitCategory || undefined,
          defaultUnit: values.defaultUnit || undefined,
        };
        const updated = await attributesApi.updateDefinition(
          initialData.id,
          payload,
        );
        onSuccess(updated);
      } else {
        const options =
          (values.dataType === "SELECT" || values.dataType === "MULTI_SELECT") &&
            values.initialOptions
            ? values.initialOptions
              .split(",")
              .map((o) => o.trim())
              .filter((o) => o.length > 0)
              .map((opt, idx) => ({
                code: opt.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                label: opt,
                sortOrder: idx,
              }))
            : undefined;

        const categoryBindings =
          selectedCategoryIds.length > 0
            ? selectedCategoryIds.map((catId, idx) => ({
              categoryId: catId,
              isRequired: bindAsRequired,
              sortOrder: (idx + 1) * 10,
            }))
            : undefined;

        const payload: CreateAttributeDefinitionPayload = {
          code: values.code,
          name: values.name,
          description: values.description || undefined,
          dataType: values.dataType,
          unitCategory: values.unitCategory || undefined,
          defaultUnit: values.defaultUnit || undefined,
          isFilterable: values.isFilterable,
          options,
          categoryBindings,
        };
        const created = await attributesApi.createDefinition(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing
            ? "Failed to update attribute definition"
            : "Failed to create attribute definition",
        );
      }
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={isEditing ? "Edit Attribute Definition" : "New Attribute Definition"}
      description={
        isEditing
          ? "Modify metadata, unit configuration, and active state for this specification."
          : "Define a reusable dynamic specification for products, materials, or components."
      }
      size="sm"
      closeDisabled={isSubmitting}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <DialogShellBody className="space-y-4">
          {serverError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Name */}
          <Field>
            <FieldLabel htmlFor="attr-name">
              Attribute Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="attr-name"
              type="text"
              placeholder="e.g. Resistance, Package, Forward Voltage"
              {...register("name")}
            />
            {errors.name?.message && (
              <FieldError>{errors.name.message}</FieldError>
            )}
          </Field>

          {/* Code */}
          <Field>
            <FieldLabel htmlFor="attr-code">
              Attribute Code <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="attr-code"
              type="text"
              placeholder="e.g. resistance, package, forward_voltage"
              disabled={isEditing}
              className={isEditing ? "bg-muted font-mono" : "font-mono"}
              {...register("code")}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {isEditing
                ? "Code cannot be changed once created to protect database consistency."
                : "Unique identifier used in formulas, APIs, and search filters."}
            </p>
            {errors.code?.message && (
              <FieldError>{errors.code.message}</FieldError>
            )}
          </Field>

          {/* Data Type */}
          <Field>
            <FieldLabel htmlFor="attr-data-type">
              Data Type <span className="text-destructive">*</span>
            </FieldLabel>
            {isEditing ? (
              <Input
                id="attr-data-type"
                value={initialData?.dataType}
                disabled
                className="bg-muted font-mono"
              />
            ) : (
              <Controller
                name="dataType"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(val) => field.onChange(val)}
                  >
                    <SelectTrigger id="attr-data-type">
                      <SelectValue placeholder="Select attribute data type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">TEXT</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Freeform String
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="NUMBER">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">NUMBER</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Decimal Value
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="INTEGER">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">INTEGER</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Whole Number
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="BOOLEAN">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">BOOLEAN</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Yes / No Flag
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="QUANTITY">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">QUANTITY</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Value with Physical Unit
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="SELECT">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">SELECT</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Single Choice Dropdown
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="MULTI_SELECT">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">MULTI_SELECT</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Multiple Choice
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="DATE">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">DATE</span>
                          <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 text-[10px] text-muted-foreground leading-none">
                            Calendar Date
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            {isEditing && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Data type cannot be changed after creation to safeguard existing values.
              </p>
            )}
          </Field>

          {/* Unit Settings for QUANTITY */}
          {(selectedDataType === "QUANTITY" ||
            initialData?.dataType === "QUANTITY") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/40 border border-border rounded-xl">
                <Field>
                  <FieldLabel htmlFor="attr-unit-cat">Unit Category</FieldLabel>
                  <Controller
                    name="unitCategory"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || "none"}
                        onValueChange={(val) =>
                          field.onChange(val === "none" ? "" : val)
                        }
                      >
                        <SelectTrigger id="attr-unit-cat">
                          <SelectValue placeholder="Select unit category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / Any Category</SelectItem>
                          {unitCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="attr-default-unit">Default Unit</FieldLabel>
                  <Controller
                    name="defaultUnit"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || "none"}
                        onValueChange={(val) =>
                          field.onChange(val === "none" ? "" : val)
                        }
                      >
                        <SelectTrigger id="attr-default-unit">
                          <SelectValue placeholder="Select default unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No default</SelectItem>
                          {availableUnitsForCategory.map((u) => (
                            <SelectItem key={u.name} value={u.name}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{u.name}</span>
                                {u.category && (
                                  <span className="inline-flex items-center justify-center h-4.5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] text-muted-foreground leading-none">
                                    {u.category}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
            )}

          {/* Initial options for SELECT / MULTI_SELECT on Create */}
          {!isEditing &&
            (selectedDataType === "SELECT" ||
              selectedDataType === "MULTI_SELECT") && (
              <Field>
                <FieldLabel htmlFor="attr-initial-options">
                  Initial Options (Comma Separated)
                </FieldLabel>
                <Input
                  id="attr-initial-options"
                  placeholder="e.g. 0402, 0603, 0805, 1206, 2512"
                  {...register("initialOptions")}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  You can add, edit, or reorder options anytime after creation.
                </p>
              </Field>
            )}

          {/* Description */}
          <Field>
            <FieldLabel htmlFor="attr-description">Description</FieldLabel>
            <Textarea
              id="attr-description"
              placeholder="e.g. Mechanical outline footprint according to EIA standard"
              rows={2}
              {...register("description")}
            />
          </Field>

          {/* Category Binding on Creation (Optional) */}
          {!isEditing && categories.length > 0 && (
            <div className="space-y-2">
              <Field>
                <FieldLabel
                  htmlFor="attr-category-select"
                  className="flex items-center justify-between"
                >
                  <span>
                    Category Bindings{" "}
                    <span className="text-muted-foreground font-normal">
                      (Optional)
                    </span>
                  </span>
                  {selectedCategoryIds.length > 0 && (
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {selectedCategoryIds.length} selected
                    </span>
                  )}
                </FieldLabel>
                <SearchableSelect
                  id="attr-category-select"
                  placeholder="Select categories to assign..."
                  searchPlaceholder="Search categories..."
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                    chip: c.code,
                    disabled: selectedCategoryIds.includes(c.id),
                  }))}
                  onValueChange={(catId) => {
                    if (catId && !selectedCategoryIds.includes(catId)) {
                      setSelectedCategoryIds((prev) => [...prev, catId]);
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Components in selected categories will automatically inherit this specification.
                </p>
              </Field>

              {selectedCategoryIds.length > 0 && (
                <div className="p-3 bg-muted/20 border border-border/70 rounded-lg space-y-2.5">
                  <div className="flex flex-wrap gap-2">
                    {selectedCategoryIds.map((id) => {
                      const cat = categories.find((c) => c.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center h-8 gap-2 text-xs bg-background border border-border pl-2.5 pr-1.5 rounded-md text-foreground font-medium shadow-2xs leading-none"
                        >
                          <span className="leading-none">{cat?.name || id}</span>
                          {cat?.code && (
                            <span className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-muted border border-border/70 font-mono text-[10px] font-normal text-muted-foreground leading-none">
                              {cat.code}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedCategoryIds((prev) =>
                                prev.filter((i) => i !== id),
                              )
                            }
                            className="inline-flex items-center justify-center size-5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                            title="Remove category"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                    <div className="space-y-0.5">
                      <span className="font-medium text-foreground block">
                        Mandatory Specification
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        Require values on components in these categories
                      </span>
                    </div>
                    <Switch
                      checked={bindAsRequired}
                      onCheckedChange={setBindAsRequired}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Switches for Filterable & Active */}
          <div className="pt-2 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Faceted Filterable
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Enable in catalog filters
                </p>
              </div>
              <Controller
                name="isFilterable"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Active Status
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Available for new assignments
                </p>
              </div>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton disabled={isSubmitting}>
            Cancel
          </DialogShellCancelButton>
          <Button type="submit" disabled={isSubmitting} size="sm">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Saving...
              </>
            ) : isEditing ? (
              "Save Changes"
            ) : (
              "Create Attribute"
            )}
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
