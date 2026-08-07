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
  warehousePoliciesApi,
  type WarehousePolicyDto,
  type UpdateWarehousePolicyPayload,
} from "@/lib/api/warehouse-policies-api";

const policySchema = z.object({
  policyName: z.string().min(1, "Policy name is required"),
  warehouseName: z.string().min(1, "Facility name is required"),
  pickingRule: z.enum(["FIFO", "FEFO", "LIFO", "ZONE_BASED"]),
  putawayRule: z.enum(["FAST_MOVING_FRONT", "VOLUME_MATCHED", "DIRECT_TO_BIN"]),
  isActive: z.boolean(),
});

export type WarehousePolicyFormValues = z.infer<typeof policySchema>;

interface WarehousePolicyFormProps {
  initialData?: WarehousePolicyDto | null;
  onSuccess: (saved: WarehousePolicyDto) => void;
  onCancel: () => void;
}

export function WarehousePolicyForm({
  initialData,
  onSuccess,
  onCancel,
}: WarehousePolicyFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WarehousePolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      policyName: initialData?.policyName ?? "",
      warehouseName: initialData?.warehouseName ?? "",
      pickingRule: initialData?.pickingRule ?? "FIFO",
      putawayRule: initialData?.putawayRule ?? "FAST_MOVING_FRONT",
      isActive: initialData?.isActive ?? true,
    },
  });

  const onSubmit = async (values: WarehousePolicyFormValues) => {
    setServerError(null);
    try {
      const sanitizedValues: WarehousePolicyFormValues = {
        ...values,
        policyName: values.policyName.trim(),
      };
      if (isEditing && initialData) {
        const payload: UpdateWarehousePolicyPayload = sanitizedValues;
        const updated = await warehousePoliciesApi.update(
          initialData.id,
          payload,
        );
        onSuccess(updated);
      } else {
        const created = await warehousePoliciesApi.create(sanitizedValues);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setServerError(err.message);
      else setServerError("Failed to save storage policy");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Policy Name */}
      <Field>
        <FieldLabel htmlFor="policy-name">
          Storage Policy Name <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="policy-name"
          placeholder="e.g. Electronics FIFO Picking & Putaway Rule"
          {...register("policyName")}
        />
        {errors.policyName?.message && (
          <FieldError>{errors.policyName.message}</FieldError>
        )}
      </Field>

      {/* Warehouse Selector */}
      <Field>
        <FieldLabel htmlFor="policy-warehouse">
          Target Warehouse Facility <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="warehouseName"
          control={control}
          render={({ field }) => (
            <EntitySelector
              id="policy-warehouse"
              entity="warehouse"
              value={field.value}
              onChange={(val, label) => field.onChange(label || val)}
              placeholder="Select warehouse facility..."
              creatable
            />
          )}
        />
        {errors.warehouseName?.message && (
          <FieldError>{errors.warehouseName.message}</FieldError>
        )}
      </Field>

      {/* Picking & Putaway Rules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="picking-rule">Picking Strategy</FieldLabel>
          <Controller
            name="pickingRule"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="picking-rule">
                  <SelectValue placeholder="Select picking rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">
                    FIFO (First In First Out)
                  </SelectItem>
                  <SelectItem value="FEFO">
                    FEFO (First Expired First Out)
                  </SelectItem>
                  <SelectItem value="LIFO">LIFO (Last In First Out)</SelectItem>
                  <SelectItem value="ZONE_BASED">Zone-Based Optimal</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="putaway-rule">Putaway Strategy</FieldLabel>
          <Controller
            name="putawayRule"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="putaway-rule">
                  <SelectValue placeholder="Select putaway rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FAST_MOVING_FRONT">
                    Fast-Moving Front Zone
                  </SelectItem>
                  <SelectItem value="VOLUME_MATCHED">
                    Volume & Dimension Matched
                  </SelectItem>
                  <SelectItem value="DIRECT_TO_BIN">
                    Direct-to-Bin Fixed Slotting
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

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
          {isEditing ? "Save Changes" : "Create Storage Policy"}
        </Button>
      </div>
    </form>
  );
}
