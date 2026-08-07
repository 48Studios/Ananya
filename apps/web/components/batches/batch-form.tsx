"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  batchesApi,
  type BatchDto,
  type CreateBatchPayload,
  type UpdateBatchPayload,
} from "@/lib/api/batches-api";

const batchSchema = z.object({
  batchNumber: z.string().min(1, "Batch number is required"),
  sku: z.string().min(1, "SKU is required"),
  componentName: z.string().min(1, "Component name is required"),
  quantityOnHand: z.number().min(0, "Quantity must be non-negative"),
  manufactureDate: z.string().min(1, "Manufacture date is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  status: z.enum(["ACTIVE", "EXPIRED", "QUARANTINED"]),
});

export type BatchFormValues = z.infer<typeof batchSchema>;

interface BatchFormProps {
  initialData?: BatchDto | null;
  onSuccess: (saved: BatchDto) => void;
  onCancel: () => void;
}

export function BatchForm({
  initialData,
  onSuccess,
  onCancel,
}: BatchFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const today = new Date().toISOString().split("T")[0]!;
  const sixMonthsLater = new Date(Date.now() + 180 * 86400 * 1000)
    .toISOString()
    .split("T")[0]!;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      batchNumber: initialData?.batchNumber ?? "",
      sku: initialData?.sku ?? "",
      componentName: initialData?.componentName ?? "",
      quantityOnHand: initialData?.quantityOnHand ?? 100,
      manufactureDate: initialData?.manufactureDate ?? today,
      expiryDate: initialData?.expiryDate ?? sixMonthsLater,
      status: initialData?.status ?? "ACTIVE",
    },
  });

  const onSubmit = async (values: BatchFormValues) => {
    setServerError(null);
    try {
      const sanitizedValues: BatchFormValues = {
        ...values,
        batchNumber: values.batchNumber.trim().toUpperCase(),
        sku: values.sku.trim(),
        componentName: values.componentName.trim(),
      };
      if (isEditing && initialData) {
        const payload: UpdateBatchPayload = sanitizedValues;
        const updated = await batchesApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateBatchPayload = sanitizedValues;
        const created = await batchesApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setServerError(err.message);
      else setServerError("Failed to save batch record");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Batch Number */}
      <Field>
        <FieldLabel htmlFor="batch-number">
          Batch / Lot Number <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="batch-number"
          placeholder="e.g. BAT-2026-0991"
          {...register("batchNumber")}
          className="uppercase font-mono"
        />
        {errors.batchNumber?.message && (
          <FieldError>{errors.batchNumber.message}</FieldError>
        )}
      </Field>

      {/* Component / SKU with EntitySelector */}
      <Field>
        <FieldLabel htmlFor="batch-unit">
          Associated Component Unit <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="sku"
          control={control}
          render={({ field }) => (
            <EntitySelector
              id="batch-unit"
              entity="unit"
              value={field.value}
              onChange={(val) => {
                field.onChange(val);
                if (!control._formValues.componentName) {
                  setValue("componentName", `${val} Component Lot`);
                }
              }}
              placeholder="Select component unit..."
              creatable
            />
          )}
        />
        {errors.sku?.message && <FieldError>{errors.sku.message}</FieldError>}
      </Field>

      {/* Component Name */}
      <Field>
        <FieldLabel htmlFor="batch-component-name">
          Material Description <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="batch-component-name"
          placeholder="e.g. Thermal Conductive Epoxy Compound"
          {...register("componentName")}
        />
        {errors.componentName?.message && (
          <FieldError>{errors.componentName.message}</FieldError>
        )}
      </Field>

      {/* Quantity & Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <FieldLabel htmlFor="batch-qty">On-Hand Quantity</FieldLabel>
          <Input
            id="batch-qty"
            type="number"
            {...register("quantityOnHand", { valueAsNumber: true })}
            className="font-mono"
          />
          {errors.quantityOnHand?.message && (
            <FieldError>{errors.quantityOnHand.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="batch-mfg-date">Mfg Date</FieldLabel>
          <Input id="batch-mfg-date" type="date" {...register("manufactureDate")} />
          {errors.manufactureDate?.message && (
            <FieldError>{errors.manufactureDate.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="batch-expiry-date">Expiry Date</FieldLabel>
          <Input id="batch-expiry-date" type="date" {...register("expiryDate")} />
          {errors.expiryDate?.message && (
            <FieldError>{errors.expiryDate.message}</FieldError>
          )}
        </Field>
      </div>

      {/* Status */}
      <Field>
        <FieldLabel htmlFor="batch-status">Batch Status</FieldLabel>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="batch-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active Available</SelectItem>
                <SelectItem value="QUARANTINED">Quarantined Hold</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {/* Form Actions */}
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
          {isEditing ? "Save Changes" : "Create Batch"}
        </Button>
      </div>
    </form>
  );
}
