"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
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
import { EntitySelector } from "@/components/ui/entity-selector";
import { rmaRequestsApi, type RmaRequestDto } from "@/lib/api/rma-requests-api";

const rmaRequestSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  itemDescription: z.string().min(1, "Item description is required"),
  reason: z.string().min(1, "Return reason is required"),
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
    control,
    formState: { errors, isSubmitting },
  } = useForm<RmaRequestFormValues>({
    resolver: zodResolver(rmaRequestSchema),
    defaultValues: {
      customerId: "",
      itemDescription: "",
      reason: "",
      serialNumber: "",
    },
  });

  const onSubmit = async (values: RmaRequestFormValues) => {
    setServerError(null);
    try {
      const res = await rmaRequestsApi.create({
        customerId: values.customerId,
        itemDescription: values.itemDescription,
        reason: values.reason,
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
          <FieldLabel htmlFor="rma-customer">
            Customer <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="rma-customer"
                entity="customer"
                value={field.value}
                onChange={(val) => field.onChange(val ?? "")}
                placeholder="Select the customer returning goods..."
                creatable={false}
              />
            )}
          />
          {errors.customerId && (
            <FieldError>{errors.customerId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="itemDescription">
            Item / Component Description{" "}
            <span className="text-destructive">*</span>
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
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Issue RMA
        </Button>
      </DialogShellFooter>
    </form>
  );
}
