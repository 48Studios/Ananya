'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Moon, Sun, Search, Bell, User, LogOut } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function Header() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const getBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return 'Dashboard'

    return segments
      .map((segment) =>
        segment
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase())
      )
      .join(' / ')
  }

  return (
    <header className="sticky top-0 z-30 bg-card border-b border-border h-16 flex items-center px-6 gap-4">
      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {getBreadcrumbs()}
        </p>
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-input rounded-lg px-3 py-2 w-64">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          placeholder="Search components, SKUs, orders..."
          className="bg-transparent text-sm outline-none w-full text-foreground placeholder-muted-foreground"
        />
      </div>

      {/* Theme Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="text-foreground hover:bg-input"
        aria-label="Toggle theme"
      >
        {mounted ? (
          theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )
        ) : (
          <Moon className="w-4 h-4" />
        )}
      </Button>

      {/* Notifications */}
      <Button
        variant="ghost"
        size="icon"
        className="relative text-foreground hover:bg-input"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
      </Button>

      {/* User Menu */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="text-foreground hover:bg-input"
          aria-label="User Menu"
        >
          <User className="w-4 h-4" />
        </Button>

        {isUserMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-popover-foreground">
                J. Sarath
              </p>
              <p className="text-xs text-muted-foreground">
                jrsarath@48studios.internal
              </p>
            </div>

            <div className="py-1">
              <button
                type="button"
                className="w-full px-4 py-2 text-sm text-popover-foreground hover:bg-input text-left transition-colors"
              >
                Profile & Settings
              </button>
            </div>

            <div className="border-t border-border py-1">
              <button
                type="button"
                className="w-full px-4 py-2 text-sm text-destructive hover:bg-input text-left transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
