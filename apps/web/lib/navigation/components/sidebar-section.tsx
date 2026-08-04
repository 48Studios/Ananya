'use client'

import React from 'react'
import { SidebarSection as SidebarSectionType } from '../types'
import { SidebarItem } from './sidebar-item'
import { SidebarAccordion } from './sidebar-accordion'
import { SidebarQuickStats } from './sidebar-quick-stats'
import { SidebarQuickActions } from './sidebar-quick-actions'
import { SidebarPinnedItems } from './sidebar-pinned-items'
import { SectionHeader } from './sidebar-section-header'
import { useNavigation } from '../navigation-context'
import { NAV_TOKENS } from '../tokens'
import { cn } from '@/lib/utils'

interface SidebarSectionProps {
  section: SidebarSectionType
  isCollapsed: boolean
  isFirst?: boolean
  isAfterQuickStats?: boolean
  onItemClick?: () => void
}

export function SidebarSection({
  section,
  isCollapsed,
  isFirst = false,
  isAfterQuickStats = false,
  onItemClick,
}: SidebarSectionProps) {
  const { pinnedItems, currentModuleId } = useNavigation()

  // In collapsed mode, quick_stats, quick_actions, and pinned sections return null.
  // In expanded mode, empty pinned section (pinnedItems.length === 0) returns null.
  const isContentHidden =
    (section.type === 'quick_stats' && isCollapsed) ||
    (section.type === 'quick_actions' && (isCollapsed || !section.quickActions?.length)) ||
    (section.type === 'pinned' && (isCollapsed || pinnedItems.length === 0)) ||
    (section.type === 'nav' && (!section.items || section.items.length === 0))

  if (isContentHidden) {
    return null
  }

  // Divider styling ABOVE section headings (only when not first visible section and not after quick_stats)
  const dividerClass = !isFirst && !isAfterQuickStats ? NAV_TOKENS.SECTION_DIVIDER : ''

  if (section.type === 'quick_stats') {
    return (
      <div className="pb-4 mb-2.5 border-b border-sidebar-border/50">
        {!isCollapsed && section.title && <SectionHeader title={section.title} />}
        <SidebarQuickStats stats={section.quickStats} moduleId={currentModuleId} isCollapsed={isCollapsed} />
      </div>
    )
  }

  if (section.type === 'quick_actions' && section.quickActions) {
    return (
      <div className={cn(dividerClass, 'pb-2')}>
        {!isCollapsed && section.title && <SectionHeader title={section.title} />}
        <SidebarQuickActions actions={section.quickActions} isCollapsed={isCollapsed} />
      </div>
    )
  }

  if (section.type === 'pinned') {
    return (
      <div className={dividerClass}>
        <SidebarPinnedItems isCollapsed={isCollapsed} />
      </div>
    )
  }

  return (
    <div className={cn(dividerClass)}>
      {/* Standardized Shared Section Heading */}
      {!isCollapsed && section.title && <SectionHeader title={section.title} />}

      {/* Workspace Nav Items */}
      <div className={cn('px-1', NAV_TOKENS.TOP_ITEM_GAP)}>
        {section.items?.map((item) => {
          if (item.children && item.children.length > 0) {
            return (
              <SidebarAccordion
                key={item.id}
                item={item}
                isCollapsed={isCollapsed}
                level={1}
                onItemClick={onItemClick}
              />
            )
          }

          return (
            <SidebarItem
              key={item.id}
              item={item}
              isCollapsed={isCollapsed}
              level={1}
              onItemClick={onItemClick}
            />
          )
        })}
      </div>
    </div>
  )
}
