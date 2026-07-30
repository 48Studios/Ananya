'use client'

import * as React from 'react'
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  stockAdjustmentsApi,
  type StockAdjustmentDto,
  type CreateStockAdjustmentPayload,
} from '@/lib/api/stock-adjustments-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'

const lineSchema = z.object({
  componentId: z.string().min(1, 'Component selection is required'),
  currentQuantity: z.number().min(0, 'Current quantity cannot be negative'),
  countedQuantity: z.number().min(0, 'Counted quantity cannot be negative'),
  unitOfMeasure: z.string(),
})

const adjustmentSchema = z.object({
  locationId: z.string().min(1, 'Location selection is required'),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'At least one line item must be added'),
})

export type AdjustmentFormValues = z.infer<typeof adjustmentSchema>

const STANDARD_REASONS = [
  'Cycle Count Discrepancy',
  'Damaged / Expired Goods',
  'Supplier Shortage',
  'Internal Transfer Error',
  'System Reconciliation / Initial Balance',
  'Other',
]

interface StockAdjustmentFormProps {
  onSuccess: (savedAdj: StockAdjustmentDto) => void
  onCancel: () => void
}

export function StockAdjustmentForm({ onSuccess, onCancel }: StockAdjustmentFormProps) {
  const [locations, setLocations] = React.useState<LocationDto[]>([])
  const [components, setComponents] = React.useState<ComponentDto[]>([])
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [loadingData, setLoadingData] = React.useState(true)

  React.useEffect(() => {
    Promise.all([locationsApi.getAll(), componentsApi.getAll()])
      .then(([locs, comps]) => {
        setLocations(locs)
        setComponents(comps)

        const map: Record<string, ComponentDto> = {}
        for (const c of comps) map[c.id] = c
        setComponentsMap(map)
      })
      .catch((err) => {
        setServerError(err instanceof Error ? err.message : 'Failed to load reference data')
      })
      .finally(() => setLoadingData(false))
  }, [])

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      locationId: '',
      reason: 'Cycle Count Discrepancy',
      notes: '',
      lines: [
        {
          componentId: '',
          currentQuantity: 0,
          countedQuantity: 0,
          unitOfMeasure: 'pcs',
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const handleComponentSelect = (index: number, componentId: string) => {
    setValue(`lines.${index}.componentId`, componentId)
    const comp = componentsMap[componentId]
    if (comp) {
      setValue(`lines.${index}.unitOfMeasure`, comp.unit || 'pcs')
    }
  }

  const watchedLines = watch('lines')

  const onSubmit: SubmitHandler<AdjustmentFormValues> = async (values) => {
    setServerError(null)
    try {
      const payload: CreateStockAdjustmentPayload = {
        locationId: values.locationId,
        reason: values.reason,
        notes: values.notes || null,
        createdBy: 'ADMIN',
        lines: values.lines.map((l) => ({
          componentId: l.componentId,
          currentQuantity: Number(l.currentQuantity),
          countedQuantity: Number(l.countedQuantity),
          unitOfMeasure: l.unitOfMeasure,
        })),
      }

      const created = await stockAdjustmentsApi.create(payload)
      onSuccess(created)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to submit Stock Adjustment')
      }
    }
  }

  if (loadingData) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Loading locations and components catalog...
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

      {/* Storage Location */}
      <div className="space-y-1">
        <label htmlFor="adj-location" className="text-xs font-medium text-foreground">
          Target Storage Location <span className="text-destructive">*</span>
        </label>
        <select
          id="adj-location"
          {...register('locationId')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        >
          <option value="">Select location...</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.code} - {loc.name}
            </option>
          ))}
        </select>
        {errors.locationId && (
          <p className="text-xs text-destructive">{errors.locationId.message}</p>
        )}
      </div>

      {/* Reason & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="adj-reason" className="text-xs font-medium text-foreground">
            Adjustment Reason <span className="text-destructive">*</span>
          </label>
          <select
            id="adj-reason"
            {...register('reason')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          >
            {STANDARD_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="adj-notes" className="text-xs font-medium text-foreground">
            Notes / Reference Details
          </label>
          <input
            id="adj-notes"
            type="text"
            placeholder="e.g. Approved during quarterly physical count"
            {...register('notes')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Line Items Section */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Reconciliation Line Items <span className="text-destructive">*</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({
                componentId: '',
                currentQuantity: 0,
                countedQuantity: 0,
                unitOfMeasure: 'pcs',
              })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
          </Button>
        </div>

        {errors.lines?.root && (
          <p className="text-xs text-destructive">{errors.lines.root.message}</p>
        )}

        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {fields.map((field, index) => {
            const current = Number(watchedLines[index]?.currentQuantity) || 0
            const counted = Number(watchedLines[index]?.countedQuantity) || 0
            const diff = counted - current

            return (
              <div
                key={field.id}
                className="p-3 bg-muted/30 border border-border rounded-lg space-y-2 relative"
              >
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Component Select */}
                <div className="space-y-1 pr-6">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Component
                  </label>
                  <select
                    onChange={(e) => handleComponentSelect(index, e.target.value)}
                    value={watchedLines[index]?.componentId || ''}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground"
                  >
                    <option value="">Select component...</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sku} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantities & Preview Grid */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Current Stock
                    </label>
                    <input
                      type="number"
                      min={0}
                      {...register(`lines.${index}.currentQuantity`, { valueAsNumber: true })}
                      className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Counted Stock
                    </label>
                    <input
                      type="number"
                      min={0}
                      {...register(`lines.${index}.countedQuantity`, { valueAsNumber: true })}
                      className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Difference
                    </label>
                    <div className="px-2 py-1.5 text-xs font-mono font-bold rounded border border-border flex items-center justify-between bg-card">
                      <span>{diff > 0 ? `+${diff}` : diff}</span>
                      {diff > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Increase
                        </span>
                      )}
                      {diff < 0 && (
                        <span className="text-[10px] text-rose-600 dark:text-rose-400">
                          Decrease
                        </span>
                      )}
                      {diff === 0 && (
                        <span className="text-[10px] text-muted-foreground">No Change</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Submit Adjustment for Approval
        </Button>
      </div>
    </form>
  )
}
