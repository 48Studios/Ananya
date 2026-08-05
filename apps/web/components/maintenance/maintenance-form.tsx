'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  maintenanceApi,
  type MaintenanceScheduleDto,
  type CreateMaintenanceSchedulePayload,
} from '@/lib/api/maintenance-api'

const maintenanceSchema = z.object({
  equipmentName: z.string().min(1, 'Equipment asset name is required').transform((val) => val.trim()),
  workCenterCode: z.string().min(1, 'Work center code is required').transform((val) => val.trim().toUpperCase()),
  taskType: z.enum(['CALIBRATION', 'PREVENTIVE', 'OVERHAUL']),
  nextDueDate: z.string().min(1, 'Next service due date is required'),
})

export type MaintenanceFormValues = z.infer<typeof maintenanceSchema>

interface MaintenanceFormProps {
  initialData?: MaintenanceScheduleDto | null
  onSuccess: (savedSchedule: MaintenanceScheduleDto) => void
  onCancel: () => void
}

export function MaintenanceForm({
  initialData,
  onSuccess,
  onCancel,
}: MaintenanceFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      equipmentName: initialData?.equipmentName ?? '',
      workCenterCode: initialData?.workCenterCode ?? 'WC-01',
      taskType: initialData?.taskType ?? 'PREVENTIVE',
      nextDueDate: initialData?.nextDueDate ?? new Date().toISOString().split('T')[0],
    },
  })

  const onSubmit = async (values: MaintenanceFormValues) => {
    setServerError(null)
    try {
      const payload: CreateMaintenanceSchedulePayload = {
        equipmentName: values.equipmentName,
        workCenterCode: values.workCenterCode,
        taskType: values.taskType,
        nextDueDate: values.nextDueDate,
      }
      const created = await maintenanceApi.create(payload)
      onSuccess(created)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to schedule maintenance task')
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Equipment Asset Name</label>
        <input
          {...register('equipmentName')}
          placeholder="e.g. CNC Milling Machine 04"
          className="w-full h-9 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {errors.equipmentName && (
          <p className="text-[11px] text-destructive">{errors.equipmentName.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Work Center Code</label>
          <input
            {...register('workCenterCode')}
            placeholder="e.g. WC-MACHINING"
            className="w-full h-9 px-3 text-xs font-mono uppercase rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {errors.workCenterCode && (
            <p className="text-[11px] text-destructive">{errors.workCenterCode.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Task Type</label>
          <select
            {...register('taskType')}
            className="w-full h-9 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="PREVENTIVE">PREVENTIVE</option>
            <option value="CALIBRATION">CALIBRATION</option>
            <option value="OVERHAUL">OVERHAUL</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Next Service Due Date</label>
        <input
          type="date"
          {...register('nextDueDate')}
          className="w-full h-9 px-3 text-xs font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {errors.nextDueDate && (
          <p className="text-[11px] text-destructive">{errors.nextDueDate.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Schedule Maintenance
        </Button>
      </div>
    </form>
  )
}
