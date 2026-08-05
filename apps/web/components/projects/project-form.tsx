"use client";

import * as React from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  projectsApi,
  type ProjectDto,
  type CreateProjectPayload,
  type UpdateProjectPayload,
  type ProjectType,
  type ProjectPriority,
} from "@/lib/api/projects-api";

const PROJECT_TYPES: { label: string; value: ProjectType }[] = [
  { label: "Customer Project", value: "CUSTOMER" },
  { label: "Internal Project", value: "INTERNAL" },
  { label: "R&D", value: "R_AND_D" },
  { label: "Prototype", value: "PROTOTYPE" },
  { label: "Installation", value: "INSTALLATION" },
  { label: "Manufacturing Initiative", value: "MANUFACTURING_INITIATIVE" },
];

const PRIORITIES: { label: string; value: ProjectPriority }[] = [
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
  { label: "Urgent", value: "URGENT" },
];

interface ProjectFormProps {
  initialData?: ProjectDto | null;
  onSuccess: (saved: ProjectDto) => void;
  onCancel: () => void;
}

export function ProjectForm({
  initialData,
  onSuccess,
  onCancel,
}: ProjectFormProps) {
  const isEdit = Boolean(initialData);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [name, setName] = React.useState(initialData?.name || "");
  const [projectType, setProjectType] = React.useState<ProjectType>(
    initialData?.projectType || "INTERNAL",
  );
  const [description, setDescription] = React.useState(
    initialData?.description || "",
  );
  const [projectManager, setProjectManager] = React.useState(
    initialData?.projectManager || "",
  );
  const [owner, setOwner] = React.useState(initialData?.owner || "");
  const [startDate, setStartDate] = React.useState(
    initialData?.startDate
      ? new Date(initialData.startDate).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [targetCompletionDate, setTargetCompletionDate] = React.useState(
    initialData?.targetCompletionDate
      ? new Date(initialData.targetCompletionDate).toISOString().split("T")[0]
      : "",
  );
  const [priority, setPriority] = React.useState<ProjectPriority>(
    initialData?.priority || "MEDIUM",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!name.trim()) {
      setServerError("Project name is required");
      return;
    }
    if (!projectManager.trim()) {
      setServerError("Project manager is required");
      return;
    }
    if (!startDate) {
      setServerError("Start date is required");
      return;
    }
    if (!targetCompletionDate) {
      setServerError("Target completion date is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && initialData) {
        const payload: UpdateProjectPayload = {
          name: name.trim(),
          projectType,
          description: description.trim() || undefined,
          owner: owner.trim() || undefined,
          projectManager: projectManager.trim(),
          startDate,
          targetCompletionDate,
          priority,
        };
        const updated = await projectsApi.update(initialData.id, payload);
        onSuccess(updated);
      } else {
        const payload: CreateProjectPayload = {
          name: name.trim(),
          projectType,
          description: description.trim() || undefined,
          owner: owner.trim() || undefined,
          projectManager: projectManager.trim(),
          startDate,
          targetCompletionDate,
          priority,
        };
        const created = await projectsApi.create(payload);
        onSuccess(created);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message);
      } else {
        setServerError("Failed to save project");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Name */}
      <Field>
        <FieldLabel htmlFor="project-name">
          Project Name <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="project-name"
          type="text"
          placeholder="e.g. Customer Fitout — Building A"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      {/* Type & Priority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="project-type">Project Type</FieldLabel>
          <Select
            value={projectType}
            onValueChange={(val) => setProjectType(val as ProjectType)}
          >
            <SelectTrigger id="project-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((pt) => (
                <SelectItem key={pt.value} value={pt.value}>
                  {pt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="project-priority">Priority</FieldLabel>
          <Select
            value={priority}
            onValueChange={(val) => setPriority(val as ProjectPriority)}
          >
            <SelectTrigger id="project-priority">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Project Manager & Owner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="project-manager">
            Project Manager <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="project-manager"
            type="text"
            placeholder="e.g. Arun K"
            value={projectManager}
            onChange={(e) => setProjectManager(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="project-owner">Owner</FieldLabel>
          <Input
            id="project-owner"
            type="text"
            placeholder="e.g. Operations Lead"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </Field>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="project-start-date">
            Start Date <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="project-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="font-mono"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="project-target-date">
            Target Completion Date <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="project-target-date"
            type="date"
            value={targetCompletionDate}
            onChange={(e) => setTargetCompletionDate(e.target.value)}
            className="font-mono"
          />
        </Field>
      </div>

      {/* Description */}
      <Field>
        <FieldLabel htmlFor="project-description">Description</FieldLabel>
        <Textarea
          id="project-description"
          placeholder="Project scope, deliverables, or notes..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="resize-none"
        />
      </Field>

      {/* Actions */}
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
          {isEdit ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
