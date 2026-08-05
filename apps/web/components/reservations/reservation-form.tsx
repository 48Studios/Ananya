'use client'

import * as React from 'react'
import { useForm, useFieldArray, SubmitHandler, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, Plus, Trash2, Info } from 'lucide-react'
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
  reservationsApi,
  type ReservationDto,
  type CreateReservationPayload,
  type UpdateReservationPayload,
  type ReservationType,
} from '@/lib/api/reservations-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'

const reservationLineSchema = z.object({
  componentId: z.string().min(1, 'Component is required'),
  locationId: z.string().min(1, 'Location is required'),
  reservedQuantity: z.number().min(0.0001, 'Quantity must be greater than zero'),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  notes: z.string().optional().nullable(),
})

const reservationSchema = z.object({
  reservationType: z.enum(['WORK_ORDER', 'PROJECT', 'PURCHASE_REQUEST', 'SALES_ORDER']),
  referenceDocument: z.string().optional().nullable(),
  reservedBy: z.string().min(1, 'Reserved by identifier is required'),
  expiresAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(reservationLineSchema).min(1, 'At least one line item is required for reservation'),
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
          err instanceof Error ? err.message : 'Failed to load catalogs',
        )
      })
      .finally(() => setLoadingRef(false))
  }, [])

  const {
    register,
    control,
    handleSubmit,
    setValue,
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
          lines: initialData.lines.map((l) => ({
            componentId: l.componentId,
            locationId: l.locationId,
            reservedQuantity: l.reservedQuantity,
            unitOfMeasure: l.unitOfMeasure,
            notes: l.notes || '',
          })),
        }
      : {
          reservationType: 'WORK_ORDER',
          referenceDocument: '',
          reservedBy: 'OPERATIONS',
          expiresAt: '',
          notes: '',
          lines: [{ componentId: '', locationId: '', reservedQuantity: 10, unitOfMeasure: 'pcs', notes: '' }],
        },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const handleLineComponentChange = (idx: number, compId: string) => {
    setValue(`lines.${idx}.componentId`, compId)
    const comp = components.find((c) => c.id === compId)
    if (comp) {
      setValue(`lines.${idx}.unitOfMeasure`, comp.unit || 'pcs')
      if (comp.defaultLocationId) {
        setValue(`lines.${idx}.locationId`, comp.defaultLocationId)
      }
    }
  }

  const onSubmit: SubmitHandler<ReservationFormValues> = async (values) => {
    setServerError(null)
    try {
      const payloadBase = {
        reservationType: values.reservationType as ReservationType,
        referenceDocument: values.referenceDocument || undefined,
        reservedBy: values.reservedBy,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : undefined,
        notes: values.notes || undefined,
        lines: values.lines.map((l) => ({
          componentId: l.componentId,
          locationId: l.locationId,
          reservedQuantity: Number(l.reservedQuantity),
          unitOfMeasure: l.unitOfMeasure,
          notes: l.notes || undefined,
        })),
      }
      if (isEdit && initialData) {
        const updated = await reservationsApi.update(initialData.id, payloadBase as UpdateReservationPayload)
        onSuccess(updated)
      } else {
        const created = await reservationsApi.create(payloadBase as CreateReservationPayload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to submit inventory reservation')
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="res-type">
            Reservation Purpose / Type <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="reservationType"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="res-type">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORK_ORDER">Work Order Commitment</SelectItem>
                  <SelectItem value="PROJECT">Project Stock Allocation</SelectItem>
                  <SelectItem value="PURCHASE_REQUEST">Purchase Request Reservation</SelectItem>
                  <SelectItem value="SALES_ORDER">Sales Order Reservation</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="res-ref">Reference Document #</FieldLabel>
          <Input
            id="res-ref"
            type="text"
            placeholder="e.g. WO-2026-0012 or PRJ-BUILD-01"
            {...register('referenceDocument')}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="res-by">
            Reserved By <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="res-by"
            type="text"
            placeholder="e.g. Assembly Lead (Jane Doe)"
            {...register('reservedBy')}
          />
          {errors.reservedBy?.message && (
            <FieldError>{errors.reservedBy.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="res-expires">Expiration Date (Lock Hold)</FieldLabel>
          <Input
            id="res-expires"
            type="date"
            {...register('expiresAt')}
            className="font-mono"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="res-notes">Allocation Notes / Justification</FieldLabel>
        <Input
          id="res-notes"
          type="text"
          placeholder="e.g. Hold critical high-precision sensors for scheduled Work Order WO-2026-0012"
          {...register('notes')}
        />
      </Field>

      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Reserved Line Items ({fields.length})
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ componentId: '', locationId: '', reservedQuantity: 10, unitOfMeasure: 'pcs', notes: '' })
            }
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Item
          </Button>
        </div>

        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[11px] text-blue-800 dark:text-blue-200 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
          <span>
            Reservations commit stock and reduce <strong>Available Quantity</strong>.
          </span>
        </div>

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
                <Controller
                  name={`lines.${idx}.componentId` as const}
                  control={control}
                  render={({ field: compField }) => (
                    <Select
                      value={compField.value}
                      onValueChange={(val) => {
                        compField.onChange(val ?? '')
                        handleLineComponentChange(idx, val ?? '')
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select component..." />
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
                <Controller
                  name={`lines.${idx}.locationId` as const}
                  control={control}
                  render={({ field: locField }) => (
                    <Select
                      value={locField.value}
                      onValueChange={locField.onChange}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select warehouse location..." />
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
                <Input
                  type="number"
                  step="any"
                  min={0.0001}
                  {...register(`lines.${idx}.reservedQuantity` as const, {
                    valueAsNumber: true,
                  })}
                  className="h-8 text-xs font-mono font-bold"
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
                <Input
                  type="text"
                  {...register(`lines.${idx}.unitOfMeasure` as const)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="sm:col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={fields.length === 1}
                  onClick={() => remove(idx)}
                  className="text-destructive hover:bg-destructive/10 h-8 w-8"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Reservation'}
        </Button>
      </div>
    </form>
  )
}
