'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Search,
  Moon,
  Sun,
  Bell,
  Menu,
  ChevronRight,
  User,
  LogOut,
  Shield,
  CheckCircle2,
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileMenu: () => void;
  onOpenCommandPalette: () => void;
}

export function Header({ onToggleMobileMenu, onOpenCommandPalette }: HeaderProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate dynamic breadcrumbs from URL pathname
  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: 'Dashboard', href: '/' },
    ...pathSegments.map((segment, idx) => {
      const href = '/' + pathSegments.slice(0, idx + 1).join('/');
      const label = segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
      return { label, href };
    }),
  ];

  return (
    <header className="app-header">
      <div className="header-left">
        {/* Mobile Menu Trigger */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="header-icon-btn mobile-only"
          aria-label="Open Navigation Menu"
        >
          <Menu size={20} />
        </button>

        {/* Dynamic Breadcrumbs */}
        <nav className="header-breadcrumbs" aria-label="Breadcrumb">
          <ol className="breadcrumb-list">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={crumb.href} className="breadcrumb-item">
                  {index > 0 && <ChevronRight size={14} className="breadcrumb-separator" />}
                  {isLast ? (
                    <span className="breadcrumb-current" aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link href={crumb.href} className="breadcrumb-link">
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      <div className="header-right">
        {/* Global Search Trigger Bar */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="header-search-trigger"
        >
          <Search size={15} className="search-icon" />
          <span className="search-placeholder">Search components, SKUs, suppliers, orders...</span>
          <kbd className="search-kbd">⌘K</kbd>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="header-icon-btn"
          title={mounted ? `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode` : 'Toggle Theme'}
          aria-label="Toggle Theme"
        >
          {mounted ? (
            theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />
          ) : (
            <Moon size={18} />
          )}
        </button>

        {/* Notifications Dropdown Container */}
        <div className="header-dropdown-wrapper">
          <button
            type="button"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className="header-icon-btn notification-btn"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="notification-badge" />
          </button>

          {showNotifications && (
            <div className="header-dropdown notification-dropdown">
              <div className="dropdown-header">
                <span className="dropdown-title">System Activity</span>
                <span className="badge-pill">3 new</span>
              </div>
              <div className="dropdown-list">
                <div className="dropdown-item">
                  <CheckCircle2 size={16} className="item-icon success" />
                  <div className="item-content">
                    <p className="item-title">Purchase Order #PO-8920 Received</p>
                    <span className="item-time">12 mins ago</span>
                  </div>
                </div>
                <div className="dropdown-item">
                  <Shield size={16} className="item-icon info" />
                  <div className="item-content">
                    <p className="item-title">Cycle Count Completed at WH-B1</p>
                    <span className="item-time">1 hour ago</span>
                  </div>
                </div>
              </div>
              <div className="dropdown-footer">
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="dropdown-action-btn"
                >
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="header-dropdown-wrapper">
          <button
            type="button"
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="user-profile-btn"
            aria-label="User Menu"
          >
            <div className="avatar-circle">JS</div>
            <span className="user-name desktop-only">J. Sarath</span>
          </button>

          {showUserMenu && (
            <div className="header-dropdown user-dropdown">
              <div className="user-info-box">
                <div className="user-full-name">J. Sarath</div>
                <div className="user-role">Lead Operations Architect</div>
                <div className="user-email">jrsarath@48studios.internal</div>
              </div>
              <div className="dropdown-divider" />
              <Link
                href="/settings"
                className="user-menu-item"
                onClick={() => setShowUserMenu(false)}
              >
                <User size={15} />
                <span>Account & Preferences</span>
              </Link>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="user-menu-item danger"
                onClick={() => setShowUserMenu(false)}
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
