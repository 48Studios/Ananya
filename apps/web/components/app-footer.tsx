'use client'

import React from 'react'
import { getAppInfo } from '@/lib/app-info'
import { ExternalLink } from '@/components/ui/external-link'
import { cn } from '@/lib/utils'

export interface AppFooterProps {
  className?: string
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export function AppFooter({ className }: AppFooterProps) {
  const appInfo = getAppInfo()
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className={cn(
        'border-t border-border bg-card/50 px-4 lg:px-6 h-14 flex items-center justify-between text-xs text-muted-foreground select-none shrink-0',
        className
      )}
    >
      {/* Left Section: Copyright & Hyperlink */}
      <div className="flex items-center gap-1 font-medium">
        <span>© {currentYear}</span>
        <ExternalLink href={appInfo.organization.url} hideIcon>
          {appInfo.organization.name}
        </ExternalLink>
        <span>•</span>
        <span>All rights reserved.</span>
      </div>

      {/* Right Section: Environment • Version • [Icon] GitHub [External Indicator] */}
      <div className="flex items-center gap-2">
        {/* 1. Environment */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 rounded-full inline-block',
              appInfo.environment === 'Production'
                ? 'bg-emerald-500'
                : appInfo.environment === 'Staging'
                  ? 'bg-amber-500'
                  : appInfo.environment === 'Preview'
                    ? 'bg-purple-500'
                    : 'bg-sky-500'
            )}
          />
          <span>{appInfo.environment}</span>
        </div>

        <span>•</span>

        {/* 2. Version */}
        <span className="tabular-nums">v{appInfo.version}</span>

        <span>•</span>

        {/* 3. GitHub External Link with Octocat and External Indicator Icon */}
        <ExternalLink href={appInfo.repository.url}>
          <GitHubIcon className="size-3.5 shrink-0" />
          <span>{appInfo.repository.name}</span>
        </ExternalLink>
      </div>
    </footer>
  )
}
