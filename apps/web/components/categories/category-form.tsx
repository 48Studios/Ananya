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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  categoriesApi,
  type CategoryDto,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
} from "@/lib/api/categories-api";

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
  const [allCategories, setAllCategories] = React.useState<CategoryDto[]>([]);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = Boolean(initialData);

  React.useEffect(() => {
    categoriesApi
      .getAll()
      .then((cats) => {
        // Exclude self from parent options if editing
        if (initialData) {
          setAllCategories(cats.filter((c) => c.id !== initialData.id));
        } else {
          setAllCategories(cats);
        }
      })
      .catch(() => {
        // Non-blocking category load error
      });
  }, [initialData]);

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

      {/* Parent Category */}
        <Field>
        <FieldLabel htmlFor="category-parent">Parent Category</FieldLabel>
        <Controller
          name="parentId"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value ?? "none"}
              onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
            >
              <SelectTrigger id="category-parent">
                <SelectValue placeholder="Select parent category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  None (Top-Level Root Category)
                </SelectItem>
                {allCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.code} - {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
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
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          )}
          {isEditing ? "Save Changes" : "Create Category"}
        </Button>
      </DialogShellFooter>
    </form>
  );
}
