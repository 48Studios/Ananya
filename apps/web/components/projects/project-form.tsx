'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  projectsApi,
  type ProjectDto,
  type CreateProjectPayload,
  type UpdateProjectPayload,
  type ProjectType,
  type ProjectPriority,
} from '@/lib/api/projects-api'

const PROJECT_TYPES: { label: string; value: ProjectType }[] = [
  { label: 'Customer Project', value: 'CUSTOMER' },
  { label: 'Internal Project', value: 'INTERNAL' },
  { label: 'R&D', value: 'R_AND_D' },
  { label: 'Prototype', value: 'PROTOTYPE' },
  { label: 'Installation', value: 'INSTALLATION' },
  { label: 'Manufacturing Initiative', value: 'MANUFACTURING_INITIATIVE' },
]

const PRIORITIES: { label: string; value: ProjectPriority }[] = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Urgent', value: 'URGENT' },
]

interface ProjectFormProps {
  initialData?: ProjectDto | null
  onSuccess: (saved: ProjectDto) => void
  onCancel: () => void
}

export function ProjectForm({ initialData, onSuccess, onCancel }: ProjectFormProps) {
  const isEdit = Boolean(initialData)
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const [name, setName] = React.useState(initialData?.name || '')
  const [projectType, setProjectType] = React.useState<ProjectType>(
    initialData?.projectType || 'INTERNAL',
  )
  const [description, setDescription] = React.useState(initialData?.description || '')
  const [projectManager, setProjectManager] = React.useState(
    initialData?.projectManager || '',
  )
  const [owner, setOwner] = React.useState(initialData?.owner || '')
  const [startDate, setStartDate] = React.useState(
    initialData?.startDate
      ? new Date(initialData.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  )
  const [targetCompletionDate, setTargetCompletionDate] = React.useState(
    initialData?.targetCompletionDate
      ? new Date(initialData.targetCompletionDate).toISOString().split('T')[0]
      : '',
  )
  const [priority, setPriority] = React.useState<ProjectPriority>(
    initialData?.priority || 'MEDIUM',
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)

    if (!name.trim()) {
      setServerError('Project name is required')
      return
    }
    if (!projectManager.trim()) {
      setServerError('Project manager is required')
      return
    }
    if (!startDate) {
      setServerError('Start date is required')
      return
    }
    if (!targetCompletionDate) {
      setServerError('Target completion date is required')
      return
    }

    setIsSubmitting(true)
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
        }
        const updated = await projectsApi.update(initialData.id, payload)
        onSuccess(updated)
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
        }
        const created = await projectsApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to save project')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm bg-input/40 border border-border rounded-md outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground'
  const labelClass = 'text-xs font-medium text-foreground'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Name */}
      <div className="space-y-1">
        <label htmlFor="project-name" className={labelClass}>
          Project Name <span className="text-destructive">*</span>
        </label>
        <input
          id="project-name"
          type="text"
          placeholder="e.g. Customer Fitout — Building A"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Type & Priority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="project-type" className={labelClass}>
            Project Type
          </label>
          <select
            id="project-type"
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as ProjectType)}
            className={inputClass}
          >
            {PROJECT_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="project-priority" className={labelClass}>
            Priority
          </label>
          <select
            id="project-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ProjectPriority)}
            className={inputClass}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Project Manager & Owner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="project-manager" className={labelClass}>
            Project Manager <span className="text-destructive">*</span>
          </label>
          <input
            id="project-manager"
            type="text"
            placeholder="e.g. Arun K"
            value={projectManager}
            onChange={(e) => setProjectManager(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="project-owner" className={labelClass}>
            Owner
          </label>
          <input
            id="project-owner"
            type="text"
            placeholder="e.g. Operations Lead"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="project-start-date" className={labelClass}>
            Start Date <span className="text-destructive">*</span>
          </label>
          <input
            id="project-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="project-target-date" className={labelClass}>
            Target Completion Date <span className="text-destructive">*</span>
          </label>
          <input
            id="project-target-date"
            type="date"
            value={targetCompletionDate}
            onChange={(e) => setTargetCompletionDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label htmlFor="project-description" className={labelClass}>
          Description
        </label>
        <textarea
          id="project-description"
          placeholder="Project scope, deliverables, or notes..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass + ' resize-none'}
        />
      </div>

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
          {isEdit ? 'Save Changes' : 'Create Project'}
        </Button>
      </div>
    </form>
  )
}
