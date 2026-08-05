"use client";

import * as React from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, AlertTriangle, X } from "lucide-react";
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
  workOrdersApi,
  type WorkOrderDto,
  type MaterialRequirementDetailDto,
} from "@/lib/api/work-orders-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

const recordScrapSchema = z.object({
  componentId: z
    .string()
    .min(1, "Please select a component or finished product"),
  quantity: z.number().min(0.0001, "Quantity must be greater than zero"),
  reason: z.string().min(2, "Reason is required for scrap recording"),
});

export type RecordScrapFormValues = z.infer<typeof recordScrapSchema>;

interface RecordScrapModalProps {
  isOpen: boolean;
  workOrder: WorkOrderDto;
  materials: MaterialRequirementDetailDto[];
  onSuccess: (updated: WorkOrderDto) => void;
  onClose: () => void;
}

export function RecordScrapModal({
  isOpen,
  workOrder,
  materials,
  onSuccess,
  onClose,
}: RecordScrapModalProps) {
  const [componentsMap, setComponentsMap] = React.useState<
    Map<string, ComponentDto>
  >(new Map());
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    componentsApi
      .getAll()
      .then((comps) => {
        const map = new Map<string, ComponentDto>();
        for (const c of comps) map.set(c.id, c);
        setComponentsMap(map);
      })
      .catch(() => null);
  }, []);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordScrapFormValues>({
    resolver: zodResolver(recordScrapSchema),
    defaultValues: {
      componentId: workOrder.componentId,
      quantity: 1,
      reason: "Material defect during production assembly",
    },
  });

  if (!isOpen) return null;

  const onSubmit: SubmitHandler<RecordScrapFormValues> = async (values) => {
    setServerError(null);
    try {
      const updated = await workOrdersApi.recordScrap(workOrder.id, {
        componentId: values.componentId,
        quantity: Number(values.quantity),
        reason: values.reason,
      });
      onSuccess(updated);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to record scrap");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-foreground">
              Record Scrap / Material Defect
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Record damaged raw material components or finished goods for Work
          Order{" "}
          <span className="font-mono font-bold text-foreground">
            {workOrder.productionNumber}
          </span>
          .
        </p>

        {serverError && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="scrap-component">
              Component / Item <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="componentId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="scrap-component">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={workOrder.componentId}>
                      Finished Product —{" "}
                      {componentsMap.get(workOrder.componentId)?.name ||
                        "Finished Product"}
                    </SelectItem>
                    {materials.map((m) => (
                      <SelectItem key={m.componentId} value={m.componentId}>
                        Raw Material —{" "}
                        {componentsMap.get(m.componentId)?.name ||
                          m.componentId}
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
            <FieldLabel htmlFor="scrap-qty">
              Scrapped Quantity <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="scrap-qty"
              type="number"
              step="any"
              min={0.0001}
              {...register("quantity", { valueAsNumber: true })}
              className="font-mono font-bold"
            />
            {errors.quantity?.message && (
              <FieldError>{errors.quantity.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="scrap-reason">
              Scrap Reason / Defect Category{" "}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="scrap-reason"
              type="text"
              placeholder="e.g. Component cracked during assembly line stress test"
              {...register("reason")}
            />
            {errors.reason?.message && (
              <FieldError>{errors.reason.message}</FieldError>
            )}
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              Record Scrap Entry
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
