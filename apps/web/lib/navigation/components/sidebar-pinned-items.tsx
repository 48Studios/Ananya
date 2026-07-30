'use client'

import React from 'react'
import Link from 'next/link'
import { Pin, X } from 'lucide-react'
import { useNavigation } from '../navigation-context'
import { SectionHeader } from './sidebar-section-header'
import { cn } from '@/lib/utils'

interface SidebarPinnedItemsProps {
  isCollapsed: boolean
}

export function SidebarPinnedItems({ isCollapsed }: SidebarPinnedItemsProps) {
  const { pinnedItems, togglePinnedItem, activePath, modules } = useNavigation()

  // Completely omit when collapsed or when no items are pinned
  if (isCollapsed || pinnedItems.length === 0) return null

  // Map pinned Href to title/icon from module config
  const getPinnedItemDetails = (href: string) => {
    for (const mod of modules) {
      for (const section of mod.sidebar) {
        if (!section.items) continue
        for (const item of section.items) {
          if (item.href === href) return { title: item.title, icon: item.icon }
          if (item.children) {
            for (const child of item.children) {
              if (child.href === href) return { title: child.title, icon: child.icon }
            }
          }
        }
      }
    }
    // Fallback: derive title from href
    const title = href
      .replace(/^\//, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    return { title: title || 'Home', icon: <Pin className="size-3.5 text-amber-500" /> }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <SectionHeader title="Pinned" />
        <div className="pr-3 flex items-center">
          <span className="min-w-[20px] h-4.5 px-1.5 rounded-full font-semibold border border-sidebar-border/80 bg-sidebar-accent/80 text-sidebar-foreground/80 flex items-center justify-center text-[10px] font-mono leading-none">
            {pinnedItems.length}
          </span>
        </div>
      </div>

      <div className="space-y-0.5 px-1">
        {pinnedItems.map((href) => {
          const details = getPinnedItemDetails(href)
          const isActive = activePath === href
          return (
            <div
              key={href}
              className="group/pinned flex items-center justify-between gap-2 px-3 h-9 rounded-lg text-xs transition-colors hover:bg-sidebar-accent/80"
            >
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2.5 min-w-0 font-medium truncate flex-1',
                  isActive
                    ? 'text-sidebar-primary font-semibold'
                    : 'text-sidebar-foreground/85'
                )}
              >
                <span className="shrink-0 size-4 flex items-center justify-center text-amber-500">
                  {details.icon}
                </span>
                <span className="truncate">{details.title}</span>
              </Link>

              <button
                type="button"
                onClick={() => togglePinnedItem(href)}
                className="opacity-0 group-hover/pinned:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition-opacity"
                title="Remove pin"
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
