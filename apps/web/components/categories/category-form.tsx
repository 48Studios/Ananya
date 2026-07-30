'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  categoriesApi,
  type CategoryDto,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
} from '@/lib/api/categories-api'

const categorySchema = z.object({
  code: z
    .string()
    .min(1, 'Category code is required')
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, 'Category name is required')
    .transform((val) => val.trim()),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
})

export type CategoryFormValues = z.infer<typeof categorySchema>

interface CategoryFormProps {
  initialData?: CategoryDto | null
  onSuccess: (savedCategory: CategoryDto) => void
  onCancel: () => void
}

export function CategoryForm({
  initialData,
  onSuccess,
  onCancel,
}: CategoryFormProps) {
  const [allCategories, setAllCategories] = React.useState<CategoryDto[]>([])
  const [serverError, setServerError] = React.useState<string | null>(null)
  const isEditing = Boolean(initialData)

  React.useEffect(() => {
    categoriesApi
      .getAll()
      .then((cats) => {
        // Exclude self from parent options if editing
        if (initialData) {
          setAllCategories(cats.filter((c) => c.id !== initialData.id))
        } else {
          setAllCategories(cats)
        }
      })
      .catch(() => {
        // Non-blocking category load error
      })
  }, [initialData])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      code: initialData?.code ?? '',
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      parentId: initialData?.parentId ?? '',
    },
  })

  const onSubmit = async (values: CategoryFormValues) => {
    setServerError(null)
    try {
      if (isEditing && initialData) {
        const payload: UpdateCategoryPayload = {
          code: values.code,
          name: values.name,
          description: values.description || null,
          parentId: values.parentId || null,
        }
        const updated = await categoriesApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateCategoryPayload = {
          code: values.code,
          name: values.name,
          description: values.description || null,
          parentId: values.parentId || null,
        }
        const created = await categoriesApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError(isEditing ? 'Failed to update category' : 'Failed to create category')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Code */}
      <div className="space-y-1">
        <label htmlFor="category-code" className="text-xs font-medium text-foreground">
          Category Code <span className="text-destructive">*</span>
        </label>
        <input
          id="category-code"
          type="text"
          placeholder="e.g. CAT-ACTIVE-COMP"
          {...register('code')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground uppercase font-mono"
        />
        {errors.code && (
          <p className="text-xs text-destructive">{errors.code.message}</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label htmlFor="category-name" className="text-xs font-medium text-foreground">
          Category Name <span className="text-destructive">*</span>
        </label>
        <input
          id="category-name"
          type="text"
          placeholder="e.g. Active Electronic Components"
          {...register('name')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Parent Category */}
      <div className="space-y-1">
        <label htmlFor="category-parent" className="text-xs font-medium text-foreground">
          Parent Category
        </label>
        <select
          id="category-parent"
          {...register('parentId')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        >
          <option value="">None (Top-Level Root Category)</option>
          {allCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.code} - {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label htmlFor="category-desc" className="text-xs font-medium text-foreground">
          Description
        </label>
        <textarea
          id="category-desc"
          rows={3}
          placeholder="Detailed categorization description..."
          {...register('description')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground resize-none"
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Category'}
        </Button>
      </div>
    </form>
  )
}
