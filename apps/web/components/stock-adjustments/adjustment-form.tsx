"use client";

import * as React from "react";
import {
  useForm,
  useFieldArray,
  Controller,
  SubmitHandler,
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
  stockAdjustmentsApi,
  type StockAdjustmentDto,
  type CreateStockAdjustmentPayload,
} from "@/lib/api/stock-adjustments-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

const lineSchema = z.object({
  componentId: z.string().min(1, "Component selection is required"),
  currentQuantity: z.number().min(0, "Current quantity cannot be negative"),
  countedQuantity: z.number().min(0, "Counted quantity cannot be negative"),
  unitOfMeasure: z.string(),
});

const adjustmentSchema = z.object({
  locationId: z.string().min(1, "Location selection is required"),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, "At least one line item must be added"),
});

export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

const STANDARD_REASONS = [
  "Cycle Count Discrepancy",
  "Damaged / Expired Goods",
  "Supplier Shortage",
  "Internal Transfer Error",
  "System Reconciliation / Initial Balance",
  "Other",
];

interface StockAdjustmentFormProps {
  onSuccess: (savedAdj: StockAdjustmentDto) => void;
  onCancel: () => void;
}

export function StockAdjustmentForm({
  onSuccess,
  onCancel,
}: StockAdjustmentFormProps) {
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [loadingData, setLoadingData] = React.useState(true);

  React.useEffect(() => {
    Promise.all([locationsApi.getAll(), componentsApi.getAll()])
      .then(([locs, comps]) => {
        setLocations(locs);
        setComponents(comps);

        const map: Record<string, ComponentDto> = {};
        for (const c of comps) map[c.id] = c;
        setComponentsMap(map);
      })
      .catch((err) => {
        setServerError(
          err instanceof Error ? err.message : "Failed to load reference data",
        );
      })
      .finally(() => setLoadingData(false));
  }, []);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      locationId: "",
      reason: "Cycle Count Discrepancy",
      notes: "",
      lines: [
        {
          componentId: "",
          currentQuantity: 0,
          countedQuantity: 0,
          unitOfMeasure: "pcs",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const handleComponentSelect = (index: number, componentId: string) => {
    setValue(`lines.${index}.componentId`, componentId);
    const comp = componentsMap[componentId];
    if (comp) {
      setValue(`lines.${index}.unitOfMeasure`, comp.unit || "pcs");
    }
  };

  const watchedLines = watch("lines");

  const onSubmit: SubmitHandler<AdjustmentFormValues> = async (values) => {
    setServerError(null);
    try {
      const payload: CreateStockAdjustmentPayload = {
        locationId: values.locationId,
        reason: values.reason,
        notes: values.notes || null,
        createdBy: "ADMIN",
        lines: values.lines.map((l) => ({
          componentId: l.componentId,
          currentQuantity: Number(l.currentQuantity),
          countedQuantity: Number(l.countedQuantity),
          unitOfMeasure: l.unitOfMeasure,
        })),
      };

      const created = await stockAdjustmentsApi.create(payload);
      onSuccess(created);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to submit Stock Adjustment");
      }
    }
  };

  if (loadingData) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Loading locations and components catalog...
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

      {/* Storage Location */}
      <Field>
        <FieldLabel htmlFor="adj-location">
          Target Storage Location <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="locationId"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="adj-location">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.code} - {loc.name}
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

      {/* Reason & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="adj-reason">
            Adjustment Reason <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="adj-reason">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {STANDARD_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="adj-notes">Notes / Reference Details</FieldLabel>
          <Input
            id="adj-notes"
            type="text"
            placeholder="e.g. Approved during quarterly physical count"
            {...register("notes")}
          />
        </Field>
      </div>

      {/* Line Items Section */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Reconciliation Line Items{" "}
            <span className="text-destructive">*</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({
                componentId: "",
                currentQuantity: 0,
                countedQuantity: 0,
                unitOfMeasure: "pcs",
              })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
          </Button>
        </div>

        {errors.lines?.root?.message && (
          <p className="text-xs text-destructive">
            {errors.lines.root.message}
          </p>
        )}

        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {fields.map((field, index) => {
            const current = Number(watchedLines[index]?.currentQuantity) || 0;
            const counted = Number(watchedLines[index]?.countedQuantity) || 0;
            const diff = counted - current;

            return (
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
                <Field className="pr-6">
                  <FieldLabel className="text-[10px]">Component</FieldLabel>
                  <Select
                    value={watchedLines[index]?.componentId || ""}
                    onValueChange={(val) =>
                      handleComponentSelect(index, val ?? "")
                    }
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
                </Field>

                {/* Quantities & Preview Grid */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Field>
                    <FieldLabel className="text-[10px]">
                      Current Stock
                    </FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      {...register(`lines.${index}.currentQuantity`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono"
                    />
                  </Field>

                  <Field>
                    <FieldLabel className="text-[10px]">
                      Counted Stock
                    </FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      {...register(`lines.${index}.countedQuantity`, {
                        valueAsNumber: true,
                      })}
                      className="h-8 text-xs font-mono font-bold"
                    />
                  </Field>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Difference
                    </label>
                    <div className="px-2 py-1.5 text-xs font-mono font-bold rounded border border-border flex items-center justify-between bg-card">
                      <span>{diff > 0 ? `+${diff}` : diff}</span>
                      {diff > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Increase
                        </span>
                      )}
                      {diff < 0 && (
                        <span className="text-[10px] text-rose-600 dark:text-rose-400">
                          Decrease
                        </span>
                      )}
                      {diff === 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          No Change
                        </span>
                      )}
                    </div>
                  </div>
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
          {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Submit Adjustment for Approval
        </Button>
      </DialogShellFooter>
    </form>
  );
}
