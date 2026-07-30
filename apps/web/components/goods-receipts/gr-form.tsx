'use client'

import * as React from 'react'
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  goodsReceiptsApi,
  type GoodsReceiptDto,
  type CreateGoodsReceiptPayload,
} from '@/lib/api/goods-receipts-api'
import { purchaseOrdersApi, type PurchaseOrderDto } from '@/lib/api/purchase-orders-api'
import { locationsApi, type LocationDto } from '@/lib/api/locations-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'

const grLineSchema = z.object({
  poLineId: z.string().min(1, 'PO line ID is required'),
  componentId: z.string().min(1, 'Component is required'),
  locationId: z.string().min(1, 'Destination location is required'),
  quantityReceived: z.number().min(1, 'Quantity received must be at least 1'),
  maxRemaining: z.number().min(0),
})

const grSchema = z.object({
  purchaseOrderId: z.string().min(1, 'Purchase Order selection is required'),
  packingSlipNumber: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  lines: z.array(grLineSchema).min(1, 'At least one line item must be received'),
})

export type GrFormValues = z.infer<typeof grSchema>

interface GoodsReceiptFormProps {
  onSuccess: (savedGr: GoodsReceiptDto) => void
  onCancel: () => void
}

export function GoodsReceiptForm({ onSuccess, onCancel }: GoodsReceiptFormProps) {
  const [openPos, setOpenPos] = React.useState<PurchaseOrderDto[]>([])
  const [locations, setLocations] = React.useState<LocationDto[]>([])
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [selectedPo, setSelectedPo] = React.useState<PurchaseOrderDto | null>(null)
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [loadingData, setLoadingData] = React.useState(true)

  React.useEffect(() => {
    Promise.all([
      purchaseOrdersApi.getAll(),
      locationsApi.getAll(),
      componentsApi.getAll().catch(() => []),
    ])
      .then(([pos, locs, comps]) => {
        // Filter POs in SUBMITTED, APPROVED, ISSUED, or PARTIALLY_RECEIVED states
        const eligible = pos.filter((p) =>
          ['SUBMITTED', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED'].includes(p.status),
        )
        setOpenPos(eligible)
        setLocations(locs)

        const map: Record<string, ComponentDto> = {}
        for (const c of comps) {
          map[c.id] = c
        }
        setComponentsMap(map)
      })
      .catch((err) => {
        setServerError(err instanceof Error ? err.message : 'Failed to load initial data')
      })
      .finally(() => setLoadingData(false))
  }, [])

  const defaultLocationId = locations[0]?.id || ''

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GrFormValues>({
    resolver: zodResolver(grSchema),
    defaultValues: {
      purchaseOrderId: '',
      packingSlipNumber: '',
      receivedAt: new Date().toISOString().split('T')[0],
      lines: [],
    },
  })

  const { fields, replace } = useFieldArray({
    control,
    name: 'lines',
  })

  const handlePoSelect = (poId: string) => {
    setValue('purchaseOrderId', poId)
    const found = openPos.find((p) => p.id === poId) || null
    setSelectedPo(found)

    if (found) {
      const receiveLines = found.lines
        .map((line) => {
          const remaining = line.quantityOrdered - line.quantityReceived
          return {
            poLineId: line.id,
            componentId: line.componentId,
            locationId: defaultLocationId,
            quantityReceived: Math.max(0, remaining),
            maxRemaining: remaining,
          }
        })
        .filter((l) => l.maxRemaining > 0)

      replace(receiveLines)
    } else {
      replace([])
    }
  }

  const watchedLines = watch('lines')
  const totalQuantityReceived = React.useMemo(() => {
    if (!watchedLines) return 0
    return watchedLines.reduce((acc, l) => acc + (Number(l.quantityReceived) || 0), 0)
  }, [watchedLines])

  const onSubmit: SubmitHandler<GrFormValues> = async (values) => {
    if (!selectedPo) return
    setServerError(null)

    // Client validation against remaining quantity
    for (const l of values.lines) {
      if (l.quantityReceived > l.maxRemaining) {
        setServerError(
          `Received quantity (${l.quantityReceived}) exceeds outstanding quantity (${l.maxRemaining}) for component.`,
        )
        return
      }
    }

    try {
      const payload: CreateGoodsReceiptPayload = {
        purchaseOrderId: values.purchaseOrderId,
        supplierId: selectedPo.supplierId,
        packingSlipNumber: values.packingSlipNumber || null,
        receivedAt: values.receivedAt ? new Date(values.receivedAt).toISOString() : null,
        lines: values.lines.map((l) => ({
          poLineId: l.poLineId,
          componentId: l.componentId,
          locationId: l.locationId,
          quantityReceived: Number(l.quantityReceived),
        })),
      }

      const created = await goodsReceiptsApi.create(payload)
      onSuccess(created)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to process Goods Receipt')
      }
    }
  }

  if (loadingData) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Loading purchase orders and location catalog...
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Select Purchase Order */}
      <div className="space-y-1">
        <label htmlFor="gr-po" className="text-xs font-medium text-foreground">
          Purchase Order <span className="text-destructive">*</span>
        </label>
        <select
          id="gr-po"
          onChange={(e) => handlePoSelect(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        >
          <option value="">Select an open Purchase Order...</option>
          {openPos.map((po) => (
            <option key={po.id} value={po.id}>
              {po.poNumber} — ({po.status}) {po.currency} {po.grandTotal.toFixed(2)}
            </option>
          ))}
        </select>
        {errors.purchaseOrderId && (
          <p className="text-xs text-destructive">{errors.purchaseOrderId.message}</p>
        )}
      </div>

      {/* Packing Slip & Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="gr-packing-slip" className="text-xs font-medium text-foreground">
            Packing Slip / Delivery Note #
          </label>
          <input
            id="gr-packing-slip"
            type="text"
            placeholder="e.g. PS-98765"
            {...register('packingSlipNumber')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground uppercase font-mono"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="gr-date" className="text-xs font-medium text-foreground">
            Receipt Date
          </label>
          <input
            id="gr-date"
            type="date"
            {...register('receivedAt')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Line Items Receiving Section */}
      {selectedPo && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Items to Receive <span className="text-destructive">*</span>
            </label>
            <span className="text-xs font-mono text-muted-foreground">
              Total Qty: {totalQuantityReceived} units
            </span>
          </div>

          {errors.lines?.root && (
            <p className="text-xs text-destructive">{errors.lines.root.message}</p>
          )}

          {fields.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {fields.map((field, index) => {
                const comp = componentsMap[field.componentId]
                return (
                  <div
                    key={field.id}
                    className="p-3 bg-muted/30 border border-border rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs font-medium border-b border-border/60 pb-1.5">
                      <span className="text-foreground">
                        {comp ? comp.name : field.componentId}{' '}
                        <span className="font-mono text-muted-foreground">({comp?.sku})</span>
                      </span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        Outstanding: {field.maxRemaining} {comp?.unit || 'units'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {/* Destination Location */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Destination Storage Location
                        </label>
                        <select
                          {...register(`lines.${index}.locationId`)}
                          className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground"
                        >
                          <option value="">Select location...</option>
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.code} - {loc.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity Received */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Qty Received (Max: {field.maxRemaining})
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={field.maxRemaining}
                          {...register(`lines.${index}.quantityReceived`, { valueAsNumber: true })}
                          className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic p-3 bg-muted/20 border border-border rounded-lg">
              All line items on this Purchase Order have already been fully received!
            </p>
          )}
        </div>
      )}

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting || fields.length === 0}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Receive & Post Stock
        </Button>
      </div>
    </form>
  )
}
