'use client'

import * as React from 'react'
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, Plus, Trash2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  reservationsApi,
  type ReservationDto,
  type CreateReservationPayload,
  type UpdateReservationPayload,
  type ReservationType,
} from '@/lib/api/reservations-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

const lineSchema = z.object({
  componentId: z.string().min(1, 'Component item is required'),
  locationId: z.string().min(1, 'Warehouse location is required'),
  reservedQuantity: z.number().min(0.0001, 'Quantity must be greater than zero'),
  unitOfMeasure: z.string().optional(),
  notes: z.string().optional(),
})

const reservationSchema = z.object({
  reservationType: z.enum(['WORK_ORDER', 'PROJECT', 'PURCHASE_REQUEST', 'SALES_ORDER']),
  referenceDocument: z.string().optional(),
  reservedBy: z.string().min(1, 'Reserved By identity is required'),
  expiresAt: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one reserved line item is required'),
})

export type ReservationFormValues = z.infer<typeof reservationSchema>

interface ReservationFormProps {
  initialData?: ReservationDto | null
  onSuccess: (saved: ReservationDto) => void
  onCancel: () => void
}

export function ReservationForm({ initialData, onSuccess, onCancel }: ReservationFormProps) {
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
  } = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationSchema),
    defaultValues: initialData
      ? {
          reservationType: initialData.reservationType,
          referenceDocument: initialData.referenceDocument || '',
          reservedBy: initialData.reservedBy,
          expiresAt: initialData.expiresAt ? initialData.expiresAt.split('T')[0] : '',
          notes: initialData.notes || '',
          lines:
            initialData.lines.length > 0
              ? initialData.lines.map((l) => ({
                  componentId: l.componentId,
                  locationId: l.locationId,
                  reservedQuantity: l.reservedQuantity,
                  unitOfMeasure: l.unitOfMeasure || 'pcs',
                  notes: l.notes || '',
                }))
              : [{ componentId: '', locationId: '', reservedQuantity: 10, unitOfMeasure: 'pcs', notes: '' }],
        }
      : {
          reservationType: 'WORK_ORDER',
          referenceDocument: '',
          reservedBy: 'Production Planning Lead',
          expiresAt: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
          notes: '',
          lines: [{ componentId: '', locationId: '', reservedQuantity: 10, unitOfMeasure: 'pcs', notes: '' }],
        },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const onSubmit: SubmitHandler<ReservationFormValues> = async (values) => {
    setServerError(null)
    try {
      if (isEdit && initialData) {
        const payload: UpdateReservationPayload = {
          reservationType: values.reservationType as ReservationType,
          referenceDocument: values.referenceDocument || undefined,
          reservedBy: values.reservedBy,
          expiresAt: values.expiresAt || undefined,
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            locationId: l.locationId,
            reservedQuantity: Number(l.reservedQuantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        }
        const updated = await reservationsApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateReservationPayload = {
          reservationType: values.reservationType as ReservationType,
          referenceDocument: values.referenceDocument || undefined,
          reservedBy: values.reservedBy,
          expiresAt: values.expiresAt || undefined,
          notes: values.notes || undefined,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            locationId: l.locationId,
            reservedQuantity: Number(l.reservedQuantity),
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || undefined,
          })),
        }
        const created = await reservationsApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to submit Inventory Reservation')
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

      {/* Reservation Type & Reference Document */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="res-type"
            className="text-xs font-medium text-foreground"
          >
            Reservation Purpose / Type <span className="text-destructive">*</span>
          </label>
          <select
            id="res-type"
            {...register('reservationType')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          >
            <option value="WORK_ORDER">Work Order Commitment</option>
            <option value="PROJECT">Project Stock Allocation</option>
            <option value="PURCHASE_REQUEST">Purchase Request Reservation</option>
            <option value="SALES_ORDER">Sales Order Reservation</option>
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="res-ref"
            className="text-xs font-medium text-foreground"
          >
            Reference Document #
          </label>
          <input
            id="res-ref"
            type="text"
            placeholder="e.g. WO-2026-0012 or PRJ-BUILD-01"
            {...register('referenceDocument')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Reserved By & Expiration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor="res-by"
            className="text-xs font-medium text-foreground"
          >
            Reserved By <span className="text-destructive">*</span>
          </label>
          <input
            id="res-by"
            type="text"
            placeholder="e.g. Assembly Lead (Jane Doe)"
            {...register('reservedBy')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
          {errors.reservedBy && (
            <p className="text-xs text-destructive">{errors.reservedBy.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="res-expires"
            className="text-xs font-medium text-foreground"
          >
            Expiration Date (Lock Hold)
          </label>
          <input
            id="res-expires"
            type="date"
            {...register('expiresAt')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label
          htmlFor="res-notes"
          className="text-xs font-medium text-foreground"
        >
          Allocation Notes / Justification
        </label>
        <input
          id="res-notes"
          type="text"
          placeholder="e.g. Hold critical high-precision sensors for scheduled Work Order WO-2026-0012"
          {...register('notes')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        />
      </div>

      {/* Line Items Manager */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Reserved Line Items ({fields.length})
          </h3>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({ componentId: '', locationId: '', reservedQuantity: 10, unitOfMeasure: 'pcs', notes: '' })
            }
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Reserved Item
          </Button>
        </div>

        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[11px] text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
          <span>
            Reservations commit stock and reduce <strong>Available Quantity</strong>. On-hand inventory is modified only upon material fulfillment.
          </span>
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
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Component <span className="text-destructive">*</span>
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

              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Warehouse Location <span className="text-destructive">*</span>
                </label>
                <select
                  {...register(`lines.${idx}.locationId` as const)}
                  className="w-full px-2.5 py-1.5 text-xs bg-input/40 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                >
                  <option value="">Select warehouse location...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </option>
                  ))}
                </select>
                {errors.lines?.[idx]?.locationId && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.locationId?.message}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Reserved Qty <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min={0.0001}
                  {...register(`lines.${idx}.reservedQuantity` as const, {
                    valueAsNumber: true,
                  })}
                  className="w-full px-2.5 py-1.5 text-xs bg-input/40 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono font-bold"
                />
                {errors.lines?.[idx]?.reservedQuantity && (
                  <p className="text-[11px] text-destructive">
                    {errors.lines[idx]?.reservedQuantity?.message}
                  </p>
                )}
              </div>

              <div className="sm:col-span-1 space-y-1">
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
          {isEdit ? 'Save Changes' : 'Create Reservation'}
        </Button>
      </div>
    </form>
  )
}
