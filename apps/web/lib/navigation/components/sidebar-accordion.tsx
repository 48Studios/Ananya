'use client'

import React, { useState, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavigationItem } from '../types'
import { useNavigation } from '../navigation-context'
import { SidebarItem } from './sidebar-item'
import { SectionHeader } from './sidebar-section-header'
import { NAV_TOKENS } from '../tokens'
import { SidebarFlyout } from './sidebar-flyout'

import { useAuth } from '@/lib/auth/auth-context'

interface SidebarAccordionProps {
  item: NavigationItem
  isCollapsed: boolean
  level?: number
  onItemClick?: () => void
}

export function SidebarAccordion({
  item,
  isCollapsed,
  level = 1,
  onItemClick,
}: SidebarAccordionProps) {
  const { expandedAccordions, toggleAccordion, activePath } = useNavigation()
  const { hasPermission } = useAuth()

  const isOpen = !!expandedAccordions[item.id]

  const isChildActive = item.children?.some(
    (child) => activePath === child.href || activePath.startsWith(child.href + '/')
  )

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
    }, 150)
  }

  // Unified 36px row height (h-9)
  const heightClass = NAV_TOKENS.ITEM_HEIGHT_CHILD
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
        <button
          type="button"
          className={cn(
            'flex items-center justify-center size-9 rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shrink-0',
            isChildActive
              ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
              : 'text-sidebar-foreground/75 hover:bg-sidebar-accent'
          )}
          aria-label={item.title}
        >
          <div className="size-4 flex items-center justify-center shrink-0">
            {item.icon}
          </div>
        </button>

        {/* Portal-based unclipped flyout sharing sidebar layout primitives */}
        <SidebarFlyout
          isOpen={isHovered}
          triggerRect={triggerRect}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="py-1 px-1 bg-popover text-popover-foreground text-xs rounded-lg shadow-xl border border-border min-w-48 flex flex-col">
            {/* Reused SectionHeader Primitive (36px row height, px-3 alignment) */}
            <SectionHeader title={item.title} />

            {/* Content-aligned Divider Line */}
            <div className="mx-3 my-1 h-px bg-border/60" />

            {/* Navigation Items */}
            <div className={NAV_TOKENS.CHILD_ITEM_GAP}>
              {item.children?.map((child) => (
                <SidebarItem
                  key={child.id}
                  item={child}
                  isCollapsed={false}
                  level={1}
                  onItemClick={onItemClick}
                />
              ))}
            </div>
          </div>
        </SidebarFlyout>
      </div>
    )
  }

  return (
    <div className="space-y-1 w-full">
      <button
        type="button"
        onClick={() => toggleAccordion(item.id)}
        className={cn(
          'w-full flex items-center justify-between gap-2.5 rounded-lg text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          heightClass,
          paddingClass,
          isChildActive
            ? 'text-sidebar-foreground bg-sidebar-accent/50 font-semibold'
            : 'text-sidebar-foreground/85 font-medium hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="shrink-0 size-4 flex items-center justify-center opacity-80">
            {item.icon}
          </span>
          <span className="truncate text-xs">{item.title}</span>
        </div>

        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 ease-out',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Expanded Accordion Tree with reduced indentation guide line */}
      {isOpen && item.children && (
        <div className={cn('pt-0.5 animate-in fade-in-50 duration-150', NAV_TOKENS.TREE_GUIDE_LINE, NAV_TOKENS.CHILD_ITEM_GAP)}>
          {item.children.map((child) => (
            <SidebarItem
              key={child.id}
              item={child}
              isCollapsed={false}
              level={level + 1}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
