"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
  unitsApi,
  type UnitDto,
  type CreateUnitPayload,
  type UpdateUnitPayload,
} from "@/lib/api/units-api";

const unitSchema = z.object({
  name: z.string().min(1, "Unit name is required"),
  category: z.string().min(1, "Measurement category is required"),
  isBaseUnit: z.boolean(),
  conversionFactor: z.number().optional().nullable(),
  precision: z.number().min(0, "Precision must be 0 or greater").max(6, "Precision cannot exceed 6"),
});

export type UnitFormValues = z.infer<typeof unitSchema>;

interface UnitFormProps {
  initialData?: UnitDto | null;
  onSuccess: (savedUnit: UnitDto) => void;
  onCancel: () => void;
}

const CATEGORY_OPTIONS = [
  "Count",
  "Weight",
  "Length",
  "Volume",
  "Time",
  "Area",
  "General",
];

export function UnitForm({ initialData, onSuccess, onCancel }: UnitFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      category: initialData?.category ?? "Count",
      isBaseUnit: initialData?.isBaseUnit ?? true,
      conversionFactor: initialData?.conversionFactor
        ? Number(initialData.conversionFactor)
        : 1.0,
      precision: initialData?.precision
        ? Number(initialData.precision)
        : 0,
    },
  });

  const isBaseUnit = watch("isBaseUnit");

  const onSubmit = async (values: UnitFormValues) => {
    setServerError(null);
    try {
      if (!values.isBaseUnit && (!values.conversionFactor || values.conversionFactor <= 0)) {
        setServerError("Non-base units require a conversion factor greater than 0");
        return;
      }

      if (isEditing && initialData) {
        const payload: UpdateUnitPayload = {
          name: values.name.trim(),
          category: values.category.trim(),
          isBaseUnit: values.isBaseUnit,
          conversionFactor: values.isBaseUnit ? 1.0 : (values.conversionFactor ?? 1.0),
          precision: values.precision,
        };
        const updated = await unitsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateUnitPayload = {
          name: values.name.trim(),
          category: values.category.trim(),
          isBaseUnit: values.isBaseUnit,
          conversionFactor: values.isBaseUnit ? 1.0 : (values.conversionFactor ?? 1.0),
          precision: values.precision,
        };
        const created = await unitsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing ? "Failed to update unit" : "Failed to create unit",
        );
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Unit Name */}
      <Field>
        <FieldLabel htmlFor="unit-name">
          Unit Name / Symbol <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="unit-name"
          type="text"
          placeholder="e.g. pcs, kg, m, box, roll"
          {...register("name")}
        />
        {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
      </Field>

      {/* Category */}
      <Field>
        <FieldLabel htmlFor="unit-category">
          Measurement Category <span className="text-destructive">*</span>
        </FieldLabel>
        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="unit-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.category?.message && (
          <FieldError>{errors.category.message}</FieldError>
        )}
      </Field>

      {/* Is Base Unit */}
      <Field>
        <FieldLabel htmlFor="unit-type">Unit Classification</FieldLabel>
        <Controller
          name="isBaseUnit"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ? "base" : "derived"}
              onValueChange={(val) => field.onChange(val === "base")}
            >
              <SelectTrigger id="unit-type">
                <SelectValue placeholder="Select classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Primary Base Unit (Standard)</SelectItem>
                <SelectItem value="derived">Derived Secondary Unit</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {/* Conversion Factor (if Derived) */}
      {!isBaseUnit && (
        <Field>
          <FieldLabel htmlFor="unit-conversion">
            Conversion Factor <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="unit-conversion"
            type="number"
            step="0.0001"
            placeholder="e.g. 1000 for 1 kg = 1000 g"
            {...register("conversionFactor", { valueAsNumber: true })}
          />
          {errors.conversionFactor?.message && (
            <FieldError>{errors.conversionFactor.message}</FieldError>
          )}
        </Field>
      )}

      {/* Decimal Precision */}
      <Field>
        <FieldLabel htmlFor="unit-precision">Decimal Precision (Digits)</FieldLabel>
        <Input
          id="unit-precision"
          type="number"
          min="0"
          max="6"
          placeholder="0"
          {...register("precision", { valueAsNumber: true })}
        />
        {errors.precision?.message && (
          <FieldError>{errors.precision.message}</FieldError>
        )}
      </Field>

      {/* Form Action Buttons */}
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
          {isEditing ? "Save Changes" : "Create Unit"}
        </Button>
      </div>
    </form>
  );
}
