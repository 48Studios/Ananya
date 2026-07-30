'use client'

import * as React from 'react'
import { useForm, useFieldArray, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  bomsApi,
  type BillOfMaterialsDto,
  type CreateBomPayload,
  type UpdateBomPayload,
} from '@/lib/api/boms-api'
import { componentsApi, type ComponentDto } from '@/lib/api/components-api'

const bomLineSchema = z.object({
  componentId: z.string().min(1, 'Component selection is required'),
  quantityPerUnit: z.number().min(0.0001, 'Quantity must be greater than zero'),
  unitOfMeasure: z.string().min(1, 'Unit is required'),
  scrapFactorPercent: z.number().min(0, 'Scrap % must be non-negative'),
  notes: z.string().optional().nullable(),
})

const bomSchema = z
  .object({
    componentId: z.string().min(1, 'Finished product component selection is required'),
    revision: z.string().min(1, 'Revision number is required'),
    notes: z.string().optional().nullable(),
    lines: z.array(bomLineSchema).min(1, 'At least one component line item is required'),
  })
  .refine(
    (data) => {
      // Check self-reference
      return !data.lines.some((l) => l.componentId === data.componentId)
    },
    {
      message: 'Finished product cannot be listed as a component line item of its own BOM.',
      path: ['lines'],
    },
  )
  .refine(
    (data) => {
      // Check duplicate components
      const ids = data.lines.map((l) => l.componentId).filter(Boolean)
      const unique = new Set(ids)
      return ids.length === unique.size
    },
    {
      message: 'Duplicate component lines are not allowed in a single BOM.',
      path: ['lines'],
    },
  )

export type BomFormValues = z.infer<typeof bomSchema>

interface BomFormProps {
  initialData?: BillOfMaterialsDto | null
  onSuccess: (savedBom: BillOfMaterialsDto) => void
  onCancel: () => void
}

