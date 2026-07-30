'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  locationsApi,
  type LocationDto,
  type CreateLocationPayload,
  type UpdateLocationPayload,
} from '@/lib/api/locations-api'

const locationSchema = z.object({
  code: z
    .string()
    .min(1, 'Location code is required')
    .transform((val) => val.trim().toUpperCase()),
  name: z.string().min(1, 'Location name is required').transform((val) => val.trim()),
  kind: z.string().min(1, 'Location kind is required'),
  parentId: z.string().optional().nullable(),
})

export type LocationFormValues = z.infer<typeof locationSchema>

interface LocationFormProps {
  initialData?: LocationDto | null
  locations?: LocationDto[]
  onSuccess: (savedLocation: LocationDto) => void
  onCancel: () => void
}

export function LocationForm({
  initialData,
  locations = [],
  onSuccess,
  onCancel,
}: LocationFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null)
  const isEditing = Boolean(initialData)

  const availableParents = React.useMemo(() => {
    if (!initialData) return locations
    return locations.filter((loc) => loc.id !== initialData.id)
  }, [locations, initialData])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      code: initialData?.code ?? '',
      name: initialData?.name ?? '',
      kind: initialData?.kind ?? 'warehouse',
      parentId: initialData?.parentId ?? '',
    },
  })

  const onSubmit = async (values: LocationFormValues) => {
    setServerError(null)
    try {
      if (isEditing && initialData) {
        const payload: UpdateLocationPayload = {
          code: values.code,
          name: values.name,
          kind: values.kind,
          parentId: values.parentId || null,
        }
        const updated = await locationsApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateLocationPayload = {
          code: values.code,
          name: values.name,
          kind: values.kind,
          parentId: values.parentId || null,
        }
        const created = await locationsApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError(isEditing ? 'Failed to update location' : 'Failed to create location')
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
        <label htmlFor="location-code" className="text-xs font-medium text-foreground">
          Location Code <span className="text-destructive">*</span>
        </label>
        <input
          id="location-code"
          type="text"
          placeholder="e.g. WH-A-01"
          {...register('code')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground uppercase"
        />
        {errors.code && (
          <p className="text-xs text-destructive">{errors.code.message}</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label htmlFor="location-name" className="text-xs font-medium text-foreground">
          Location Name <span className="text-destructive">*</span>
        </label>
        <input
          id="location-name"
          type="text"
          placeholder="e.g. Main Warehouse Row A"
          {...register('name')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Kind */}
      <div className="space-y-1">
        <label htmlFor="location-kind" className="text-xs font-medium text-foreground">
          Location Kind <span className="text-destructive">*</span>
        </label>
        <select
          id="location-kind"
          {...register('kind')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        >
          <option value="warehouse">Warehouse</option>
          <option value="aisle">Aisle</option>
          <option value="rack">Rack</option>
          <option value="shelf">Shelf</option>
          <option value="bin">Bin</option>
        </select>
        {errors.kind && (
          <p className="text-xs text-destructive">{errors.kind.message}</p>
        )}
      </div>

      {/* Parent Location */}
      <div className="space-y-1">
        <label htmlFor="location-parent" className="text-xs font-medium text-foreground">
          Parent Location
        </label>
        <select
          id="location-parent"
          {...register('parentId')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        >
          <option value="">None (Top Level)</option>
          {availableParents.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.code} - {loc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Location'}
        </Button>
      </div>
    </form>
  )
}
