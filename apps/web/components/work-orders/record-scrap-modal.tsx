"use client";

import * as React from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, AlertTriangle } from "lucide-react";
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
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
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
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Record Scrap / Material Defect"
      description={`Capture damaged material or finished goods against Work Order ${workOrder.productionNumber}.`}
      size="sm"
      closeDisabled={isSubmitting}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogShellBody className="space-y-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            <span className="text-xs font-medium text-foreground">
              Damaged units are recorded as irreversible scrap entries.
            </span>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

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
        </DialogShellBody>
        <DialogShellFooter>
          <DialogShellCancelButton disabled={isSubmitting} />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={isSubmitting}
          >
            {isSubmitting && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            )}
            Record Scrap Entry
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
