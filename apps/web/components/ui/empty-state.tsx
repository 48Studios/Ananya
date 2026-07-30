'use client'

import * as React from 'react'
import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  title = 'No records found',
  description = 'There are no entries to display at this moment.',
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-card border border-border rounded-xl">
      <div className="p-3 bg-muted/50 rounded-full text-muted-foreground mb-3">
        <Icon className="w-8 h-8 text-muted-foreground/70" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {description}
      </p>
      {action && (
        <div className="mt-4">
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
}
