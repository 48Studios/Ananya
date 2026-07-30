'use client'

import React from 'react'
import { NavigationProvider } from '@/lib/navigation/navigation-context'
import { NavigationRail } from '@/lib/navigation/components/navigation-rail'
import { ContextSidebar } from '@/lib/navigation/components/context-sidebar'
import { TopHeader } from '@/lib/navigation/components/top-header'
import { MobileDrawer } from '@/lib/navigation/components/mobile-drawer'
import { CommandPalette } from '@/lib/navigation/components/command-palette'
import { Footer } from '@/components/footer'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Desktop Region 1: Global Navigation Rail (Fixed 60px) */}
        <div className="hidden md:block">
          <NavigationRail />
        </div>

        {/* Desktop Region 2: Context Sidebar (280px / 72px collapsed) */}
        <div className="hidden md:block">
          <ContextSidebar />
        </div>

        {/* Mobile Navigation Drawer */}
        <MobileDrawer />

        {/* Global Command Palette (⌘K) */}
        <CommandPalette />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <TopHeader />
          <main className="flex-1 overflow-y-auto bg-background">
            <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full min-h-[calc(100vh-8rem)]">
              {children}
            </div>
            <Footer />
          </main>
        </div>
      </div>
    </NavigationProvider>
  )
}
