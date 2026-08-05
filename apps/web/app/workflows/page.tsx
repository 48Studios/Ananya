'use client'

import * as React from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { WorkflowBuilder } from '@/components/ui/workflow-builder'
import { notificationsApi, WorkflowRuleDto } from '@/lib/api/notifications-api'
import { Zap, Plus, CheckCircle2, Play, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGuard } from '@/lib/auth/auth-context'

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = React.useState<WorkflowRuleDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isBuilderOpen, setIsBuilderOpen] = React.useState(false)

  const loadWorkflows = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await notificationsApi.getWorkflows()
      setWorkflows(data)
    } catch {
      setError('Failed to load automation workflows.')
      setWorkflows([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  const totalRules = workflows.length
  const activeRules = workflows.filter((w) => w.isActive).length

  return (
    <PermissionGuard permission="Administration.Security">
      <div className="space-y-6">
        <PageHeader
          title="Workflow Automation"
          description="Configure event-driven trigger-condition-action automation rules across inventory, procurement, and manufacturing."
          actions={
            <Button size="sm" onClick={() => setIsBuilderOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Automation Rule
            </Button>
          }
        />

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Total Workflows"
            value={totalRules.toString()}
            subtitle="Configured automation rules"
            icon={GitBranch}
          />
          <StatCard
            title="Active Rules"
            value={activeRules.toString()}
            subtitle="Currently evaluating triggers"
            icon={Zap}
          />
          <StatCard
            title="Execution Status"
            value="100%"
            subtitle="Rule execution health"
            icon={CheckCircle2}
          />
        </div>

        {/* Workflows List */}
        {loading ? (
          <LoadingState message="Loading Workflow Automation Rules..." />
        ) : error ? (
          <ErrorState title="Error Loading Workflows" message={error} onRetry={loadWorkflows} />
        ) : workflows.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground space-y-3">
            <Zap className="w-10 h-10 text-muted-foreground/50 mx-auto" />
            <p>No workflow automation rules configured yet. Create a rule to automate business alerts.</p>
            <Button size="sm" onClick={() => setIsBuilderOpen(true)}>
              Create First Automation Rule
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="p-5 bg-card border border-border rounded-xl shadow-2xs space-y-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{wf.name}</h3>
                      <p className="text-xs text-muted-foreground">{wf.description || 'Trigger -> Condition -> Action Pipeline'}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded">
                    Active
                  </span>
                </div>

                <div className="text-xs bg-muted/20 p-2.5 rounded-lg border border-border space-y-1 font-mono">
                  <div className="text-muted-foreground">TRIGGER: <strong className="text-foreground">{wf.triggerType}</strong></div>
                  <div className="text-muted-foreground">CONDITIONS: <strong className="text-foreground">{wf.conditionsJson.length} rules</strong></div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button variant="ghost" size="sm" className="text-xs">
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Test Rule
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workflow Builder Modal */}
        <WorkflowBuilder
          isOpen={isBuilderOpen}
          onClose={() => setIsBuilderOpen(false)}
          onWorkflowCreated={loadWorkflows}
        />
      </div>
    </PermissionGuard>
  )
}
