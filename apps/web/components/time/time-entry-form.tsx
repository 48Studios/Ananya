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
import { timeEntriesApi, type TimeEntryDto } from "@/lib/api/time-entries-api";
import { tasksApi, type TaskDto } from "@/lib/api/tasks-api";

const timeEntrySchema = z.object({
  taskId: z.string().min(1, "Task is required"),
  date: z.string().min(1, "Work date is required"),
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
  const [tasks, setTasks] = React.useState<TaskDto[]>([]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      taskId: "",
      date: new Date().toISOString().slice(0, 10),
      hours: 1,
      description: "",
    },
  });

  React.useEffect(() => {
    // Time is always logged against a task; the API requires its id.
    tasksApi
      .getAll()
      .then((all) => setTasks(all ?? []))
      .catch(() => setTasks([]));
  }, []);

  const onSubmit = async (values: TimeEntryFormValues) => {
    setServerError(null);
    try {
      const res = await timeEntriesApi.create({
        taskId: values.taskId,
        date: values.date,
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
          <FieldLabel htmlFor="time-entry-task">
            Task <span className="text-destructive">*</span>
          </FieldLabel>
          <Controller
            name="taskId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="time-entry-task">
                  <SelectValue placeholder="Select the task worked on..." />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.taskNumber} — {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.taskId && <FieldError>{errors.taskId.message}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="date">
            Work Date <span className="text-destructive">*</span>
          </FieldLabel>
          <Input id="date" type="date" {...register("date")} />
          {errors.date && <FieldError>{errors.date.message}</FieldError>}
        </Field>

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
          <FieldLabel htmlFor="description">
            Task Description / Work Notes
          </FieldLabel>
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
          {isSubmitting && (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          )}
          Log Hours
        </Button>
      </DialogShellFooter>
    </form>
  );
}
