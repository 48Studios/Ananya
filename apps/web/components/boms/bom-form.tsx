"use client";

import * as React from "react";
import {
  useForm,
  useFieldArray,
  SubmitHandler,
  Controller,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  bomsApi,
  type BillOfMaterialsDto,
  type CreateBomPayload,
  type UpdateBomPayload,
} from "@/lib/api/boms-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

const bomLineSchema = z.object({
  componentId: z.string().min(1, "Component selection is required"),
  quantityPerUnit: z.number().min(0.0001, "Quantity must be greater than zero"),
  unitOfMeasure: z.string().min(1, "Unit is required"),
  scrapFactorPercent: z.number().min(0, "Scrap % must be non-negative"),
  notes: z.string().optional().nullable(),
});

const bomSchema = z
  .object({
    componentId: z
      .string()
      .min(1, "Finished product component selection is required"),
    revision: z
      .string()
      .min(1, "Revision string is required")
      .transform((val) => val.trim()),
    notes: z.string().optional().nullable(),
    lines: z
      .array(bomLineSchema)
      .min(1, "At least one component line item is required"),
  })
  .refine(
    (data) => {
      // Finished product cannot be present inside its own BOM line items
      return !data.lines.some((line) => line.componentId === data.componentId);
    },
    {
      message:
        "Finished product component cannot be listed as a sub-component in its own BOM.",
      path: ["lines"],
    },
  );

export type BomFormValues = z.infer<typeof bomSchema>;

interface BomFormProps {
  initialData?: BillOfMaterialsDto | null;
  onSuccess: (savedBom: BillOfMaterialsDto) => void;
  onCancel: () => void;
}

export function BomForm({ initialData, onSuccess, onCancel }: BomFormProps) {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEdit = Boolean(initialData);

  React.useEffect(() => {
    componentsApi
      .getAll()
      .then(setComponents)
      .catch(() => {
        // Non-blocking load error
      });
  }, []);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BomFormValues>({
    resolver: zodResolver(bomSchema),
    defaultValues: {
      componentId: initialData?.componentId ?? "",
      revision: initialData?.revision ?? "v1.0",
      notes: initialData?.notes ?? "",
      lines: initialData?.lines
        ? initialData.lines.map((l) => ({
            componentId: l.componentId,
            quantityPerUnit: l.quantityPerUnit,
            unitOfMeasure: l.unitOfMeasure,
            scrapFactorPercent: l.scrapFactorPercent,
            notes: l.notes ?? "",
          }))
        : [
            {
              componentId: "",
              quantityPerUnit: 1,
              unitOfMeasure: "pcs",
              scrapFactorPercent: 0,
              notes: "",
            },
          ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const selectedFinishedProductId = watch("componentId");

  const handleLineComponentChange = (index: number, componentId: string) => {
    setValue(`lines.${index}.componentId`, componentId);
    const selectedComp = components.find((c) => c.id === componentId);
    if (selectedComp) {
      setValue(`lines.${index}.unitOfMeasure`, selectedComp.unit);
    }
  };

  const onSubmit: SubmitHandler<BomFormValues> = async (values) => {
    setServerError(null);
    try {
      if (isEdit && initialData) {
        const payload: UpdateBomPayload = {
          notes: values.notes || null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            quantityPerUnit: l.quantityPerUnit,
            unitOfMeasure: l.unitOfMeasure,
            scrapFactorPercent: l.scrapFactorPercent,
            notes: l.notes || null,
          })),
        };
        const updated = await bomsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateBomPayload = {
          componentId: values.componentId,
          revision: values.revision,
          notes: values.notes || null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            quantityPerUnit: l.quantityPerUnit,
            unitOfMeasure: l.unitOfMeasure,
            scrapFactorPercent: l.scrapFactorPercent,
            notes: l.notes || null,
          })),
        };
        const created = await bomsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEdit ? "Failed to update BOM" : "Failed to create BOM",
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
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Product & Revision */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="bom-product">
              Finished Product Component{" "}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="componentId"
              control={control}
              render={({ field }) => (
                <Select
                  disabled={isEdit}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="bom-product">
                    <SelectValue placeholder="Select finished product component..." />
                  </SelectTrigger>
                  <SelectContent>
                    {components.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.sku} — {c.name} ({c.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.componentId?.message && (
              <FieldError>{errors.componentId.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="bom-revision">
              Revision <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="bom-revision"
              type="text"
              placeholder="e.g. v1.0"
              disabled={isEdit}
              {...register("revision")}
              className="font-mono"
            />
            {errors.revision?.message && (
              <FieldError>{errors.revision.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Notes */}
        <Field>
          <FieldLabel htmlFor="bom-notes">
            BOM Notes / Specification Details
          </FieldLabel>
          <Input
            id="bom-notes"
            type="text"
            placeholder="e.g. Standard production assembly BOM for batch batch-v1"
            {...register("notes")}
          />
        </Field>

        {/* Dynamic Line Items Section */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Required Component Line Items{" "}
              <span className="text-destructive">*</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  componentId: "",
                  quantityPerUnit: 1,
                  unitOfMeasure: "pcs",
                  scrapFactorPercent: 0,
                  notes: "",
                })
              }
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Component
            </Button>
          </div>

          {errors.lines && typeof errors.lines.message === "string" && (
            <div className="p-2.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
              {errors.lines.message}
            </div>
          )}

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-3 bg-muted/30 border border-border rounded-lg space-y-2 relative"
              >
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Component Select */}
                <div className="space-y-1 pr-6">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Component Item
                  </label>
                  <Controller
                    name={`lines.${index}.componentId`}
                    control={control}
                    render={({ field: lineCompField }) => (
                      <Select
                        value={lineCompField.value}
                        onValueChange={(val) => {
                          lineCompField.onChange(val ?? "");
                          handleLineComponentChange(index, val ?? "");
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select component..." />
                        </SelectTrigger>
                        <SelectContent>
                          {components
                            .filter((c) => c.id !== selectedFinishedProductId)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.sku} — {c.name} ({c.unit})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* Quantities, Unit, Scrap % */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Qty / Finished Unit
                    </label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      {...register(`lines.${index}.quantityPerUnit`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Unit of Measure
                    </label>
                    <Input
                      type="text"
                      {...register(`lines.${index}.unitOfMeasure`)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Scrap Factor %
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      {...register(`lines.${index}.scrapFactorPercent`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Line Notes */}
                <div className="pt-1">
                  <Input
                    type="text"
                    placeholder="Line note (e.g. Apply thermal paste prior to assembly)"
                    {...register(`lines.${index}.notes`)}
                    className="h-7 text-[11px]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          {isEdit ? "Save Changes" : "Create Bill of Materials"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
