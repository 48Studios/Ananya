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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  warehouseTransfersApi,
  type WarehouseTransferDto,
  type CreateWarehouseTransferPayload,
  type UpdateWarehouseTransferPayload,
} from "@/lib/api/warehouse-transfers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

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
            { componentId: "", quantity: 10, unitOfMeasure: "pcs", notes: "" },
          ],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const handleComponentChange = (idx: number, compId: string) => {
    setValue(`lines.${idx}.componentId`, compId);
    const comp = components.find((c) => c.id === compId);
    if (comp) {
      setValue(`lines.${idx}.unitOfMeasure`, comp.unit || "pcs");
    }
  };

  const onSubmit: SubmitHandler<WarehouseTransferFormValues> = async (
    values,
  ) => {
    setServerError(null);
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
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="transfer-source-loc">
                  <SelectValue placeholder="Select dispatch location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="transfer-dest-loc">
                  <SelectValue placeholder="Select receiving location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="p-3 bg-muted/20 border border-border rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-6 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Item #{idx + 1} Component{" "}
                  <span className="text-destructive">*</span>
                </label>
                <Controller
                  name={`lines.${idx}.componentId` as const}
                  control={control}
                  render={({ field: compField }) => (
                    <Select
                      value={compField.value}
                      onValueChange={(val) => {
                        compField.onChange(val ?? "");
                        handleComponentChange(idx, val ?? "");
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select component..." />
                      </SelectTrigger>
                      <SelectContent>
                        {components.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.sku} — {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.lines?.[idx]?.componentId?.message && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.componentId?.message}
                  </p>
                )}
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Quantity <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  step="any"
                  min={0.0001}
                  {...register(`lines.${idx}.quantity` as const, {
                    valueAsNumber: true,
                  })}
                  className="h-8 text-xs font-mono font-bold"
                />
                {errors.lines?.[idx]?.quantity?.message && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.quantity?.message}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Unit
                </label>
                <Input
                  type="text"
                  {...register(`lines.${idx}.unitOfMeasure` as const)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={fields.length === 1}
                  onClick={() => remove(idx)}
                  className="text-destructive hover:bg-destructive/10 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {isEdit ? "Save Changes" : "Create Transfer"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
