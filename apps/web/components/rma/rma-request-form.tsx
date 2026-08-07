"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  rmaRequestsApi,
  type RmaRequestDto,
} from "@/lib/api/rma-requests-api";

const rmaRequestSchema = z.object({
  itemDescription: z.string().min(1, "Item description is required"),
  reason: z.string().min(1, "Return reason is required"),
  customerName: z.string().optional(),
  salesOrderNumber: z.string().optional(),
  serialNumber: z.string().optional(),
});

export type RmaRequestFormValues = z.infer<typeof rmaRequestSchema>;

interface RmaRequestFormProps {
  onSuccess: (rma: RmaRequestDto) => void;
  onCancel: () => void;
}

export function RmaRequestForm({ onSuccess, onCancel }: RmaRequestFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RmaRequestFormValues>({
    resolver: zodResolver(rmaRequestSchema),
    defaultValues: {
      itemDescription: "",
      reason: "",
      customerName: "",
      salesOrderNumber: "",
      serialNumber: "",
    },
  });

  const onSubmit = async (values: RmaRequestFormValues) => {
    setServerError(null);
    try {
      const res = await rmaRequestsApi.create({
        itemDescription: values.itemDescription,
        reason: values.reason,
        salesOrderNumber: values.salesOrderNumber,
        serialNumber: values.serialNumber,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to issue new RMA request",
      );
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

        <Field>
          <FieldLabel htmlFor="itemDescription">
            Item / Component Description <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="itemDescription"
            placeholder="e.g. Servo Motor Unit - Model X1"
            {...register("itemDescription")}
          />
          {errors.itemDescription && (
            <FieldError>{errors.itemDescription.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="reason">
            Return Reason <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="reason"
            placeholder="e.g. Damaged in transit / Component defective"
            {...register("reason")}
          />
          {errors.reason && <FieldError>{errors.reason.message}</FieldError>}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="salesOrderNumber">Sales Order #</FieldLabel>
            <Input
              id="salesOrderNumber"
              placeholder="e.g. SO-2026-0881"
              {...register("salesOrderNumber")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="serialNumber">Serial Number</FieldLabel>
            <Input
              id="serialNumber"
              placeholder="e.g. SN-2026-90412"
              {...register("serialNumber")}
            />
          </Field>
        </div>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Issue RMA
        </Button>
      </DialogShellFooter>
    </form>
  );
}
