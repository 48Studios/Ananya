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
  cycleCountsApi,
  type CycleCountDto,
  type CreateCycleCountPayload,
  type UpdateCycleCountPayload,
} from "@/lib/api/cycle-counts-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

const lineSchema = z.object({
  componentId: z.string().min(1, "Component item selection is required"),
  systemQuantity: z.number().min(0, "System quantity cannot be negative"),
  unitOfMeasure: z.string().optional(),
  notes: z.string().optional(),
});

const cycleCountSchema = z.object({
  locationId: z.string().min(1, "Counting location is required"),
  assignedCounter: z.string().optional(),
  scheduledDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(lineSchema)
    .min(1, "At least one component line item is required"),
});

export type CycleCountFormValues = z.infer<typeof cycleCountSchema>;

interface CycleCountFormProps {
  initialData?: CycleCountDto | null;
  onSuccess: (saved: CycleCountDto) => void;
  onCancel: () => void;
}

export function CycleCountForm({
  initialData,
  onSuccess,
  onCancel,
}: CycleCountFormProps) {
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
  } = useForm<CycleCountFormValues>({
    resolver: zodResolver(cycleCountSchema),
    defaultValues: initialData
      ? {
          locationId: initialData.locationId,
          assignedCounter: initialData.assignedCounter || "",
          scheduledDate: initialData.scheduledDate
            ? initialData.scheduledDate.split("T")[0]
            : "",
          notes: initialData.notes || "",
          lines:
            initialData.lines.length > 0
              ? initialData.lines.map((l) => ({
                  componentId: l.componentId,
                  systemQuantity: l.systemQuantity,
                  unitOfMeasure: l.unitOfMeasure || "pcs",
                  notes: l.notes || "",
                }))
              : [
                  {
                    componentId: "",
                    systemQuantity: 100,
                    unitOfMeasure: "pcs",
                    notes: "",
                  },
                ],
        }
      : {
          locationId: "",
          assignedCounter: "Warehouse Counter Specialist",
          scheduledDate: new Date().toISOString().split("T")[0],
          notes: "",
          lines: [
            {
              componentId: "",
              systemQuantity: 100,
              unitOfMeasure: "pcs",
              notes: "",
            },
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

  const onSubmit: SubmitHandler<CycleCountFormValues> = async (values) => {
    setServerError(null);
    try {
      if (isEdit && initialData) {
        const payload: UpdateCycleCountPayload = {
          locationId: values.locationId,
          assignedCounter: values.assignedCounter || undefined,
          scheduledDate: values.scheduledDate || undefined,
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            systemQuantity: Number(l.systemQuantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        };
        const updated = await cycleCountsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateCycleCountPayload = {
          locationId: values.locationId,
          assignedCounter: values.assignedCounter || undefined,
          scheduledDate: values.scheduledDate || undefined,
          createdBy: "ADMIN",
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            systemQuantity: Number(l.systemQuantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        };
        const created = await cycleCountsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to submit Cycle Count");
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Location & Assigned User */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="count-loc">
            Counting Facility / Location{" "}
            <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="locationId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="count-loc">
                  <SelectValue placeholder="Select facility location..." />
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
          {errors.locationId?.message && (
            <FieldError>{errors.locationId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="count-user">Assigned Counter / User</FieldLabel>
          <Input
            id="count-user"
            type="text"
            placeholder="e.g. John Doe (Counter Lead)"
            {...register("assignedCounter")}
          />
        </Field>
      </div>

      {/* Date & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="count-date">Scheduled Count Date</FieldLabel>
          <Input
            id="count-date"
            type="date"
            {...register("scheduledDate")}
            className="font-mono"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="count-notes">
            Count Notes / Audit Scope
          </FieldLabel>
          <Input
            id="count-notes"
            type="text"
            placeholder="e.g. Monthly A-class component verification count"
            {...register("notes")}
          />
        </Field>
      </div>

      {/* Line Items Manager */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Counting Component Scope ({fields.length} Items)
          </h3>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({
                componentId: "",
                systemQuantity: 100,
                unitOfMeasure: "pcs",
                notes: "",
              })
            }
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Item
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
                  Expected System Qty{" "}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  {...register(`lines.${idx}.systemQuantity` as const, {
                    valueAsNumber: true,
                  })}
                  className="h-8 text-xs font-mono font-bold"
                />
                {errors.lines?.[idx]?.systemQuantity?.message && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.systemQuantity?.message}
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

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          )}
          {isEdit ? "Save Changes" : "Create Cycle Count"}
        </Button>
      </div>
    </form>
  );
}
