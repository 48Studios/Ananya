'use client'

import React from 'react'
import { X } from 'lucide-react'
import { useNavigation } from '../navigation-context'
import { NavigationRail } from './navigation-rail'
import { ContextSidebar } from './context-sidebar'
import { Button } from '@/components/ui/button'

export function MobileDrawer() {
  const { isMobileOpen, setIsMobileOpen } = useNavigation()

  if (!isMobileOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150"
        onClick={() => setIsMobileOpen(false)}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex h-full max-w-sm bg-sidebar shadow-2xl animate-in slide-in-from-left duration-200">
        <NavigationRail />
        <ContextSidebar onItemClick={() => setIsMobileOpen(false)} />

        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-3 right-3 bg-card z-50 text-foreground"
          aria-label="Close navigation"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  )
}
