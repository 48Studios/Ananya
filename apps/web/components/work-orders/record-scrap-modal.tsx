'use client'

import * as React from 'react'
import { useForm, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { workOrdersApi, type WorkOrderDto, type MaterialRequirementDetailDto } from '@/lib/api/work-orders-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'

const recordScrapSchema = z.object({
  componentId: z.string().min(1, 'Please select a component or finished product'),
  quantity: z.number().min(0.0001, 'Quantity must be greater than zero'),
  reason: z.string().min(2, 'Reason is required for scrap recording'),
})

export type RecordScrapFormValues = z.infer<typeof recordScrapSchema>

interface RecordScrapModalProps {
  isOpen: boolean
  workOrder: WorkOrderDto
  materials: MaterialRequirementDetailDto[]
  onSuccess: (updated: WorkOrderDto) => void
  onClose: () => void
}

export function RecordScrapModal({
  isOpen,
  workOrder,
  materials,
  onSuccess,
  onClose,
}: RecordScrapModalProps) {
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [serverError, setServerError] = React.useState<string | null>(null)

  React.useEffect(() => {
    componentsApi
      .getAll()
      .then((comps) => {
        const map: Record<string, ComponentDto> = {}
        for (const c of comps) map[c.id] = c
        setComponentsMap(map)
      })
      .catch(() => null)
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordScrapFormValues>({
    resolver: zodResolver(recordScrapSchema),
    defaultValues: {
      componentId: workOrder.componentId,
      quantity: 1,
      reason: 'Material defect during production assembly',
    },
  })

  if (!isOpen) return null

  const onSubmit: SubmitHandler<RecordScrapFormValues> = async (values) => {
    setServerError(null)
    try {
      const updated = await workOrdersApi.recordScrap(workOrder.id, {
        componentId: values.componentId,
        quantity: Number(values.quantity),
        reason: values.reason,
      })
      onSuccess(updated)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to record scrap')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-foreground">
              Record Scrap / Material Defect
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
          Record damaged raw material components or finished goods for Work Order <span className="font-mono font-bold text-foreground">{workOrder.productionNumber}</span>.
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
              htmlFor="scrap-component"
              className="text-xs font-medium text-foreground"
            >
              Component / Item <span className="text-destructive">*</span>
            </label>
            <select
              id="scrap-component"
              {...register('componentId')}
              className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
            >
              <option value={workOrder.componentId}>
                Finished Product — {componentsMap[workOrder.componentId]?.name || 'Finished Product'}
              </option>
              {materials.map((m) => (
                <option key={m.componentId} value={m.componentId}>
                  Raw Material — {componentsMap[m.componentId]?.name || m.componentId}
                </option>
              ))}
            </select>
            {errors.componentId && (
              <p className="text-xs text-destructive">
                {errors.componentId.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="scrap-qty"
              className="text-xs font-medium text-foreground"
            >
              Scrapped Quantity <span className="text-destructive">*</span>
            </label>
            <input
              id="scrap-qty"
              type="number"
              step="any"
              min={0.0001}
              {...register('quantity', { valueAsNumber: true })}
              className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono font-bold"
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">
                {errors.quantity.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="scrap-reason"
              className="text-xs font-medium text-foreground"
            >
              Scrap Reason / Defect Category <span className="text-destructive">*</span>
            </label>
            <input
              id="scrap-reason"
              type="text"
              placeholder="e.g. Component cracked during assembly line stress test"
              {...register('reason')}
              className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
            />
            {errors.reason && (
              <p className="text-xs text-destructive">
                {errors.reason.message}
              </p>
            )}
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
            <Button type="submit" variant="destructive" size="sm" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              Record Scrap Entry
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
