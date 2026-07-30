'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { NavigationModule } from './types'
import { navigationModules, getModuleForPath } from './navigation-config'

interface NavigationContextType {
  modules: NavigationModule[]
  currentModule: NavigationModule
  currentModuleId: string
  activePath: string
  isSidebarCollapsed: boolean
  sidebarWidth: number
  expandedAccordions: Record<string, boolean>
  pinnedItems: string[]
  isMobileOpen: boolean
  searchOpen: boolean
  selectModule: (moduleId: string) => void
  toggleAccordion: (accordionId: string) => void
  setAccordionOpen: (accordionId: string, isOpen: boolean) => void
  toggleSidebarCollapse: () => void
  togglePinnedItem: (href: string) => void
  isItemPinned: (href: string) => boolean
  setIsMobileOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
}

const STORAGE_KEYS = {
  COLLAPSED: 'ananya_sidebar_collapsed',
  ACCORDIONS: 'ananya_expanded_accordions',
  PINNED: 'ananya_pinned_items',
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [currentModuleId, setCurrentModuleId] = useState<string>('dashboard')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({})
  const [pinnedItems, setPinnedItems] = useState<string[]>([])
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false)
  const [searchOpen, setSearchOpen] = useState<boolean>(false)

  // Load initial settings from localStorage on client mount
  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem(STORAGE_KEYS.COLLAPSED)
      if (savedCollapsed !== null) {
        setIsSidebarCollapsed(JSON.parse(savedCollapsed))
      }

      const savedAccordions = localStorage.getItem(STORAGE_KEYS.ACCORDIONS)
      if (savedAccordions) {
        setExpandedAccordions(JSON.parse(savedAccordions))
      }

      const savedPinned = localStorage.getItem(STORAGE_KEYS.PINNED)
      if (savedPinned) {
        setPinnedItems(JSON.parse(savedPinned))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Sync route changes to active module and auto-expand relevant accordions
  useEffect(() => {
    const matchedModule = getModuleForPath(pathname)
    setCurrentModuleId(matchedModule.id)

    // Auto expand accordion if child item matches active pathname
    for (const section of matchedModule.sidebar) {
      if (!section.items) continue
      for (const item of section.items) {
        if (item.children) {
          const hasActiveChild = item.children.some(
            (child) => pathname === child.href || pathname.startsWith(child.href + '/')
          )
          if (hasActiveChild) {
            setExpandedAccordions((prev) => {
              if (prev[item.id]) return prev
              const next = { ...prev, [item.id]: true }
              try {
                localStorage.setItem(STORAGE_KEYS.ACCORDIONS, JSON.stringify(next))
              } catch {
                // ignore
              }
              return next
            })
          }
        }
      }
    }
  }, [pathname])

  // Global Command Palette (Cmd+K / Ctrl+K) shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const currentModule =
    navigationModules.find((m) => m.id === currentModuleId) || navigationModules[0]!

  const selectModule = useCallback((moduleId: string) => {
    setCurrentModuleId(moduleId)
  }, [])

  const toggleAccordion = useCallback((accordionId: string) => {
    setExpandedAccordions((prev) => {
      const next = { ...prev, [accordionId]: !prev[accordionId] }
      try {
        localStorage.setItem(STORAGE_KEYS.ACCORDIONS, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const setAccordionOpen = useCallback((accordionId: string, isOpen: boolean) => {
    setExpandedAccordions((prev) => {
      const next = { ...prev, [accordionId]: isOpen }
      try {
        localStorage.setItem(STORAGE_KEYS.ACCORDIONS, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEYS.COLLAPSED, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const togglePinnedItem = useCallback((href: string) => {
    setPinnedItems((prev) => {
      const exists = prev.includes(href)
      const next = exists ? prev.filter((item) => item !== href) : [...prev, href]
      try {
        localStorage.setItem(STORAGE_KEYS.PINNED, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const isItemPinned = useCallback(
    (href: string) => pinnedItems.includes(href),
    [pinnedItems]
  )

  const sidebarWidth = isSidebarCollapsed ? 72 : 280

  return (
    <NavigationContext.Provider
      value={{
        modules: navigationModules,
        currentModule,
        currentModuleId,
        activePath: pathname,
        isSidebarCollapsed,
        sidebarWidth,
        expandedAccordions,
        pinnedItems,
        isMobileOpen,
        searchOpen,
        selectModule,
        toggleAccordion,
        setAccordionOpen,
        toggleSidebarCollapse,
        togglePinnedItem,
        isItemPinned,
        setIsMobileOpen,
        setSearchOpen,
      }}
    >
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
}
