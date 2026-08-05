"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  maintenanceApi,
  type MaintenanceScheduleDto,
  type CreateMaintenanceSchedulePayload,
} from "@/lib/api/maintenance-api";

const maintenanceSchema = z.object({
  equipmentName: z
    .string()
    .min(1, "Equipment asset name is required")
    .transform((val) => val.trim()),
  workCenterCode: z
    .string()
    .min(1, "Work center code is required")
    .transform((val) => val.trim().toUpperCase()),
  taskType: z.enum(["CALIBRATION", "PREVENTIVE", "OVERHAUL"]),
  nextDueDate: z.string().min(1, "Next service due date is required"),
});

export type MaintenanceFormValues = z.infer<typeof maintenanceSchema>;

interface MaintenanceFormProps {
  initialData?: MaintenanceScheduleDto | null;
  onSuccess: (savedSchedule: MaintenanceScheduleDto) => void;
  onCancel: () => void;
}

export function MaintenanceForm({
  initialData,
  onSuccess,
  onCancel,
}: MaintenanceFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      equipmentName: initialData?.equipmentName ?? "",
      workCenterCode: initialData?.workCenterCode ?? "WC-01",
      taskType: initialData?.taskType ?? "PREVENTIVE",
      nextDueDate:
        initialData?.nextDueDate ?? new Date().toISOString().split("T")[0],
    },
  });

  const onSubmit = async (values: MaintenanceFormValues) => {
    setServerError(null);
    try {
      const payload: CreateMaintenanceSchedulePayload = {
        equipmentName: values.equipmentName,
        workCenterCode: values.workCenterCode,
        taskType: values.taskType,
        nextDueDate: values.nextDueDate,
      };
      const created = await maintenanceApi.create(payload);
      onSuccess(created);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to schedule maintenance task");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      <Field>
        <FieldLabel htmlFor="maint-equipment">Equipment Asset Name</FieldLabel>
        <Input
          id="maint-equipment"
          {...register("equipmentName")}
          placeholder="e.g. CNC Milling Machine 04"
        />
        {errors.equipmentName?.message && (
          <FieldError>{errors.equipmentName.message}</FieldError>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="maint-wc">Work Center Code</FieldLabel>
          <Input
            id="maint-wc"
            {...register("workCenterCode")}
            placeholder="e.g. WC-MACHINING"
            className="font-mono uppercase"
          />
          {errors.workCenterCode?.message && (
            <FieldError>{errors.workCenterCode.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="maint-type">Task Type</FieldLabel>
          <Controller
            name="taskType"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="maint-type">
                  <SelectValue placeholder="Select task type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREVENTIVE">PREVENTIVE</SelectItem>
                  <SelectItem value="CALIBRATION">CALIBRATION</SelectItem>
                  <SelectItem value="OVERHAUL">OVERHAUL</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="maint-due">Next Service Due Date</FieldLabel>
        <Input
          id="maint-due"
          type="date"
          {...register("nextDueDate")}
          className="font-mono"
        />
        {errors.nextDueDate?.message && (
          <FieldError>{errors.nextDueDate.message}</FieldError>
        )}
      </Field>

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
          Schedule Maintenance
        </Button>
      </div>
    </form>
  );
}
