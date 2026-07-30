'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ArrowRight } from 'lucide-react'
import { useNavigation } from '../navigation-context'
import { cn } from '@/lib/utils'

interface SearchResult {
  moduleName: string
  moduleId: string
  title: string
  href: string
  icon?: React.ReactNode
}

export function CommandPalette() {
  const router = useRouter()
  const { searchOpen, setSearchOpen, modules, selectModule } = useNavigation()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Flatten all navigable links from modules
  const allResults = useMemo(() => {
    const results: SearchResult[] = []
    modules.forEach((mod) => {
      mod.sidebar.forEach((section) => {
        if (!section.items) return
        section.items.forEach((item) => {
          results.push({
            moduleName: mod.name,
            moduleId: mod.id,
            title: item.title,
            href: item.href,
            icon: item.icon,
          })
          if (item.children) {
            item.children.forEach((child) => {
              results.push({
                moduleName: mod.name,
                moduleId: mod.id,
                title: `${item.title} › ${child.title}`,
                href: child.href,
                icon: child.icon,
              })
            })
          }
        })
      })
    })
    return results
  }, [modules])

  // Filter based on search query
  const filteredResults = useMemo(() => {
    if (!query.trim()) return allResults.slice(0, 8)
    const q = query.toLowerCase()
    return allResults.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.moduleName.toLowerCase().includes(q) ||
        r.href.toLowerCase().includes(q)
    )
  }, [allResults, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!searchOpen) return null

  const handleSelect = (result: SearchResult) => {
    selectModule(result.moduleId)
    setSearchOpen(false)
    setQuery('')
    router.push(result.href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredResults.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        prev === 0 ? Math.max(0, filteredResults.length - 1) : prev - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setSearchOpen(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150">
      <div
        className="relative w-full max-w-xl bg-popover border border-border rounded-xl shadow-2xl overflow-hidden text-popover-foreground flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 h-12 border-b border-border gap-3">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a page, command, or module..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
            >
              <X className="size-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No results found for &quot;{query}&quot;
            </div>
          ) : (
            filteredResults.map((res, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={`${res.href}-${idx}`}
                  type="button"
                  onClick={() => handleSelect(res)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors text-left outline-none',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0 size-4 flex items-center justify-center opacity-80">
                      {res.icon}
                    </span>
                    <span className="truncate">{res.title}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] opacity-70 shrink-0">
                    <span className="font-semibold uppercase tracking-wider">
                      {res.moduleName}
                    </span>
                    <ArrowRight className="size-3" />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 text-[11px] text-muted-foreground flex justify-between items-center">
          <span>Navigate with ↑ ↓ and Press Enter</span>
          <span className="font-mono text-[10px]">Ananya Palette</span>
        </div>
      </div>
    </div>
  )
}
