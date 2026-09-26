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
import { Loader2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  warehouseTransfersApi,
  type WarehouseTransferDto,
  type CreateWarehouseTransferPayload,
  type UpdateWarehouseTransferPayload,
} from "@/lib/api/warehouse-transfers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";

const lineSchema = z.object({
  componentId: z.string().min(1, "Component item is required"),
  quantity: z.number().min(0.0001, "Quantity must be greater than zero"),
  unitOfMeasure: z.string().optional(),
  notes: z.string().optional(),
});

const transferSchema = z
  .object({
    sourceLocationId: z.string().min(1, "Source location is required"),
    destinationLocationId: z
      .string()
      .min(1, "Destination location is required"),
    requestedDate: z.string().optional(),
    notes: z.string().optional(),
    lines: z.array(lineSchema).min(1, "At least one line item is required"),
  })
  .refine((data) => data.sourceLocationId !== data.destinationLocationId, {
    message: "Source and destination locations cannot be identical",
    path: ["destinationLocationId"],
  });

export type WarehouseTransferFormValues = z.infer<typeof transferSchema>;

interface WarehouseTransferFormProps {
  initialData?: WarehouseTransferDto | null;
  onSuccess: (savedTransfer: WarehouseTransferDto) => void;
  onCancel: () => void;
}

