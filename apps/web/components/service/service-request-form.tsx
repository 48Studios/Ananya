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
  serviceRequestsApi,
  type ServiceRequestDto,
  type ServiceCategory,
  type ServicePriority,
} from "@/lib/api/service-requests-api";

const serviceRequestSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  title: z.string().min(1, "Ticket title is required"),
  category: z.enum([
    "HARDWARE",
    "SOFTWARE",
    "MAINTENANCE",
    "INSTALLATION",
    "INSPECTION",
  ]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  description: z.string().optional(),
});

export type ServiceRequestFormValues = z.infer<typeof serviceRequestSchema>;

interface ServiceRequestFormProps {
  onSuccess: (ticket: ServiceRequestDto) => void;
  onCancel: () => void;
}

export function ServiceRequestForm({
  onSuccess,
  onCancel,
}: ServiceRequestFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ServiceRequestFormValues>({
    resolver: zodResolver(serviceRequestSchema),
    defaultValues: {
      customerId: "",
      title: "",
      category: "MAINTENANCE",
      priority: "MEDIUM",
      description: "",
    },
  });

  const onSubmit = async (values: ServiceRequestFormValues) => {
    setServerError(null);
    try {
      const res = await serviceRequestsApi.create({
        customerId: values.customerId,
        title: values.title,
        category: values.category as ServiceCategory,
        priority: values.priority as ServicePriority,
        description: values.description,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to create service ticket",
      );
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
          <FieldLabel htmlFor="service-request-customer">
            Customer <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <EntitySelector
                id="service-request-customer"
                entity="customer"
                value={field.value}
                onChange={(val) => field.onChange(val ?? "")}
                placeholder="Select the customer reporting the issue..."
                creatable={false}
              />
            )}
          />
          {errors.customerId && (
            <FieldError>{errors.customerId.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="title">
            Ticket Subject / Title <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="title"
            placeholder="e.g. CNC Spindle Noise Investigation"
            {...register("title")}
          />
          {errors.title && <FieldError>{errors.title.message}</FieldError>}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HARDWARE">Hardware</SelectItem>
                    <SelectItem value="SOFTWARE">Software</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="INSTALLATION">Installation</SelectItem>
                    <SelectItem value="INSPECTION">Inspection</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="priority">Priority</FieldLabel>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Select priority..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="description">
            Issue Details / Description
          </FieldLabel>
          <Input
            id="description"
            placeholder="Describe the issue or service requested..."
            {...register("description")}
          />
        </Field>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Create Ticket
        </Button>
      </DialogShellFooter>
    </form>
  );
}
