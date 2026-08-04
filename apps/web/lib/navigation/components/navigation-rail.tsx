'use client'

import React from 'react'
import Link from 'next/link'
import { ShieldCheck, User } from 'lucide-react'
import { useNavigation } from '../navigation-context'
import { useAuth } from '@/lib/auth/auth-context'
import { NavigationRailItem } from './navigation-rail-item'
import { NAV_TOKENS } from '../tokens'
import { cn } from '@/lib/utils'

export function NavigationRail() {
  const { modules, currentModuleId, selectModule } = useNavigation()
  const { user, hasPermission } = useAuth()

  // Filter modules based on user permissions
  const visibleModules = modules.filter(
    (m) => !m.permissions || m.permissions.length === 0 || m.permissions.some((p) => hasPermission(p))
  )

  // Filter main business modules vs system settings
  const businessModules = visibleModules.filter((m) => m.id !== 'settings')
  const settingsModule = visibleModules.find((m) => m.id === 'settings')

  const displayName = user ? `${user.firstName} ${user.lastName}` : 'User Account'

  return (
    <aside
      className={cn(
        NAV_TOKENS.RAIL_WIDTH,
        'h-screen bg-sidebar border-r border-sidebar-border flex flex-col justify-between items-center py-0 select-none z-30 shrink-0'
      )}
    >
      {/* Top Section: App Brand Logo aligned with shared header height token */}
      <div className="flex flex-col items-center justify-center w-full shrink-0">
        <div className={cn(NAV_TOKENS.HEADER_HEIGHT, 'flex items-center justify-center w-full')}>
          <Link
            href="/"
            className="flex items-center justify-center size-9 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground hover:opacity-90 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Ananya ERP Home"
          >
            <ShieldCheck className="size-5" />
          </Link>
        </div>
      </div>

      {/* Middle Section: Module Rail Items */}
      <nav className="flex-1 w-full overflow-y-auto overflow-x-hidden py-2 space-y-1 scrollbar-none flex flex-col items-center">
        {businessModules.map((module) => {
          const isActive = currentModuleId === module.id
          return (
            <NavigationRailItem
              key={module.id}
              module={module}
              isActive={isActive}
              onClick={() => selectModule(module.id)}
            />
          )
        })}
      </nav>

      {/* Bottom Section: Settings & Profile */}
      <div className="flex flex-col items-center gap-2 w-full py-3 border-t border-sidebar-border/60">
        {settingsModule && (
          <NavigationRailItem
            module={settingsModule}
            isActive={currentModuleId === 'settings'}
            onClick={() => selectModule('settings')}
          />
        )}

        <div className="relative group flex justify-center py-1">
          <Link
            href="/profile"
            className="flex items-center justify-center size-9 rounded-full bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="User Profile"
          >
            <User className="size-4" />
          </Link>
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-popover text-popover-foreground text-xs font-medium rounded-md shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 border border-border">
            {displayName}
          </div>
        </div>
      </div>
    </aside>
  )
}
