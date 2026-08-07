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
import { tasksApi, type TaskDto } from "@/lib/api/tasks-api";

const taskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  assignedUser: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  estimatedHours: z.number().min(0, "Hours must be non-negative"),
});

export type TaskFormValues = z.infer<typeof taskSchema>;

interface TaskFormProps {
  onSuccess: (task: TaskDto) => void;
  onCancel: () => void;
}

export function TaskForm({ onSuccess, onCancel }: TaskFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      assignedUser: "",
      priority: "NORMAL",
      estimatedHours: 1,
    },
  });

  const onSubmit = async (values: TaskFormValues) => {
    setServerError(null);
    try {
      const res = await tasksApi.create({
        title: values.title,
        description: values.description,
        assignedUser: values.assignedUser,
        priority: values.priority,
        estimatedHours: values.estimatedHours,
      });
      onSuccess(res);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to create task",
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
          <FieldLabel htmlFor="title">
            Task Title <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="title"
            placeholder="e.g. Inspect Batch #401 Quality"
            {...register("title")}
          />
          {errors.title && <FieldError>{errors.title.message}</FieldError>}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="assignedUser">Assigned To</FieldLabel>
            <Input
              id="assignedUser"
              placeholder="e.g. J. Sarath"
              {...register("assignedUser")}
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
                    <SelectItem value="LOW">LOW</SelectItem>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="HIGH">HIGH</SelectItem>
                    <SelectItem value="URGENT">URGENT</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="estimatedHours">Estimated Hours</FieldLabel>
          <Input
            id="estimatedHours"
            type="number"
            step="any"
            {...register("estimatedHours", { valueAsNumber: true })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Input
            id="description"
            placeholder="Task instructions and operational notes..."
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
          Create Task
        </Button>
      </DialogShellFooter>
    </form>
  );
}