export function WarehouseTransferForm({
  initialData,
  onSuccess,
  onCancel,
}: WarehouseTransferFormProps) {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loadingRef, setLoadingRef] = React.useState(true);

  // Source location inventory projections (Req 1, 2)
  const [sourceProjections, setSourceProjections] = React.useState<
    Record<string, InventoryProjectionDto>
  >({});
  const [loadingSourceProjections, setLoadingSourceProjections] =
    React.useState(false);

  const isEdit = Boolean(initialData);

  React.useEffect(() => {
    Promise.all([componentsApi.getAll(), locationsApi.getAll()])
      .then(([comps, locs]) => {
        setComponents(comps);
        setLocations(locs);
      })
      .catch((err) => {
        setServerError(
          err instanceof Error
            ? err.message
            : "Failed to load reference catalogs",
        );
      })
      .finally(() => setLoadingRef(false));
  }, []);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseTransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: initialData
      ? {
          sourceLocationId: initialData.sourceLocationId,
          destinationLocationId: initialData.destinationLocationId,
          requestedDate: initialData.requestedDate
            ? initialData.requestedDate.split("T")[0]
            : "",
          notes: initialData.notes || "",
          lines:
            initialData.lines.length > 0
              ? initialData.lines.map((l) => ({
                  componentId: l.componentId,
                  quantity: l.quantity,
                  unitOfMeasure: l.unitOfMeasure || "pcs",
                  notes: l.notes || "",
                }))
              : [
                  {
                    componentId: "",
                    quantity: 1,
                    unitOfMeasure: "pcs",
                    notes: "",
                  },
                ],
        }
      : {
          sourceLocationId: "",
          destinationLocationId: "",
          requestedDate: new Date().toISOString().split("T")[0],
          notes: "",
          lines: [
            { componentId: "", quantity: 1, unitOfMeasure: "pcs", notes: "" },
          ],
        },
  });

  const sourceLocationId = watch("sourceLocationId");
  const destinationLocationId = watch("destinationLocationId");
  const watchedLines = watch("lines");

  // Fetch components available at source location whenever source location changes (Req 1)
  React.useEffect(() => {
    if (!sourceLocationId) {
      setSourceProjections({});
      return;
    }
    let isCurrent = true;
    setLoadingSourceProjections(true);
    inventoryProjectionsApi
      .getByLocation(sourceLocationId)
      .then((projections) => {
        if (!isCurrent) return;
        const map: Record<string, InventoryProjectionDto> = {};
        for (const p of projections || []) {
          if (p.quantity > 0) {
            map[p.componentId] = p;
          }
        }
        setSourceProjections(map);

        // Clear any line item whose component does not exist in the selected location
        const currentLines = control._formValues.lines || [];
        currentLines.forEach((l: { componentId?: string }, idx: number) => {
          if (l.componentId && !map[l.componentId]) {
            setValue(`lines.${idx}.componentId`, "", { shouldValidate: true });
            setValue(`lines.${idx}.quantity`, 1);
          }
        });
      })
      .catch((err) => {
        console.error("Failed to load source location inventory:", err);
        if (isCurrent) setSourceProjections({});
      })
      .finally(() => {
        if (isCurrent) setLoadingSourceProjections(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [sourceLocationId, setValue, control]);

  // Clear destination if it matches the selected source location (Req 3)
  React.useEffect(() => {
    if (sourceLocationId && destinationLocationId === sourceLocationId) {
      setValue("destinationLocationId", "", { shouldValidate: true });
    }
  }, [sourceLocationId, destinationLocationId, setValue]);

  // Destination options: omit the source location (Req 3)
  const destinationLocationOptions = React.useMemo(() => {
    return locations
      .filter((loc) => loc.id !== sourceLocationId)
      .map((loc) => ({
        value: loc.id,
        label: loc.name,
        chip: loc.code,
        sublabel: loc.kind ? `Type: ${loc.kind}` : undefined,
      }));
  }, [locations, sourceLocationId]);

  // Components dropdown options: only show components with stock at the source location (Req 1)
  const availableComponents = React.useMemo(() => {
    if (!sourceLocationId) return [];
    return components.filter((c) => Boolean(sourceProjections[c.id]));
  }, [components, sourceLocationId, sourceProjections]);

  const componentOptions = React.useMemo(() => {
    return availableComponents.map((c) => {
      const proj = sourceProjections[c.id];
      return {
        value: c.id,
        label: c.name,
        chip: c.sku,
        sublabel: proj
          ? `Available at location: ${proj.quantity} ${proj.unitOfMeasure || c.unit || "pcs"}`
          : undefined,
      };
    });
  }, [availableComponents, sourceProjections]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const handleComponentChange = (idx: number, compId: string) => {
    setValue(`lines.${idx}.componentId`, compId, { shouldValidate: true });
    const comp = components.find((c) => c.id === compId);
    const proj = sourceProjections[compId];
    if (comp || proj) {
      setValue(
        `lines.${idx}.unitOfMeasure`,
        proj?.unitOfMeasure || comp?.unit || "pcs",
      );
    }
    const maxAvailable = proj ? proj.quantity : 1;
    const currentQty = control._formValues.lines?.[idx]?.quantity;
    if (currentQty && currentQty > maxAvailable) {
      setValue(`lines.${idx}.quantity`, maxAvailable, { shouldValidate: true });
    } else if (!currentQty || currentQty <= 0) {
      setValue(`lines.${idx}.quantity`, Math.min(1, maxAvailable), {
        shouldValidate: true,
      });
    }
  };

  const onSubmit: SubmitHandler<WarehouseTransferFormValues> = async (
    values,
  ) => {
    setServerError(null);

    // Validate quantities against available stock (Req 2)
    for (let i = 0; i < values.lines.length; i++) {
      const l = values.lines[i];
      if (!l) continue;
      const proj = sourceProjections[l.componentId];
      if (proj && l.quantity > proj.quantity) {
        setServerError(
          `Line #${i + 1}: Quantity (${l.quantity}) exceeds available stock (${proj.quantity} ${proj.unitOfMeasure || "pcs"}) at source location.`,
        );
        return;
      }
    }
    try {
      if (isEdit && initialData) {
        const payload: UpdateWarehouseTransferPayload = {
          sourceLocationId: values.sourceLocationId,
          destinationLocationId: values.destinationLocationId,
          requestedDate: values.requestedDate || undefined,
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            quantity: Number(l.quantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        };
        const updated = await warehouseTransfersApi.update(
          initialData.id,
          payload,
        );
        onSuccess(updated);
      } else {
        const payload: CreateWarehouseTransferPayload = {
          sourceLocationId: values.sourceLocationId,
          destinationLocationId: values.destinationLocationId,
          requestedDate: values.requestedDate || undefined,
          requestedBy: "OPERATOR",
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            quantity: Number(l.quantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        };
        const created = await warehouseTransfersApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to submit Warehouse Transfer");
      }
    }
  };

  if (loadingRef) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Loading components and location catalogs...
      </div>
    );
  }

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

        {/* Source & Destination Locations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="transfer-source-loc">
              Source Location <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="sourceLocationId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="transfer-source-loc"
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Select dispatch location..."
                  searchPlaceholder="Search locations..."
                  options={locations.map((loc) => ({
                    value: loc.id,
                    label: loc.name,
                    chip: loc.code,
                  }))}
                />
              )}
            />
            {errors.sourceLocationId?.message && (
              <FieldError>{errors.sourceLocationId.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="transfer-dest-loc">
              Destination Location <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="destinationLocationId"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="transfer-dest-loc"
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={
                    !sourceLocationId
                      ? "Select source location first..."
                      : "Select receiving location..."
                  }
                  searchPlaceholder="Search locations..."
                  emptyText={
                    !sourceLocationId
                      ? "Please select a source location first."
                      : destinationLocationOptions.length === 0
                        ? "No other locations available."
                        : "No matching locations found."
                  }
                  options={destinationLocationOptions}
                  disabled={!sourceLocationId}
                />
              )}
            />
            {errors.destinationLocationId?.message && (
              <FieldError>{errors.destinationLocationId.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Date & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="transfer-date">Requested Date</FieldLabel>
            <Input
              id="transfer-date"
              type="date"
              {...register("requestedDate")}
              className="font-mono"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="transfer-notes">
              Transfer Notes / Purpose
            </FieldLabel>
            <Input
              id="transfer-notes"
              type="text"
              placeholder="e.g. Replenish main assembly floor stock"
              {...register("notes")}
            />
          </Field>
        </div>

        {/* Component Line Items Section */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Transfer Component Items ({fields.length})
            </h3>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={
                !sourceLocationId ||
                loadingSourceProjections ||
                availableComponents.length === 0
              }
              onClick={() =>
                append({
                  componentId: "",
                  quantity: 1,
                  unitOfMeasure: "pcs",
                  notes: "",
                })
              }
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Line Item
            </Button>
          </div>

          {errors.lines?.root && (
            <p className="text-xs text-destructive">
              {errors.lines.root.message}
            </p>
          )}

          {!sourceLocationId ? (
            <div className="p-3 bg-muted/20 border border-dashed border-border rounded-lg text-center text-xs text-muted-foreground">
              Please select a source location above to view and transfer available stock.
            </div>
          ) : loadingSourceProjections ? (
            <div className="p-3 bg-muted/20 border border-dashed border-border rounded-lg text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Loading stock at selected source location...
            </div>
          ) : availableComponents.length === 0 ? (
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-center text-xs text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              No components with available inventory were found at this source location.
            </div>
          ) : null}

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {fields.map((field, idx) => {
              const currentCompId = watchedLines?.[idx]?.componentId;
              const currentProj = currentCompId
                ? sourceProjections[currentCompId]
                : null;
              const maxAvailable = currentProj ? currentProj.quantity : null;

              return (
                <div
                  key={field.id}
                  className="p-3 bg-muted/20 border border-border rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-2 items-start"
                >
                  <div className="sm:col-span-6 space-y-1">
                    <div className="h-4 flex items-center">
                      <label className="text-[11px] font-medium text-muted-foreground truncate">
                        Item #{idx + 1} Component{" "}
                        <span className="text-destructive">*</span>
                      </label>
                    </div>
                    <Controller
                      name={`lines.${idx}.componentId` as const}
                      control={control}
                      render={({ field: compField }) => (
                        <SearchableSelect
                          value={compField.value}
                          onValueChange={(val) => {
                            compField.onChange(val ?? "");
                            handleComponentChange(idx, val ?? "");
                          }}
                          disabled={
                            !sourceLocationId ||
                            loadingSourceProjections ||
                            availableComponents.length === 0
                          }
                          placeholder={
                            !sourceLocationId
                              ? "Select source location first..."
                              : loadingSourceProjections
                                ? "Loading stock..."
                                : availableComponents.length === 0
                                  ? "No components in stock"
                                  : "Select component..."
                          }
                          searchPlaceholder="Search components in source stock..."
                          emptyText={
                            !sourceLocationId
                              ? "Select source location first."
                              : loadingSourceProjections
                                ? "Loading stock..."
                                : "No components with stock available."
                          }
                          triggerClassName="h-8 text-xs"
                          options={componentOptions}
                        />
                      )}
                    />
                    {errors.lines?.[idx]?.componentId?.message && (
                      <p className="text-[11px] text-destructive leading-tight">
                        {errors.lines[idx]?.componentId?.message}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <div className="h-4 flex items-center">
                      <label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                        Quantity <span className="text-destructive">*</span>
                      </label>
                    </div>
                    <Input
                      type="number"
                      step="any"
                      min={0.0001}
                      max={maxAvailable !== null ? maxAvailable : undefined}
                      disabled={!currentCompId}
                      {...register(`lines.${idx}.quantity` as const, {
                        valueAsNumber: true,
                        min: {
                          value: 0.0001,
                          message: "Quantity must be greater than 0",
                        },
                        validate: (val) => {
                          if (maxAvailable !== null && val > maxAvailable) {
                            return `Max available is ${maxAvailable}`;
                          }
                          return true;
                        },
                      })}
                      className="h-8 text-xs font-mono font-bold"
                    />
                    {errors.lines?.[idx]?.quantity?.message ? (
                      <p className="text-[11px] text-destructive leading-tight">
                        {errors.lines[idx]?.quantity?.message}
                      </p>
                    ) : currentCompId && maxAvailable !== null ? (
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground leading-none pt-0.5">
                        <span className="whitespace-nowrap">
                          Max:{" "}
                          <strong className="font-mono text-foreground font-semibold">
                            {maxAvailable}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setValue(`lines.${idx}.quantity`, maxAvailable, {
                              shouldValidate: true,
                            })
                          }
                          className="text-primary hover:underline font-medium cursor-pointer ml-1 whitespace-nowrap"
                        >
                          Fill Max
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <div className="h-4 flex items-center">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Unit
                      </label>
                    </div>
                    <Input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      {...register(`lines.${idx}.unitOfMeasure` as const)}
                      className="h-8 text-xs font-mono bg-muted/50 text-muted-foreground cursor-not-allowed"
                    />
                  </div>

                  <div className="sm:col-span-1 space-y-1 flex flex-col items-end">
                    <div className="h-4 hidden sm:block" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      onClick={() => remove(idx)}
                      className="text-destructive hover:bg-destructive/10 h-8 w-8 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          {isEdit ? "Save Changes" : "Create Transfer"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
