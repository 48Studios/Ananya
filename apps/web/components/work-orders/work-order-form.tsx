'use client'

import * as React from 'react'
import { useForm, SubmitHandler, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
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
  const [componentsMap, setComponentsMap] = React.useState<Map<string, ComponentDto>>(
    new Map(),
  )
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [loadingBoms, setLoadingBoms] = React.useState(false)

  const isEdit = Boolean(initialData)

  React.useEffect(() => {
    Promise.all([componentsApi.getAll(), locationsApi.getAll()])
      .then(([comps, locs]) => {
        setComponents(comps)
        setLocations(locs)

        const map = new Map<string, ComponentDto>()
        for (const c of comps) map.set(c.id, c)
        setComponentsMap(map)
      })
      .catch(() => {
        // Non-blocking load error
      })
  }, [])

  const {
    register,
    control,
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
        <Field>
          <FieldLabel htmlFor="wo-product">
            Finished Product <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="componentId"
            control={control}
            render={({ field }) => (
              <Select
                disabled={isEdit}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="wo-product">
                  <SelectValue placeholder="Select finished product..." />
                </SelectTrigger>
                <SelectContent>
                  {components.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.sku} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.componentId?.message && (
            <FieldError>{errors.componentId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="wo-bom">
            BOM Specification Revision <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="bomId"
            control={control}
            render={({ field }) => (
              <Select
                disabled={isEdit || loadingBoms || availableBoms.length === 0}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="wo-bom">
                  <SelectValue
                    placeholder={
                      loadingBoms
                        ? 'Loading BOMs...'
                        : availableBoms.length === 0
                          ? 'No BOMs found for product'
                          : 'Select BOM revision...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableBoms.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.revision} — Status: {b.status} ({b.lines.length} lines)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.bomId?.message && (
            <FieldError>{errors.bomId.message}</FieldError>
          )}
        </Field>
      </div>

      {/* Production Location & Quantity */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="wo-location">
            Target Production Location <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="locationId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="wo-location">
                  <SelectValue placeholder="Select production facility / warehouse..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.locationId?.message && (
            <FieldError>{errors.locationId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="wo-qty">
            Planned Quantity <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="wo-qty"
            type="number"
            min={1}
            {...register('quantityPlanned', { valueAsNumber: true })}
            className="font-mono font-bold"
          />
          {errors.quantityPlanned?.message && (
            <FieldError>{errors.quantityPlanned.message}</FieldError>
          )}
        </Field>
      </div>

      {/* Priority & Schedule Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <FieldLabel htmlFor="wo-priority">
            Job Priority <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="wo-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">LOW</SelectItem>
                  <SelectItem value="NORMAL">NORMAL</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                  <SelectItem value="URGENT">URGENT</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="wo-start">Planned Start Date</FieldLabel>
          <Input
            id="wo-start"
            type="date"
            {...register('startDate')}
            className="font-mono"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="wo-end">Planned Completion Date</FieldLabel>
          <Input
            id="wo-end"
            type="date"
            {...register('endDate')}
            className="font-mono"
          />
        </Field>
      </div>

      {/* Notes */}
      <Field>
        <FieldLabel htmlFor="wo-notes">Work Order Instructions / Notes</FieldLabel>
        <Input
          id="wo-notes"
          type="text"
          placeholder="e.g. Expedited customer production job for Batch WO-2026-A"
          {...register('notes')}
        />
      </Field>

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
              const comp = componentsMap.get(line.componentId)
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

