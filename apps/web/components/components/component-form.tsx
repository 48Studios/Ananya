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
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  componentsApi,
  type ComponentDto,
  type CreateComponentPayload,
  type UpdateComponentPayload,
} from "@/lib/api/components-api";

const componentSchema = z.object({
  sku: z
    .string()
    .min(1, "SKU is required")
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, "Component name is required")
    .transform((val) => val.trim()),
  description: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  manufacturerId: z.string().optional().nullable(),
  unit: z
    .string()
    .min(1, "Unit of measure is required")
    .transform((val) => val.trim().toLowerCase()),
  defaultLocationId: z.string().optional().nullable(),
});

export type ComponentFormValues = z.infer<typeof componentSchema>;

interface ComponentFormProps {
  initialData?: ComponentDto | null;
  onSuccess: (savedComponent: ComponentDto) => void;
  onCancel: () => void;
}

export function ComponentForm({
  initialData,
  onSuccess,
  onCancel,
}: ComponentFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComponentFormValues>({
    resolver: zodResolver(componentSchema),
    defaultValues: {
      sku: initialData?.sku ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      categoryId: initialData?.categoryId ?? "",
      manufacturerId: initialData?.manufacturerId ?? "",
      unit: initialData?.unit ?? "pcs",
      defaultLocationId: initialData?.defaultLocationId ?? "",
    },
  });

  React.useEffect(() => {
    reset({
      sku: initialData?.sku ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      categoryId: initialData?.categoryId ?? "",
      manufacturerId: initialData?.manufacturerId ?? "",
      unit: initialData?.unit ?? "pcs",
      defaultLocationId: initialData?.defaultLocationId ?? "",
    });
  }, [initialData, reset]);

  const onSubmit = async (values: ComponentFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        const payload: UpdateComponentPayload = {
          sku: values.sku,
          name: values.name,
          description: values.description || null,
          categoryId: values.categoryId || null,
          manufacturerId: values.manufacturerId || null,
          unit: values.unit,
          defaultLocationId: values.defaultLocationId || null,
        };
        const updated = await componentsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateComponentPayload = {
          sku: values.sku,
          name: values.name,
          description: values.description || null,
          categoryId: values.categoryId || null,
          manufacturerId: values.manufacturerId || null,
          unit: values.unit,
          defaultLocationId: values.defaultLocationId || null,
        };
        const created = await componentsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing
            ? "Failed to update component"
            : "Failed to create component",
        );
      }
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* SKU */}
          <Field>
            <FieldLabel htmlFor="component-sku">
              SKU / Part Number <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="component-sku"
              type="text"
              placeholder="e.g. MCU-STM32F4-01"
              {...register("sku")}
              className="font-mono"
            />
            {errors.sku?.message && (
              <FieldError>{errors.sku.message}</FieldError>
            )}
          </Field>

          {/* Unit */}
          <Field>
            <FieldLabel htmlFor="component-unit">
              Default Unit <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              name="unit"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-unit"
                  entity="unit"
                  value={field.value}
                  onChange={(val) => field.onChange(val)}
                  creatable
                  clearable={false}
                />
              )}
            />
            {errors.unit?.message && (
              <FieldError>{errors.unit.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Name */}
        <Field>
          <FieldLabel htmlFor="component-name">
            Component Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="component-name"
            type="text"
            placeholder="e.g. Microcontroller Unit 32-bit ARM Cortex-M4"
            {...register("name")}
          />
          {errors.name?.message && (
            <FieldError>{errors.name.message}</FieldError>
          )}
        </Field>

        {/* Category and Manufacturer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <Field>
            <FieldLabel htmlFor="component-category">Category</FieldLabel>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-category"
                  entity="category"
                  value={field.value ?? ""}
                  onChange={(val) => field.onChange(val)}
                  placeholder="Select or search category..."
                  creatable
                  clearable
                />
              )}
            />
            {errors.categoryId?.message && (
              <FieldError>{errors.categoryId.message}</FieldError>
            )}
          </Field>

          {/* Manufacturer */}
          <Field>
            <FieldLabel htmlFor="component-manufacturer">
              Manufacturer
            </FieldLabel>
            <Controller
              name="manufacturerId"
              control={control}
              render={({ field }) => (
                <EntitySelector
                  id="component-manufacturer"
                  entity="manufacturer"
                  value={field.value ?? ""}
                  onChange={(val) => field.onChange(val)}
                  placeholder="Select or search manufacturer..."
                  creatable
                  clearable
                />
              )}
            />
            {errors.manufacturerId?.message && (
              <FieldError>{errors.manufacturerId.message}</FieldError>
            )}
          </Field>
        </div>

        {/* Default Location */}
        <Field>
          <FieldLabel htmlFor="component-location">
            Default Storage Location
          </FieldLabel>
          <Controller
            name="defaultLocationId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="component-location"
                entity="location"
                value={field.value ?? ""}
                onChange={(val) => field.onChange(val)}
                placeholder="Select storage location..."
                creatable
                clearable
              />
            )}
          />
        </Field>

        {/* Description */}
        <Field>
          <FieldLabel htmlFor="component-desc">Description</FieldLabel>
          <Textarea
            id="component-desc"
            rows={3}
            placeholder="Detailed component specification..."
            {...register("description")}
            className="resize-none"
          />
        </Field>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {isEditing ? "Save Changes" : "Create Component"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
