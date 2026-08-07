"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
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
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  timeEntriesApi,
  type TimeEntryDto,
} from "@/lib/api/time-entries-api";

const timeEntrySchema = z.object({
  hours: z
    .number()
    .min(0.1, "Hours must be at least 0.1")
    .max(24, "Hours cannot exceed 24"),
  description: z.string().optional(),
});

export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>;

interface TimeEntryFormProps {
  onSuccess: (entry: TimeEntryDto) => void;
  onCancel: () => void;
}

export function TimeEntryForm({ onSuccess, onCancel }: TimeEntryFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      hours: 1,
      description: "",
    },
  });

  const onSubmit = async (values: TimeEntryFormValues) => {
    setServerError(null);
    try {
      const res = await timeEntriesApi.create({
        hours: values.hours,
        description: values.description,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to log labor hours",
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
          <FieldLabel htmlFor="hours">
            Hours Logged <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="hours"
            type="number"
            step="0.1"
            min="0.1"
            max="24"
            {...register("hours", { valueAsNumber: true })}
          />
          {errors.hours && <FieldError>{errors.hours.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Task Description / Work Notes</FieldLabel>
          <Input
            id="description"
            placeholder="Describe labor performed..."
            {...register("description")}
          />
        </Field>
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton disabled={isSubmitting} onClick={onCancel} />
        <Button size="sm" type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Log Hours
        </Button>
      </DialogShellFooter>
    </form>
  );
}
