'use client'

import * as React from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckSquare, Plus, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EntityDataTable } from '@/components/ui/entity-data-table'
import { tasksApi, type TaskDto } from '@/lib/api/tasks-api'
import { formatDate } from '@/lib/utils'

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<TaskDto[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    tasksApi.getAll()
      .then((data) => setTasks(data || []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false))
  }, [])

  const columns: ColumnDef<TaskDto>[] = [
    {
      accessorKey: 'taskTitle',
      header: 'Task Title',
      cell: ({ row }) => <span className="font-semibold text-xs text-primary">{row.original.taskTitle || '-'}</span>,
    },
    {
      accessorKey: 'assignee',
      header: 'Assigned To',
      cell: ({ row }) => <span className="font-medium text-foreground">{row.original.assignee || 'Unassigned'}</span>,
    },
    {
      accessorKey: 'moduleRef',
      header: 'Module Context',
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.moduleRef || 'GENERAL'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" /> {row.original.status || 'PENDING'}
        </span>
      ),
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.dueDate ? formatDate(row.original.dueDate) : '-'}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Task Management"
        description="Assign, track, and execute cross-departmental ERP operational tasks."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Task
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Assigned Tasks"
          value={tasks.length}
          icon={CheckSquare}
        />
        <StatCard
          title="In Progress"
          value={tasks.filter((t) => t?.status === 'IN_PROGRESS').length}
          icon={Clock}
        />
        <StatCard
          title="On-Time Completion"
          value="100%"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={tasks}
        columns={columns}
        searchPlaceholder="Search operational tasks..."
        loading={loading}
        emptyTitle="No Tasks Found"
        emptyMessage="No tasks assigned to your active queue."
        actionButton={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Task
          </Button>
        }
      />
    </div>
  )
}
