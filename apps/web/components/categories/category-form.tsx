"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  categoriesApi,
  type CategoryDto,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
} from "@/lib/api/categories-api";

import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const categorySchema = z.object({
  code: z
    .string()
    .min(1, "Category code is required")
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, "Category name is required")
    .transform((val) => val.trim()),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryFormProps {
  initialData?: CategoryDto | null;
  onSuccess: (savedCategory: CategoryDto) => void;
  onCancel: () => void;
}

export function CategoryForm({
  initialData,
  onSuccess,
  onCancel,
}: CategoryFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      code: initialData?.code ?? "",
      name: initialData?.name ?? "",
      description: initialData?.description ?? "",
      parentId: initialData?.parentId ?? "",
    },
  });

  const onSubmit = async (values: CategoryFormValues) => {
    setServerError(null);
    try {
      if (isEditing && initialData) {
        if (values.parentId && values.parentId === initialData.id) {
          setServerError("A category cannot be its own parent");
          return;
        }
        const payload: UpdateCategoryPayload = {
          code: values.code,
          name: values.name,
          description: values.description || null,
          parentId: values.parentId || null,
        };
        const updated = await categoriesApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateCategoryPayload = {
          code: values.code,
          name: values.name,
          description: values.description || null,
          parentId: values.parentId || null,
        };
        const created = await categoriesApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError(
          isEditing ? "Failed to update category" : "Failed to create category",
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

      {/* Code */}
      <Field>
        <FieldLabel htmlFor="category-code">
          Category Code <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="category-code"
          type="text"
          placeholder="e.g. CAT-ACTIVE-COMP"
          {...register("code")}
          className="uppercase font-mono"
        />
        {errors.code?.message && <FieldError>{errors.code.message}</FieldError>}
      </Field>

      {/* Name */}
      <Field>
        <FieldLabel htmlFor="category-name">
          Category Name <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="category-name"
          type="text"
          placeholder="e.g. Active Electronic Components"
          {...register("name")}
        />
        {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
      </Field>

      {/* Parent Category with EntitySelector */}
      <Field>
        <FieldLabel htmlFor="category-parent">Parent Category</FieldLabel>
        <Controller
          name="parentId"
          control={control}
          render={({ field }) => (
            <EntitySelector
              id="category-parent"
              entity="category"
              value={field.value ?? ""}
              onChange={(val) => field.onChange(val)}
              placeholder="Select parent category (optional)..."
              creatable
            />
          )}
        />
        {errors.parentId?.message && <FieldError>{errors.parentId.message}</FieldError>}
      </Field>

      {/* Description */}
      <Field>
        <FieldLabel htmlFor="category-desc">Description</FieldLabel>
        <Textarea
          id="category-desc"
          rows={3}
          placeholder="Detailed categorization description..."
          {...register("description")}
          className="resize-none"
        />
      </Field>

      {/* Form Actions */}
      <Separator className="my-2" />
      <DialogFooter>
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
          {isEditing ? "Save Changes" : "Create Category"}
        </Button>
      </DialogFooter>
    </form>
  );
}

