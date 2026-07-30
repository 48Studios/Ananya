'use client'

import * as React from 'react'
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  cycleCountsApi,
  type CycleCountDto,
  type CreateCycleCountPayload,
  type UpdateCycleCountPayload,
} from '@/lib/api/cycle-counts-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

const lineSchema = z.object({
  componentId: z.string().min(1, 'Component item selection is required'),
  systemQuantity: z.number().min(0, 'System quantity cannot be negative'),
  unitOfMeasure: z.string().optional(),
  notes: z.string().optional(),
})

const cycleCountSchema = z.object({
  locationId: z.string().min(1, 'Counting location is required'),
  assignedCounter: z.string().optional(),
  scheduledDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one component line item is required'),
})

export type CycleCountFormValues = z.infer<typeof cycleCountSchema>

interface CycleCountFormProps {
  initialData?: CycleCountDto | null
  onSuccess: (saved: CycleCountDto) => void
  onCancel: () => void
}

export function CycleCountForm({ initialData, onSuccess, onCancel }: CycleCountFormProps) {
  const [components, setComponents] = React.useState<ComponentDto[]>([])
  const [locations, setLocations] = React.useState<LocationDto[]>([])
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [loadingRef, setLoadingRef] = React.useState(true)

  const isEdit = Boolean(initialData)

  React.useEffect(() => {
    Promise.all([componentsApi.getAll(), locationsApi.getAll()])
      .then(([comps, locs]) => {
        setComponents(comps)
        setLocations(locs)
      })
      .catch((err) => {
        setServerError(
          err instanceof Error ? err.message : 'Failed to load reference catalogs',
        )
      })
      .finally(() => setLoadingRef(false))
  }, [])

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CycleCountFormValues>({
    resolver: zodResolver(cycleCountSchema),
    defaultValues: initialData
      ? {
          locationId: initialData.locationId,
          assignedCounter: initialData.assignedCounter || '',
          scheduledDate: initialData.scheduledDate
            ? initialData.scheduledDate.split('T')[0]
            : '',
          notes: initialData.notes || '',
          lines:
            initialData.lines.length > 0
              ? initialData.lines.map((l) => ({
                  componentId: l.componentId,
                  systemQuantity: l.systemQuantity,
                  unitOfMeasure: l.unitOfMeasure || 'pcs',
                  notes: l.notes || '',
                }))
              : [{ componentId: '', systemQuantity: 100, unitOfMeasure: 'pcs', notes: '' }],
        }
      : {
          locationId: '',
          assignedCounter: 'Warehouse Counter Specialist',
          scheduledDate: new Date().toISOString().split('T')[0],
          notes: '',
          lines: [{ componentId: '', systemQuantity: 100, unitOfMeasure: 'pcs', notes: '' }],
        },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const onSubmit: SubmitHandler<CycleCountFormValues> = async (values) => {
    setServerError(null)
    try {
      if (isEdit && initialData) {
        const payload: UpdateCycleCountPayload = {
          locationId: values.locationId,
          assignedCounter: values.assignedCounter || undefined,
          scheduledDate: values.scheduledDate || undefined,
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            systemQuantity: Number(l.systemQuantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        }
        const updated = await cycleCountsApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateCycleCountPayload = {
          locationId: values.locationId,
          assignedCounter: values.assignedCounter || undefined,
          scheduledDate: values.scheduledDate || undefined,
          createdBy: 'ADMIN',
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            systemQuantity: Number(l.systemQuantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        }
        const created = await cycleCountsApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to submit Cycle Count')
      }
    }
  }

  if (loadingRef) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Loading components and location catalogs...
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Location & Assigned User */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="count-loc"
            className="text-xs font-medium text-foreground"
          >
            Counting Facility / Location <span className="text-destructive">*</span>
          </label>
          <select
            id="count-loc"
            {...register('locationId')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          >
            <option value="">Select facility location...</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.code} — {loc.name}
              </option>
            ))}
          </select>
          {errors.locationId && (
            <p className="text-xs text-destructive">{errors.locationId.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="count-user"
            className="text-xs font-medium text-foreground"
          >
            Assigned Counter / User
          </label>
          <input
            id="count-user"
            type="text"
            placeholder="e.g. John Doe (Counter Lead)"
            {...register('assignedCounter')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Date & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="count-date"
            className="text-xs font-medium text-foreground"
          >
            Scheduled Count Date
          </label>
          <input
            id="count-date"
            type="date"
            {...register('scheduledDate')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="count-notes"
            className="text-xs font-medium text-foreground"
          >
            Count Notes / Audit Scope
          </label>
          <input
            id="count-notes"
            type="text"
            placeholder="e.g. Monthly A-class component verification count"
            {...register('notes')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Line Items Manager */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Counting Component Scope ({fields.length} Items)
          </h3>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({ componentId: '', systemQuantity: 100, unitOfMeasure: 'pcs', notes: '' })
            }
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Item
          </Button>
        </div>

        {errors.lines?.root && (
          <p className="text-xs text-destructive">{errors.lines.root.message}</p>
        )}

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="p-3 bg-muted/20 border border-border rounded-lg grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-6 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Item #{idx + 1} Component <span className="text-destructive">*</span>
                </label>
                <select
                  {...register(`lines.${idx}.componentId` as const)}
                  className="w-full px-2.5 py-1.5 text-xs bg-input/40 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="">Select component...</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} — {c.name}
                    </option>
                  ))}
                </select>
                {errors.lines?.[idx]?.componentId && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.componentId?.message}
                  </p>
                )}
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Expected System Qty <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  {...register(`lines.${idx}.systemQuantity` as const, {
                    valueAsNumber: true,
                  })}
                  className="w-full px-2.5 py-1.5 text-xs bg-input/40 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono font-bold"
                />
                {errors.lines?.[idx]?.systemQuantity && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.systemQuantity?.message}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Unit
                </label>
                <input
                  type="text"
                  {...register(`lines.${idx}.unitOfMeasure` as const)}
                  className="w-full px-2.5 py-1.5 text-xs bg-input/40 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={fields.length === 1}
                  onClick={() => remove(idx)}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
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
          {isEdit ? 'Save Changes' : 'Create Cycle Count'}
        </Button>
      </div>
    </form>
  )
}
