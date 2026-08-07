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
  serialsApi,
  type SerialDto,
  type CreateSerialPayload,
  type UpdateSerialPayload,
} from "@/lib/api/serials-api";

const serialSchema = z.object({
  serialNumber: z
    .string()
    .min(1, "Serial number is required")
    .transform((val) => val.trim().toUpperCase()),
  sku: z
    .string()
    .min(1, "SKU is required")
    .transform((val) => val.trim()),
  componentName: z
    .string()
    .min(1, "Component name is required")
    .transform((val) => val.trim()),
  status: z.enum(["IN_STOCK", "ASSIGNED", "DISPATCHED", "MAINTENANCE"]),
  location: z.string().min(1, "Storage location path is required"),
});

export type SerialFormValues = z.infer<typeof serialSchema>;

interface SerialFormProps {
  initialData?: SerialDto | null;
  onSuccess: (saved: SerialDto) => void;
  onCancel: () => void;
}

export function SerialForm({
  initialData,
  onSuccess,
  onCancel,
}: SerialFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SerialFormValues>({
    resolver: zodResolver(serialSchema),
    defaultValues: {
      serialNumber: initialData?.serialNumber ?? "",
      sku: initialData?.sku ?? "",
      componentName: initialData?.componentName ?? "",
      status: initialData?.status ?? "IN_STOCK",
      location: initialData?.location ?? "",
    },
  });

  const onSubmit = async (values: SerialFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        const payload: UpdateSerialPayload = values;
        const updated = await serialsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateSerialPayload = values;
        const created = await serialsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setServerError(err.message);
      else setServerError("Failed to save serial number");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Serial Number */}
      <Field>
        <FieldLabel htmlFor="serial-number">
          Serial Number <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="serial-number"
          placeholder="e.g. SN-998102-C"
          {...register("serialNumber")}
          className="uppercase font-mono"
        />
        {errors.serialNumber?.message && (
          <FieldError>{errors.serialNumber.message}</FieldError>
        )}
      </Field>

      {/* SKU & Component */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="serial-sku">SKU Code</FieldLabel>
          <Input
            id="serial-sku"
            placeholder="e.g. COMP-1001"
            {...register("sku")}
            className="font-mono uppercase"
          />
          {errors.sku?.message && <FieldError>{errors.sku.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="serial-name">Component / Product Name</FieldLabel>
          <Input
            id="serial-name"
            placeholder="e.g. Precision CNC Spindle Motor 5kW"
            {...register("componentName")}
          />
          {errors.componentName?.message && (
            <FieldError>{errors.componentName.message}</FieldError>
          )}
        </Field>
      </div>

      {/* Location with EntitySelector */}
      <Field>
        <FieldLabel htmlFor="serial-location">
          Storage Location <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="location"
          control={control}
          render={({ field }) => (
            <EntitySelector
              id="serial-location"
              entity="location"
              value={field.value}
              onChange={(val, label) => field.onChange(label || val)}
              placeholder="Select storage location..."
              creatable
            />
          )}
        />
        {errors.location?.message && (
          <FieldError>{errors.location.message}</FieldError>
        )}
      </Field>

      {/* Status */}
      <Field>
        <FieldLabel htmlFor="serial-status">Serial Lifecycle Status</FieldLabel>
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="serial-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_STOCK">In Stock Available</SelectItem>
                <SelectItem value="ASSIGNED">Assigned to Order</SelectItem>
                <SelectItem value="DISPATCHED">Dispatched</SelectItem>
                <SelectItem value="MAINTENANCE">In Maintenance</SelectItem>
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
          {isEditing ? "Save Changes" : "Register Serial"}
        </Button>
      </div>
    </form>
  );
}
