'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, ShieldCheck, X } from 'lucide-react';
import { navigationRegistry, NavGroup, NavGroupItem, NavSubItem } from '../../navigation/registry';

export interface AppSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobileMenu: () => void;
}

export function AppSidebar({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobileMenu,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Auto-expand active group based on current route
  useEffect(() => {
    navigationRegistry.forEach((group: NavGroup) => {
      group.items.forEach((item: NavGroupItem) => {
        if (item.children) {
          const isChildActive = item.children.some(
            (subItem: NavSubItem) => pathname === subItem.href || pathname.startsWith(subItem.href + '/')
          );
          if (isChildActive) {
            setExpandedGroups((prev) => ({ ...prev, [item.label]: true }));
          }
        }
      });
    });
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const renderNavContent = () => (
    <div className="sidebar-container">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <Link href="/" className="brand-logo" onClick={onCloseMobileMenu}>
          <div className="logo-icon">
            <ShieldCheck size={20} className="logo-symbol" />
          </div>
          {!isCollapsed && (
            <div className="brand-text">
              <span className="brand-name">ANANYA</span>
              <span className="brand-subtitle">48 STUDIOS ERP</span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="collapse-toggle-btn desktop-only"
          title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          aria-label="Toggle Sidebar"
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          type="button"
          onClick={onCloseMobileMenu}
          className="mobile-close-btn mobile-only"
          aria-label="Close Navigation"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav-scroll" aria-label="Main Navigation">
        {navigationRegistry.map((group: NavGroup) => (
          <div key={group.title} className="sidebar-section">
            {!isCollapsed && <div className="sidebar-section-heading">{group.title}</div>}
            <div className="sidebar-section-items">
              {group.items.map((item: NavGroupItem) => {
                const hasChildren = item.children && item.children.length > 0;
                const isGroupExpanded = expandedGroups[item.label];
                const isDirectActive = item.href ? pathname === item.href : false;
                const isAnyChildActive = hasChildren
                  ? item.children?.some(
                      (sub: NavSubItem) => pathname === sub.href || pathname.startsWith(sub.href + '/')
                    )
                  : false;
                const isActive = isDirectActive || isAnyChildActive;

                if (!hasChildren && item.href) {
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onCloseMobileMenu}
                      className={`sidebar-link ${isActive ? 'active' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className="sidebar-icon">{item.icon}</span>
                      {!isCollapsed && <span className="sidebar-label">{item.label}</span>}
                    </Link>
                  );
                }

                return (
                  <div key={item.label} className="sidebar-dropdown-group">
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.label)}
                      className={`sidebar-link dropdown-trigger ${isActive ? 'active' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className="sidebar-icon">{item.icon}</span>
                      {!isCollapsed && (
                        <>
                          <span className="sidebar-label">{item.label}</span>
                          <span className="dropdown-arrow">
                            {isGroupExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        </>
                      )}
                    </button>

                    {/* Submenu rendering */}
                    {hasChildren && (!isCollapsed || isMobileOpen) && isGroupExpanded && (
                      <div className="sidebar-submenu">
                        {item.children?.map((sub: NavSubItem) => {
                          const isSubActive = pathname === sub.href;
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={onCloseMobileMenu}
                              className={`submenu-link ${isSubActive ? 'active' : ''}`}
                            >
                              <span className="submenu-dot" />
                              <span className="submenu-label">{sub.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : 'expanded'} desktop-only`}>
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="mobile-sidebar-backdrop" onClick={onCloseMobileMenu}>
          <aside
            className="app-sidebar mobile-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {renderNavContent()}
          </aside>
        </div>
      )}
    </>
  );
}
