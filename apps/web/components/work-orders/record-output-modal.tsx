"use client";

import * as React from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { workOrdersApi, type WorkOrderDto } from "@/lib/api/work-orders-api";

const recordOutputSchema = z.object({
  producedQuantity: z
    .number()
    .min(1, "Produced quantity must be at least 1 unit"),
  scrappedQuantity: z
    .number()
    .min(0, "Scrapped quantity cannot be negative")
    .optional(),
  notes: z.string().optional(),
});

export type RecordOutputFormValues = z.infer<typeof recordOutputSchema>;

interface RecordOutputModalProps {
  isOpen: boolean;
  workOrder: WorkOrderDto;
  onSuccess: (updated: WorkOrderDto) => void;
  onClose: () => void;
}

export function RecordOutputModal({
  isOpen,
  workOrder,
  onSuccess,
  onClose,
}: RecordOutputModalProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const remainingUnits = Math.max(
    0,
    workOrder.quantityPlanned - workOrder.quantityCompleted,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordOutputFormValues>({
    resolver: zodResolver(recordOutputSchema),
    defaultValues: {
      producedQuantity: remainingUnits > 0 ? remainingUnits : 1,
      scrappedQuantity: 0,
      notes: "",
    },
  });

  const onSubmit: SubmitHandler<RecordOutputFormValues> = async (values) => {
    setServerError(null);
    try {
      const updated = await workOrdersApi.recordPartialOutput(workOrder.id, {
        producedQuantity: Number(values.producedQuantity),
        scrappedQuantity: values.scrappedQuantity
          ? Number(values.scrappedQuantity)
          : 0,
        notes: values.notes || undefined,
      });
      onSuccess(updated);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to record production output batch");
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
      title="Record Finished Goods Output"
      description={`Capture the completed batch for Work Order ${workOrder.productionNumber}. ${remainingUnits} units remain out of ${workOrder.quantityPlanned} planned.`}
      size="sm"
      closeDisabled={isSubmitting}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogShellBody className="space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-foreground">
              Remaining units: {remainingUnits}
            </span>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <Field>
            <FieldLabel htmlFor="produced-qty">
              Batch Yield Quantity (Units){" "}
              <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="produced-qty"
              type="number"
              min={1}
              {...register("producedQuantity", { valueAsNumber: true })}
              className="font-mono font-bold"
            />
            {errors.producedQuantity?.message && (
              <FieldError>{errors.producedQuantity.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="scrapped-qty">
              Scrapped Quantity (If Damaged)
            </FieldLabel>
            <Input
              id="scrapped-qty"
              type="number"
              min={0}
              {...register("scrappedQuantity", { valueAsNumber: true })}
              className="font-mono"
            />
            {errors.scrappedQuantity?.message && (
              <FieldError>{errors.scrappedQuantity.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="run-notes">Run Notes / Batch Code</FieldLabel>
            <Input
              id="run-notes"
              type="text"
              placeholder="e.g. Morning Shift Run #2 completed"
              {...register("notes")}
            />
          </Field>
        </DialogShellBody>
        <DialogShellFooter>
          <DialogShellCancelButton disabled={isSubmitting} />
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            )}
            Record Output & Issue Materials
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
