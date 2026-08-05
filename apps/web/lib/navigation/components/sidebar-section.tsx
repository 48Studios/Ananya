'use client'

import React from 'react'
import { SidebarSection as SidebarSectionType } from '../types'
import { SidebarItem } from './sidebar-item'
import { SidebarAccordion } from './sidebar-accordion'
import { SidebarQuickStats } from './sidebar-quick-stats'
import { SidebarQuickActions } from './sidebar-quick-actions'
import { SidebarFavoritesRecent } from './sidebar-favorites-recent'
import { SectionHeader } from './sidebar-section-header'
import { useNavigation } from '../navigation-context'
import { NAV_TOKENS } from '../tokens'
import { cn } from '@/lib/utils'

interface SidebarSectionProps {
  section: SidebarSectionType
  isCollapsed: boolean
  isFirst?: boolean
  onItemClick?: () => void
}

export function SidebarSection({
  section,
  isCollapsed,
  isFirst = false,
  onItemClick,
}: SidebarSectionProps) {
  const { currentModuleId } = useNavigation()

  // Top divider is rendered ONLY when this is NOT the first visible section
  const dividerClass = !isFirst ? NAV_TOKENS.SECTION_DIVIDER : ''

  if (section.type === 'quick_stats') {
    return (
      <div className={cn(dividerClass)}>
        {!isCollapsed && section.title && <SectionHeader title={section.title} />}
        <SidebarQuickStats stats={section.quickStats} moduleId={currentModuleId} isCollapsed={isCollapsed} />
      </div>
    )
  }

  if (section.type === 'quick_actions' && section.quickActions) {
    return (
      <div className={cn(dividerClass)}>
        {!isCollapsed && section.title && <SectionHeader title={section.title} />}
        <SidebarQuickActions actions={section.quickActions} isCollapsed={isCollapsed} />
      </div>
    )
  }

  if (section.type === 'favorites' || section.type === 'recent' || section.type === 'pinned') {
    return (
      <div className={cn(dividerClass)}>
        <SidebarFavoritesRecent isCollapsed={isCollapsed} />
      </div>
    )
  }

  // Suppress section header if section has only 1 item and item title matches section title
  const isSingleItemMatch =
    section.items?.length === 1 &&
    !!section.title &&
    !!section.items[0]?.title &&
    section.items[0].title.toLowerCase() === section.title.toLowerCase()

  const showHeader = !isCollapsed && !!section.title && !isSingleItemMatch

  return (
    <div className={cn(dividerClass)}>
      {/* Standardized Shared Section Heading */}
      {showHeader && <SectionHeader title={section.title!} />}

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
