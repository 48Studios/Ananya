'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Moon,
  Sun,
  Search,
  User,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Command,
  Scan,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useNavigation } from '../navigation-context'
import { Button } from '@/components/ui/button'
import { ScanDialog } from '@/components/barcodes/scan-dialog'
import { NotificationBell } from '@/components/ui/notification-bell'
import { useAuth } from '@/lib/auth/auth-context'
import { cn } from '@/lib/utils'

import { NAV_TOKENS } from '../tokens'

export function TopHeader() {
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAuth()
  const {
    activePath,
    currentModule,
    setSearchOpen,
    isMobileOpen,
    setIsMobileOpen,
  } = useNavigation()
  const [mounted, setMounted] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isScanOpen, setIsScanOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Build breadcrumbs hierarchy
  const getBreadcrumbs = () => {
    const segments = activePath.split('/').filter(Boolean)
    if (segments.length === 0) {
      return [{ title: 'Dashboard', href: '/' }]
    }

    const items = [{ title: currentModule.name, href: currentModule.defaultRoute }]

    let currentHref = ''
    segments.forEach((seg, idx) => {
      currentHref += `/${seg}`
      const formatted = seg
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())

      if (idx === 0 && currentHref === currentModule.defaultRoute) {
        // Skip duplicate module root segment
        return
      }

      items.push({ title: formatted, href: currentHref })
    })

    return items
  }

  const breadcrumbs = getBreadcrumbs()
  const currentPageTitle = breadcrumbs[breadcrumbs.length - 1]?.title || 'Overview'

  return (
    <header
      className={cn(
        'sticky top-0 z-30 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-3 select-none',
        NAV_TOKENS.HEADER_HEIGHT
      )}
    >
      {/* Mobile Drawer Trigger */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden text-muted-foreground hover:text-foreground"
        aria-label="Toggle Navigation Drawer"
      >
        {isMobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
      </Button>

      {/* Left: Breadcrumbs & Page Title */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.href + idx}>
              {idx > 0 && <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />}
              <Link
                href={crumb.href}
                className={cn(
                  'hover:text-foreground transition-colors truncate max-w-36',
                  idx === breadcrumbs.length - 1 && 'text-foreground font-semibold'
                )}
              >
                {crumb.title}
              </Link>
            </React.Fragment>
          ))}
        </nav>

        {/* Mobile Page Title */}
        <h1 className="sm:hidden text-sm font-semibold text-foreground truncate">
          {currentPageTitle}
        </h1>
      </div>

      {/* Global Command Palette Trigger Button */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 bg-input/70 hover:bg-input text-muted-foreground hover:text-foreground text-xs rounded-lg px-3 py-1.5 transition-colors border border-border/60 w-48 sm:w-64"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="truncate flex-1 text-left">Search or type command...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          <Command className="size-2.5" /> K
        </kbd>
      </button>

      {/* Barcode & QR Quick Scan Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsScanOpen(true)}
        className="hidden md:inline-flex items-center gap-1.5 text-xs text-foreground bg-input/40 hover:bg-input border-border/60"
        title="Quick Barcode & QR Scan"
      >
        <Scan className="size-3.5 text-primary" />
        <span>Scan</span>
      </Button>

      {/* Quick Scan Dialog */}
      <ScanDialog isOpen={isScanOpen} onClose={() => setIsScanOpen(false)} />

      {/* Theme Toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="text-foreground hover:bg-input"
        aria-label="Toggle theme"
      >
        {mounted && theme === 'dark' ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
      </Button>

      {/* Notifications Popover Bell */}
      <NotificationBell />

      {/* User Profile Menu */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="text-foreground hover:bg-input rounded-full"
          aria-label="User Menu"
        >
          <User className="size-4" />
        </Button>

        {isUserMenuOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in-50 duration-100">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-semibold text-popover-foreground">
                {user ? `${user.firstName} ${user.lastName}` : 'User Account'}
              </p>
              {user?.email && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {user.email}
                </p>
              )}
            </div>

            <div className="py-1">
              <Link
                href="/profile"
                onClick={() => setIsUserMenuOpen(false)}
                className="block px-4 py-2 text-xs text-popover-foreground hover:bg-input text-left transition-colors"
              >
                Profile & Security
              </Link>
              <Link
                href="/settings"
                onClick={() => setIsUserMenuOpen(false)}
                className="block px-4 py-2 text-xs text-popover-foreground hover:bg-input text-left transition-colors"
              >
                General Settings
              </Link>
            </div>

            <div className="border-t border-border py-1">
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false)
                  logout()
                }}
                className="w-full px-4 py-2 text-xs text-destructive hover:bg-input text-left transition-colors flex items-center gap-2"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