export function BomForm({ initialData, onSuccess, onCancel }: BomFormProps) {
  const [components, setComponents] = React.useState<ComponentDto[]>([])
  const [componentsMap, setComponentsMap] = React.useState<Record<string, ComponentDto>>({})
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [loadingComps, setLoadingComps] = React.useState(true)

  const isEdit = Boolean(initialData)

  React.useEffect(() => {
    componentsApi
      .getAll()
      .then((comps) => {
        setComponents(comps)
        const map: Record<string, ComponentDto> = {}
        for (const c of comps) map[c.id] = c
        setComponentsMap(map)
      })
      .catch((err) => {
        setServerError(err instanceof Error ? err.message : 'Failed to load component catalog')
      })
      .finally(() => setLoadingComps(false))
  }, [])

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BomFormValues>({
    resolver: zodResolver(bomSchema),
    defaultValues: initialData
      ? {
          componentId: initialData.componentId,
          revision: initialData.revision,
          notes: initialData.notes || '',
          lines: initialData.lines.map((l) => ({
            componentId: l.componentId,
            quantityPerUnit: l.quantityPerUnit,
            unitOfMeasure: l.unitOfMeasure,
            scrapFactorPercent: l.scrapFactorPercent,
            notes: l.notes || '',
          })),
        }
      : {
          componentId: '',
          revision: 'v1.0',
          notes: '',
          lines: [
            {
              componentId: '',
              quantityPerUnit: 1,
              unitOfMeasure: 'pcs',
              scrapFactorPercent: 0,
              notes: '',
            },
          ],
        },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const handleLineComponentChange = (index: number, compId: string) => {
    setValue(`lines.${index}.componentId`, compId)
    const comp = componentsMap[compId]
    if (comp) {
      setValue(`lines.${index}.unitOfMeasure`, comp.unit || 'pcs')
    }
  }

  const watchedLines = watch('lines')
  const selectedFinishedProductId = watch('componentId')

  const onSubmit: SubmitHandler<BomFormValues> = async (values) => {
    setServerError(null)
    try {
      if (isEdit && initialData) {
        const payload: UpdateBomPayload = {
          notes: values.notes || null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            quantityPerUnit: Number(l.quantityPerUnit),
            unitOfMeasure: l.unitOfMeasure,
            scrapFactorPercent: Number(l.scrapFactorPercent),
            notes: l.notes || null,
          })),
        }
        const updated = await bomsApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateBomPayload = {
          componentId: values.componentId,
          revision: values.revision,
          notes: values.notes || null,
          lines: values.lines.map((l) => ({
            componentId: l.componentId,
            quantityPerUnit: Number(l.quantityPerUnit),
            unitOfMeasure: l.unitOfMeasure,
            scrapFactorPercent: Number(l.scrapFactorPercent),
            notes: l.notes || null,
          })),
        }
        const created = await bomsApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to save Bill of Materials')
      }
    }
  }

  if (loadingComps) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Loading components catalog...
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

      {/* Product & Revision */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1">
          <label htmlFor="bom-product" className="text-xs font-medium text-foreground">
            Finished Product Component <span className="text-destructive">*</span>
          </label>
          <select
            id="bom-product"
            disabled={isEdit}
            {...register('componentId')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground disabled:opacity-60"
          >
            <option value="">Select finished product component...</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sku} — {c.name} ({c.unit})
              </option>
            ))}
          </select>
          {errors.componentId && (
            <p className="text-xs text-destructive">{errors.componentId.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="bom-revision" className="text-xs font-medium text-foreground">
            Revision <span className="text-destructive">*</span>
          </label>
          <input
            id="bom-revision"
            type="text"
            placeholder="e.g. v1.0"
            disabled={isEdit}
            {...register('revision')}
            className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-mono disabled:opacity-60"
          />
          {errors.revision && (
            <p className="text-xs text-destructive">{errors.revision.message}</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label htmlFor="bom-notes" className="text-xs font-medium text-foreground">
          BOM Notes / Specification Details
        </label>
        <input
          id="bom-notes"
          type="text"
          placeholder="e.g. Standard production assembly BOM for batch batch-v1"
          {...register('notes')}
          className="w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
        />
      </div>

      {/* Dynamic Line Items Section */}
      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Required Component Line Items <span className="text-destructive">*</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              append({
                componentId: '',
                quantityPerUnit: 1,
                unitOfMeasure: 'pcs',
                scrapFactorPercent: 0,
                notes: '',
              })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Component
          </Button>
        </div>

        {errors.lines && typeof errors.lines.message === 'string' && (
          <div className="p-2.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {errors.lines.message}
          </div>
        )}

        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {fields.map((field, index) => (
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
                  Component Item
                </label>
                <select
                  value={watchedLines[index]?.componentId || ''}
                  onChange={(e) => handleLineComponentChange(index, e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground"
                >
                  <option value="">Select component...</option>
                  {components
                    .filter((c) => c.id !== selectedFinishedProductId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sku} — {c.name} ({c.unit})
                      </option>
                    ))}
                </select>
              </div>

              {/* Quantities, Unit, Scrap % */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Qty / Finished Unit
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    {...register(`lines.${index}.quantityPerUnit`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    {...register(`lines.${index}.unitOfMeasure`)}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Scrap Factor %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    {...register(`lines.${index}.scrapFactorPercent`, { valueAsNumber: true })}
                    className="w-full px-2 py-1.5 text-xs bg-card border border-border rounded outline-none focus:border-primary text-foreground font-mono"
                  />
                </div>
              </div>

              {/* Line Notes */}
              <div className="pt-1">
                <input
                  type="text"
                  placeholder="Line note (e.g. Apply thermal paste prior to assembly)"
                  {...register(`lines.${index}.notes`)}
                  className="w-full px-2 py-1 text-[11px] bg-card border border-border rounded outline-none focus:border-primary text-foreground"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Bill of Materials'}
        </Button>
      </div>
    </form>
  )
}
