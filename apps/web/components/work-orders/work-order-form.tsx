'use client'

import * as React from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  workOrdersApi,
  type WorkOrderDto,
  type CreateWorkOrderPayload,
  type UpdateWorkOrderPayload,
  type WorkOrderPriority,
} from '@/lib/api/work-orders-api'
import { bomsApi, type BillOfMaterialsDto } from '@/lib/api/boms-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

const workOrderSchema = z.object({
  componentId: z.string().min(1, 'Finished product selection is required'),
  bomId: z.string().min(1, 'BOM specification selection is required'),
  locationId: z.string().min(1, 'Target production location is required'),
  quantityPlanned: z.number().min(1, 'Planned quantity must be at least 1 unit'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export type WorkOrderFormValues = z.infer<typeof workOrderSchema>

interface WorkOrderFormProps {
  initialData?: WorkOrderDto | null
  onSuccess: (savedWo: WorkOrderDto) => void
  onCancel: () => void
}

export function WorkOrderForm({ initialData, onSuccess, onCancel }: WorkOrderFormProps) {
  const [components, setComponents] = React.useState<ComponentDto[]>([])
  const [availableBoms, setAvailableBoms] = React.useState<BillOfMaterialsDto[]>([])
  const [locations, setLocations] = React.useState<LocationDto[]>([])
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [loadingRef, setLoadingRef] = React.useState(true)
  const [loadingBoms, setLoadingBoms] = React.useState(false)

  const isEdit = Boolean(initialData)

  React.useEffect(() => {
    Promise.all([componentsApi.getAll(), locationsApi.getAll()])
      .then(([comps, locs]) => {
        setComponents(comps)
        setLocations(locs)

        const map: Record<string, ComponentDto> = {}
        for (const c of comps) map[c.id] = c
        setComponentsMap(map)
      })
      .catch((err) => {
        setServerError(err instanceof Error ? err.message : 'Failed to load reference catalogs')
      })
      .finally(() => setLoadingRef(false))
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: initialData
      ? {
          componentId: initialData.componentId,
          bomId: initialData.bomId,
          locationId: initialData.locationId || '',
          quantityPlanned: initialData.quantityPlanned,
          priority: initialData.priority || 'NORMAL',
          startDate: initialData.startDate ? initialData.startDate.split('T')[0] : '',
          endDate: initialData.endDate ? initialData.endDate.split('T')[0] : '',
          notes: initialData.notes || '',
        }
      : {
          componentId: '',
          bomId: '',
          locationId: '',
          quantityPlanned: 10,
          priority: 'NORMAL',
          startDate: '',
          endDate: '',
          notes: '',
        },
  })

  const selectedComponentId = watch('componentId')
  const selectedBomId = watch('bomId')
  const plannedQty = watch('quantityPlanned') || 1

  // Fetch available BOMs when selected component changes
  React.useEffect(() => {
    if (!selectedComponentId) {
      setAvailableBoms([])
      return
    }

    setLoadingBoms(true)
    bomsApi
      .getRevisions(selectedComponentId)
      .then((boms) => {
        setAvailableBoms(boms)
        if (!isEdit && boms.length > 0) {
          // Auto-select released or latest BOM
          const released = boms.find((b) => b.status === 'RELEASED')
          setValue('bomId', released ? released.id : boms[0]?.id || '')
        }
      })
      .catch(() => setAvailableBoms([]))
      .finally(() => setLoadingBoms(false))
  }, [selectedComponentId, isEdit, setValue])

  const selectedBom = React.useMemo(
    () => availableBoms.find((b) => b.id === selectedBomId),
    [availableBoms, selectedBomId],
  )

  const onSubmit: SubmitHandler<WorkOrderFormValues> = async (values) => {
    setServerError(null)
    try {
      if (isEdit && initialData) {
        const payload: UpdateWorkOrderPayload = {
          locationId: values.locationId,
          quantityPlanned: Number(values.quantityPlanned),
          priority: values.priority as WorkOrderPriority,
          startDate: values.startDate || undefined,
          endDate: values.endDate || undefined,
          notes: values.notes || undefined,
        }
        const updated = await workOrdersApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateWorkOrderPayload = {
          componentId: values.componentId,
          bomId: values.bomId,
          locationId: values.locationId,
          quantityPlanned: Number(values.quantityPlanned),
          priority: values.priority as WorkOrderPriority,
          startDate: values.startDate || undefined,
          endDate: values.endDate || undefined,
          notes: values.notes || undefined,
          createdBy: 'ADMIN',
        }
        const created = await workOrdersApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to submit Work Order')
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

      {/* Finished Product & BOM Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="wo-product" className="text-xs font-medium text-foreground">
            Finished Product <span className="text-destructive">*</span>
          </label>
          <select
            id="wo-product"
            disabled={isEdit}
            {...register('componentId')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground disabled:opacity-60"
          >
            <option value="">Select finished product...</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sku} — {c.name}
              </option>
            ))}
          </select>
          {errors.componentId && (
            <p className="text-xs text-destructive">{errors.componentId.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="wo-bom" className="text-xs font-medium text-foreground">
            BOM Specification Revision <span className="text-destructive">*</span>
          </label>
          <select
            id="wo-bom"
            disabled={isEdit || loadingBoms || availableBoms.length === 0}
            {...register('bomId')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground disabled:opacity-60 font-mono"
          >
            <option value="">
              {loadingBoms
                ? 'Loading BOMs...'
                : availableBoms.length === 0
                  ? 'No BOMs found for product'
                  : 'Select BOM revision...'}
            </option>
            {availableBoms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.revision} — Status: {b.status} ({b.lines.length} lines)
              </option>
            ))}
          </select>
          {errors.bomId && (
            <p className="text-xs text-destructive">{errors.bomId.message}</p>
          )}
        </div>
      </div>

      {/* Production Location & Quantity */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <label htmlFor="wo-location" className="text-xs font-medium text-foreground">
            Target Production Location <span className="text-destructive">*</span>
          </label>
          <select
            id="wo-location"
            {...register('locationId')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          >
            <option value="">Select production facility / warehouse...</option>
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
          <label htmlFor="wo-qty" className="text-xs font-medium text-foreground">
            Planned Quantity <span className="text-destructive">*</span>
          </label>
          <input
            id="wo-qty"
            type="number"
            min={1}
            {...register('quantityPlanned', { valueAsNumber: true })}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono font-bold"
          />
          {errors.quantityPlanned && (
            <p className="text-xs text-destructive">{errors.quantityPlanned.message}</p>
          )}
        </div>
      </div>

      {/* Priority & Schedule Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label htmlFor="wo-priority" className="text-xs font-medium text-foreground">
            Job Priority <span className="text-destructive">*</span>
          </label>
          <select
            id="wo-priority"
            {...register('priority')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          >
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="wo-start" className="text-xs font-medium text-foreground">
            Planned Start Date
          </label>
          <input
            id="wo-start"
            type="date"
            {...register('startDate')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="wo-end" className="text-xs font-medium text-foreground">
            Planned Completion Date
          </label>
          <input
            id="wo-end"
            type="date"
            {...register('endDate')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label htmlFor="wo-notes" className="text-xs font-medium text-foreground">
          Work Order Instructions / Notes
        </label>
        <input
          id="wo-notes"
          type="text"
          placeholder="e.g. Expedited customer production job for Batch WO-2026-A"
          {...register('notes')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        />
      </div>

      {/* Live BOM Derived Material Requirements Preview */}
      {selectedBom && selectedBom.lines.length > 0 && (
        <div className="p-3 bg-muted/30 border border-border rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              Calculated Material Consumption (BOM {selectedBom.revision})
            </span>
            <span className="text-[11px] text-muted-foreground">
              For {plannedQty} units planned
            </span>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
            {selectedBom.lines.map((line) => {
              const comp = componentsMap[line.componentId]
              const grossQty =
                plannedQty *
                line.quantityPerUnit *
                (1 + line.scrapFactorPercent / 100)
              const roundedQty = Math.round(grossQty * 1000) / 1000

              return (
                <div
                  key={line.id}
                  className="flex items-center justify-between p-1.5 bg-card border border-border rounded text-[11px]"
                >
                  <span className="font-medium text-foreground">
                    {comp ? comp.name : line.componentId}{' '}
                    {comp && <span className="text-muted-foreground font-mono">({comp.sku})</span>}
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {roundedQty} {line.unitOfMeasure}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Work Order'}
        </Button>
      </div>
    </form>
  )
}
