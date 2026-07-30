'use client'

import * as React from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { workOrdersApi, type WorkOrderDto } from '@/lib/api/work-orders-api'

const recordOutputSchema = z.object({
  producedQuantity: z
    .number()
    .min(1, 'Produced quantity must be at least 1 unit'),
  scrappedQuantity: z
    .number()
    .min(0, 'Scrapped quantity cannot be negative')
    .optional(),
  notes: z.string().optional(),
})

export type RecordOutputFormValues = z.infer<typeof recordOutputSchema>

interface RecordOutputModalProps {
  isOpen: boolean
  workOrder: WorkOrderDto
  onSuccess: (updated: WorkOrderDto) => void
  onClose: () => void
}

export function RecordOutputModal({
  isOpen,
  workOrder,
  onSuccess,
  onClose,
}: RecordOutputModalProps) {
  const [serverError, setServerError] = React.useState<string | null>(null)

  const remainingUnits = Math.max(
    0,
    workOrder.quantityPlanned - workOrder.quantityCompleted,
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordOutputFormValues>({
    resolver: zodResolver(recordOutputSchema),
    defaultValues: {
      producedQuantity: remainingUnits > 0 ? remainingUnits : 1,
      scrappedQuantity: 0,
      notes: '',
    },
  })

  if (!isOpen) return null

  const onSubmit: SubmitHandler<RecordOutputFormValues> = async (values) => {
    setServerError(null)
    try {
      const updated = await workOrdersApi.recordPartialOutput(workOrder.id, {
        producedQuantity: Number(values.producedQuantity),
        scrappedQuantity: values.scrappedQuantity
          ? Number(values.scrappedQuantity)
          : 0,
        notes: values.notes || undefined,
      })
      onSuccess(updated)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to record production output batch')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-foreground">
              Record Finished Goods Output
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Work Order <span className="font-mono font-bold text-foreground">{workOrder.productionNumber}</span> — {remainingUnits} units remaining out of {workOrder.quantityPlanned} planned.
        </p>

        {serverError && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="produced-qty"
              className="text-xs font-medium text-foreground"
            >
              Batch Yield Quantity (Units) <span className="text-destructive">*</span>
            </label>
            <input
              id="produced-qty"
              type="number"
              min={1}
              {...register('producedQuantity', { valueAsNumber: true })}
              className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono font-bold"
            />
            {errors.producedQuantity && (
              <p className="text-xs text-destructive">
                {errors.producedQuantity.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="scrapped-qty"
              className="text-xs font-medium text-foreground"
            >
              Scrapped Quantity (If Damaged)
            </label>
            <input
              id="scrapped-qty"
              type="number"
              min={0}
              {...register('scrappedQuantity', { valueAsNumber: true })}
              className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono"
            />
            {errors.scrappedQuantity && (
              <p className="text-xs text-destructive">
                {errors.scrappedQuantity.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="run-notes"
              className="text-xs font-medium text-foreground"
            >
              Run Notes / Batch Code
            </label>
            <input
              id="run-notes"
              type="text"
              placeholder="e.g. Morning Shift Run #2 completed"
              {...register('notes')}
              className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              Record Output & Issue Materials
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
