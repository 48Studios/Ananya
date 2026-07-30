'use client'

import * as React from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
  type CreatePurchaseOrderPayload,
  type UpdatePurchaseOrderPayload,
} from '@/lib/api/purchase-orders-api'
import { suppliersApi, type SupplierDto } from '@/lib/api/suppliers-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'

const poLineSchema = z.object({
  componentId: z.string().min(1, 'Component is required'),
  vendorPartNumber: z.string().optional().nullable(),
  quantityOrdered: z.number().min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit price cannot be negative'),
  taxRate: z.number().min(0, 'Tax rate cannot be negative'),
})

const poSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  currency: z.string().min(1, 'Currency is required'),
  expectedDeliveryDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(poLineSchema).min(1, 'At least one line item is required'),
})

export type PoFormValues = z.infer<typeof poSchema>

interface PurchaseOrderFormProps {
  initialData?: PurchaseOrderDto | null
  onSuccess: (savedPo: PurchaseOrderDto) => void
  onCancel: () => void
}

export function PurchaseOrderForm({
  initialData,
  onSuccess,
  onCancel,
}: PurchaseOrderFormProps) {
  const [suppliers, setSuppliers] = React.useState<SupplierDto[]>([])
  const [availableComponents, setAvailableComponents] = React.useState<ComponentDto[]>([])
  const [serverError, setServerError] = React.useState<string | null>(null)
  const isEditing = Boolean(initialData)

  React.useEffect(() => {
    Promise.all([suppliersApi.getAll(), componentsApi.getAll()])
      .then(([sups, comps]) => {
        setSuppliers(sups)
        setAvailableComponents(comps)
      })
      .catch(() => {
        // Non-blocking lookup load
      })
  }, [])

  const initialLines = React.useMemo(() => {
    if (initialData?.lines && initialData.lines.length > 0) {
      return initialData.lines.map((l) => ({
        componentId: l.componentId,
        vendorPartNumber: l.vendorPartNumber ?? '',
        quantityOrdered: l.quantityOrdered,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      }))
    }
    return [
      {
        componentId: '',
        vendorPartNumber: '',
        quantityOrdered: 1,
        unitPrice: 0,
        taxRate: 0,
      },
    ]
  }, [initialData])

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PoFormValues>({
    resolver: zodResolver(poSchema),
    defaultValues: {
      supplierId: initialData?.supplierId ?? '',
      currency: initialData?.currency ?? 'USD',
      expectedDeliveryDate: initialData?.expectedDeliveryDate
        ? new Date(initialData.expectedDeliveryDate).toISOString().split('T')[0]
        : '',
      notes: initialData?.notes ?? '',
      lines: initialLines,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const watchedLines = watch('lines')
  const watchedCurrency = watch('currency') || 'USD'

  const totals = React.useMemo(() => {
    let subtotal = 0
    let taxTotal = 0
    if (watchedLines) {
      for (const line of watchedLines) {
        const qty = Number(line.quantityOrdered) || 0
        const price = Number(line.unitPrice) || 0
        const tax = Number(line.taxRate) || 0
        const base = qty * price
        subtotal += base
        taxTotal += base * (tax / 100)
      }
    }
    return {
      subtotal,
      taxTotal,
      grandTotal: subtotal + taxTotal,
    }
  }, [watchedLines])

  const onSubmit = async (values: PoFormValues) => {
    setServerError(null)
    try {
      if (isEditing && initialData) {
        const payload: UpdatePurchaseOrderPayload = {
          notes: values.notes || null,
          expectedDeliveryDate: values.expectedDeliveryDate
            ? new Date(values.expectedDeliveryDate).toISOString()
            : null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            vendorPartNumber: l.vendorPartNumber || null,
            quantityOrdered: Number(l.quantityOrdered) || 1,
            unitPrice: Number(l.unitPrice) || 0,
            taxRate: Number(l.taxRate) || 0,
          })),
        }
        const updated = await purchaseOrdersApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreatePurchaseOrderPayload = {
          supplierId: values.supplierId,
          currency: values.currency,
          notes: values.notes || null,
          expectedDeliveryDate: values.expectedDeliveryDate
            ? new Date(values.expectedDeliveryDate).toISOString()
            : null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            vendorPartNumber: l.vendorPartNumber || null,
            quantityOrdered: Number(l.quantityOrdered) || 1,
            unitPrice: Number(l.unitPrice) || 0,
            taxRate: Number(l.taxRate) || 0,
          })),
        }
        const created = await purchaseOrdersApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError(isEditing ? 'Failed to update Purchase Order' : 'Failed to create Purchase Order')
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

      {/* Supplier & Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="po-supplier" className="text-xs font-medium text-foreground">
            Supplier <span className="text-destructive">*</span>
          </label>
          <select
            id="po-supplier"
            disabled={isEditing}
            {...register('supplierId')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground disabled:opacity-60"
          >
            <option value="">Select Supplier...</option>
            {suppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.code} - {sup.name}
              </option>
            ))}
          </select>
          {errors.supplierId && (
            <p className="text-xs text-destructive">{errors.supplierId.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="po-currency" className="text-xs font-medium text-foreground">
            Currency <span className="text-destructive">*</span>
          </label>
          <input
            id="po-currency"
            type="text"
            placeholder="e.g. USD"
            {...register('currency')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground uppercase font-mono"
          />
        </div>
      </div>

      {/* Expected Delivery Date & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="po-delivery-date" className="text-xs font-medium text-foreground">
            Expected Delivery Date
          </label>
          <input
            id="po-delivery-date"
            type="date"
            {...register('expectedDeliveryDate')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="po-notes" className="text-xs font-medium text-foreground">
            Notes / Reference
          </label>
          <input
            id="po-notes"
            type="text"
            placeholder="Order terms or PO notes..."
            {...register('notes')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
      </div>

      {/* Line Items Editor Section */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Line Items <span className="text-destructive">*</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({
                componentId: '',
                vendorPartNumber: '',
                quantityOrdered: 1,
                unitPrice: 0,
                taxRate: 0,
              })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Line Item
          </Button>
        </div>

        {errors.lines?.root && (
          <p className="text-xs text-destructive">{errors.lines.root.message}</p>
        )}

        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="p-3 bg-muted/30 border border-border rounded-lg space-y-2 relative"
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                {/* Component Select */}
                <div className="sm:col-span-5 space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Component
                  </label>
                  <select
                    {...register(`lines.${index}.componentId`)}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground"
                  >
                    <option value="">Select component...</option>
                    {availableComponents.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.sku} - {comp.name} ({comp.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Qty */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Qty</label>
                  <input
                    type="number"
                    min={1}
                    {...register(`lines.${index}.quantityOrdered`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                  />
                </div>

                {/* Unit Price */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Price ({watchedCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    {...register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                  />
                </div>

                {/* Tax Rate % */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">Tax %</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    {...register(`lines.${index}.taxRate`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                  />
                </div>

                {/* Delete Line */}
                <div className="sm:col-span-1 flex items-center justify-end pb-1">
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                      title="Remove line item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-time Order Summary Totals */}
      <div className="p-3 bg-muted/40 border border-border rounded-lg flex items-center justify-between text-xs font-mono">
        <div>
          <span className="text-muted-foreground">Subtotal: </span>
          <span className="font-semibold text-foreground mr-4">
            {watchedCurrency} {totals.subtotal.toFixed(2)}
          </span>
          <span className="text-muted-foreground">Tax: </span>
          <span className="font-semibold text-foreground">
            {watchedCurrency} {totals.taxTotal.toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Grand Total: </span>
          <span className="text-sm font-bold text-foreground">
            {watchedCurrency} {totals.grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Purchase Order'}
        </Button>
      </div>
    </form>
  )
}
