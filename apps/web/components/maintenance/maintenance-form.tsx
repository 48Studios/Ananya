"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { EntitySelector } from "@/components/ui/entity-selector";
import {
  maintenanceApi,
  type MaintenanceScheduleDto,
  type CreateMaintenanceSchedulePayload,
} from "@/lib/api/maintenance-api";

const maintenanceSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  assetName: z
    .string()
    .min(1, "Equipment asset name is required")
    .transform((val) => val.trim()),
  serialNumber: z.string().optional(),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "BIANNUAL", "ANNUAL"]),
  nextVisitDate: z.string().min(1, "Next visit date is required"),
  assignedTechnician: z.string().optional(),
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
      customerId: initialData?.customerId ?? "",
      assetName: initialData?.assetName ?? "",
      serialNumber: initialData?.serialNumber ?? "",
      frequency: initialData?.frequency ?? "QUARTERLY",
      nextVisitDate:
        initialData?.nextVisitDate ?? new Date().toISOString().split("T")[0],
      assignedTechnician: initialData?.assignedTechnician ?? "",
    },
  });

  const onSubmit = async (values: MaintenanceFormValues) => {
    setServerError(null);
    try {
      const payload: CreateMaintenanceSchedulePayload = {
        customerId: values.customerId,
        assetName: values.assetName,
        serialNumber: values.serialNumber,
        frequency: values.frequency,
        nextVisitDate: values.nextVisitDate,
        assignedTechnician: values.assignedTechnician,
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
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogShellBody className="space-y-4">
        {serverError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {serverError}
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="maint-customer">
            Customer <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="maint-customer"
                entity="customer"
                value={field.value}
                onChange={(val) => field.onChange(val ?? "")}
                placeholder="Select the customer this asset belongs to..."
                creatable={false}
              />
            )}
          />
          {errors.customerId?.message && (
            <FieldError>{errors.customerId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="maint-equipment">
            Equipment Asset Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="maint-equipment"
            {...register("assetName")}
            placeholder="e.g. CNC Milling Machine 04"
          />
          {errors.assetName?.message && (
            <FieldError>{errors.assetName.message}</FieldError>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="maint-serial">Serial Number</FieldLabel>
            <Input
              id="maint-serial"
              {...register("serialNumber")}
              placeholder="e.g. SN-4471"
              className="font-mono uppercase"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="maint-type">Service Frequency</FieldLabel>
            <Controller
              name="frequency"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="maint-type">
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                    <SelectItem value="BIANNUAL">Biannual</SelectItem>
                    <SelectItem value="ANNUAL">Annual</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="maint-due">
              Next Visit Date <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="maint-due"
              type="date"
              {...register("nextVisitDate")}
              className="font-mono"
            />
            {errors.nextVisitDate?.message && (
              <FieldError>{errors.nextVisitDate.message}</FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="maint-tech">Assigned Technician</FieldLabel>
            <Input
              id="maint-tech"
              {...register("assignedTechnician")}
              placeholder="e.g. Alex Morgan"
            />
          </Field>
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Schedule Maintenance
        </Button>
      </DialogShellFooter>
    </form>
  );
}
