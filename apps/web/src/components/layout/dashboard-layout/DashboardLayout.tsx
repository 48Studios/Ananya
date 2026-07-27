'use client';

import React, { useState, useEffect } from 'react';
import { AppSidebar } from '../sidebar/AppSidebar';
import { Header } from '../header/Header';
import { Footer } from '../footer/Footer';
import { GlobalSearchModal } from '../header/GlobalSearchModal';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Load persistent sidebar collapsed state
  useEffect(() => {
    const saved = localStorage.getItem('ananya_sidebar_collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('ananya_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B for sidebar toggle, Cmd+K / Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-shell">
      {/* Permanent Collapsible AppSidebar & Mobile Drawer */}
      <AppSidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        isMobileOpen={isMobileOpen}
        onCloseMobileMenu={() => setIsMobileOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="main-viewport">
        <Header
          onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsSearchOpen(true)}
        />

        {/* Page Container Area */}
        <main className="page-container">{children}</main>

        {/* Enterprise Footer */}
        <Footer />
      </div>

      {/* Cmd+K Global Command Palette Search */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}
