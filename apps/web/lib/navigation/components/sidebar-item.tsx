'use client'

import React, { useState, useRef } from 'react'
import Link from 'next/link'
import { Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavigationItem } from '../types'
import { useNavigation } from '../navigation-context'
import { NAV_TOKENS } from '../tokens'
import { SidebarFlyout } from './sidebar-flyout'

import { useAuth } from '@/lib/auth/auth-context'

interface SidebarItemProps {
  item: NavigationItem
  isCollapsed: boolean
  level?: number // 1, 2, or 3
  onItemClick?: () => void
}

export function SidebarItem({
  item,
  isCollapsed,
  level = 1,
  onItemClick,
}: SidebarItemProps) {
  const { activePath, isItemPinned, togglePinnedItem } = useNavigation()
  const { hasPermission } = useAuth()

  const isActive = activePath === item.href || activePath.startsWith(item.href + '/')
  const pinned = isItemPinned(item.href)

  const [isHovered, setIsHovered] = useState(false)
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  if (item.permissions && item.permissions.length > 0 && !item.permissions.some((p) => hasPermission(p))) {
    return null
  }

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (triggerRef.current) {
      setTriggerRect(triggerRef.current.getBoundingClientRect())
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 120)
  }

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    togglePinnedItem(item.href)
  }

  // Row heights: Unified 36px (h-9) across top-level and nested items
  const heightClass = NAV_TOKENS.ITEM_HEIGHT_CHILD // 'h-9'

  // Indentation hierarchy
  const paddingClass =
    level === 3 ? NAV_TOKENS.LEVEL_3_PADDING : level === 2 ? NAV_TOKENS.LEVEL_2_PADDING : NAV_TOKENS.LEVEL_1_PADDING

  if (isCollapsed) {
    return (
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative flex justify-center py-0.5"
      >
        <Link
          href={item.href}
          onClick={onItemClick}
          className={cn(
            'flex items-center justify-center size-9 rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shrink-0',
            isActive
              ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs'
              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
          aria-label={item.title}
        >
          <div className="size-4 flex items-center justify-center shrink-0">
            {item.icon}
          </div>
        </Link>

        {/* Portal-based unclipped flyout */}
        <SidebarFlyout
          isOpen={isHovered}
          triggerRect={triggerRect}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="px-3 py-1.5 bg-popover text-popover-foreground text-xs font-medium rounded-lg shadow-xl whitespace-nowrap border border-border flex items-center gap-2">
            <span>{item.title}</span>
            {item.badge && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-muted text-muted-foreground font-mono">
                {item.badge}
              </span>
            )}
          </div>
        </SidebarFlyout>
      </div>
    )
  }

  return (
    <div className="group/item relative flex items-center w-full">
      <Link
        href={item.href}
        onClick={onItemClick}
        className={cn(
          'w-full flex items-center justify-between gap-2.5 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          heightClass,
          paddingClass,
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs'
            : level === 1
            ? 'text-sidebar-foreground/90 font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/75 font-normal hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground'
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 size-4 flex items-center justify-center opacity-80">
            {item.icon}
          </span>
          <span className="truncate text-xs">{item.title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.badge && (
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none',
                isActive
                  ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground'
                  : 'bg-sidebar-accent text-sidebar-foreground/70'
              )}
            >
              {item.badge}
            </span>
          )}

          <button
            type="button"
            onClick={handlePinClick}
            className={cn(
              'p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-opacity',
              pinned ? 'opacity-100 text-amber-500' : 'opacity-0 group-hover/item:opacity-70'
            )}
            title={pinned ? 'Unpin page' : 'Pin page'}
          >
            <Pin className={cn('size-3', pinned && 'fill-amber-500')} />
          </button>
        </div>
      </Link>
    </div>
  )
}
