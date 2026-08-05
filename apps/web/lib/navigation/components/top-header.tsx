"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
  Bell,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigation } from "../navigation-context";
import { ScanDialog } from "@/components/barcodes/scan-dialog";
import { NotificationBell } from "@/components/ui/notification-bell";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

import { HeaderAction } from "@/components/ui/header-action";
import { NAV_TOKENS } from "../tokens";

export function TopHeader() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const {
    activePath,
    currentModule,
    setSearchOpen,
    isMobileOpen,
    setIsMobileOpen,
  } = useNavigation();
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Build semantic business breadcrumbs hierarchy
  const getBreadcrumbs = () => {
    const segments = activePath.split("/").filter(Boolean);
    if (segments.length === 0) {
      return [{ title: "Dashboard", href: "/" }];
    }

    const items = [
      { title: currentModule.name, href: currentModule.defaultRoute },
    ];

    // Check if activePath matches a item or child item in currentModule.sidebar
    for (const section of currentModule.sidebar) {
      if (!section.items) continue;
      for (const item of section.items) {
        if (item.children) {
          const matchingChild = item.children.find(
            (c) => activePath === c.href || activePath.startsWith(c.href + "/"),
          );
          if (matchingChild) {
            items.push({ title: item.title, href: item.href });
            items.push({
              title: matchingChild.title,
              href: matchingChild.href,
            });
            return items;
          }
        }
        if (
          activePath === item.href ||
          (item.href !== "/" && activePath.startsWith(item.href + "/"))
        ) {
          items.push({ title: item.title, href: item.href });
          return items;
        }
      }
    }

    // Fallback: URL segment formatting
    let currentHref = "";
    segments.forEach((seg, idx) => {
      currentHref += `/${seg}`;
      const formatted = seg
        .replace(/-/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

      if (idx === 0 && currentHref === currentModule.defaultRoute) {
        return;
      }

      items.push({ title: formatted, href: currentHref });
    });

    return items;
  };

  const breadcrumbs = getBreadcrumbs();
  const currentPageTitle =
    breadcrumbs[breadcrumbs.length - 1]?.title || "Overview";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-2 select-none",
        NAV_TOKENS.HEADER_HEIGHT,
      )}
    >
      {/* Mobile Drawer Trigger */}
      <HeaderAction
        variant="outline"
        size="icon"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden"
        aria-label="Toggle Navigation Drawer"
      >
        {isMobileOpen ? (
          <X className="size-3.5" />
        ) : (
          <Menu className="size-3.5" />
        )}
      </HeaderAction>

      {/* Left: Breadcrumbs & Page Title */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <nav
          aria-label="Breadcrumb"
          className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.href + idx}>
              {idx > 0 && (
                <ChevronRight className="size-3 text-muted-foreground/60 shrink-0" />
              )}
              <Link
                href={crumb.href}
                className={cn(
                  "hover:text-foreground transition-colors truncate max-w-36",
                  idx === breadcrumbs.length - 1 &&
                    "text-foreground font-semibold",
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

      {/* Global Command Palette Trigger Button (Canonical Reference Footprint) */}
      <HeaderAction
        variant="outline"
        size="default"
        onClick={() => setSearchOpen(true)}
        className="w-48 sm:w-64 justify-start text-muted-foreground"
      >
        <Search className="size-3.5" />
        <span className="truncate flex-1 text-left">
          Search or type command...
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          <Command className="size-2.5" /> K
        </kbd>
      </HeaderAction>

      {/* Barcode & QR Quick Scan Button */}
      <HeaderAction
        variant="outline"
        size="default"
        onClick={() => setIsScanOpen(true)}
        className="inline-flex"
        title="Quick Barcode & QR Scan"
      >
        <Scan className="size-3.5 text-primary" />
        <span className="hidden sm:inline">Scan</span>
      </HeaderAction>

      {/* Quick Scan Dialog */}
      <ScanDialog isOpen={isScanOpen} onClose={() => setIsScanOpen(false)} />

      {/* Theme Toggle Header Control */}
      <HeaderAction
        variant="outline"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        title={
          mounted
            ? `Switch to ${theme === "dark" ? "light" : "dark"} mode`
            : "Toggle theme"
        }
      >
        {mounted && theme === "dark" ? (
          <Sun className="size-3.5" />
        ) : (
          <Moon className="size-3.5" />
        )}
      </HeaderAction>

      {/* Notifications Popover Bell */}
      <NotificationBell />

      {/* User Profile Menu */}
      <div className="relative">
        <HeaderAction
          variant="outline"
          size="icon"
          active={isUserMenuOpen}
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          aria-label="User Menu"
          title={user ? `${user.firstName} ${user.lastName}` : "User Account"}
        >
          <User className="size-3.5" />
        </HeaderAction>

        {isUserMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-popover border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in-50 duration-100">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <p className="text-xs font-semibold text-popover-foreground">
                {user ? `${user.firstName} ${user.lastName}` : "User Account"}
              </p>
              {user?.email && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {user.email}
                </p>
              )}
            </div>

            <div className="py-1 text-xs">
              <Link
                href="/profile"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-popover-foreground hover:bg-input text-left transition-colors"
              >
                <User className="size-3.5 text-muted-foreground" />
                <span>My Profile</span>
              </Link>
              <Link
                href="/notifications"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-popover-foreground hover:bg-input text-left transition-colors"
              >
                <Bell className="size-3.5 text-muted-foreground" />
                <span>Notification Center</span>
              </Link>
              <Link
                href="/settings/security"
                onClick={() => setIsUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2 text-popover-foreground hover:bg-input text-left transition-colors"
              >
                <ShieldCheck className="size-3.5 text-muted-foreground" />
                <span>Security Sessions</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-popover-foreground hover:bg-input text-left transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {mounted && theme === "dark" ? (
                    <Sun className="size-3.5 text-amber-500" />
                  ) : (
                    <Moon className="size-3.5 text-indigo-400" />
                  )}
                  <span>Appearance Mode</span>
                </div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {theme}
                </span>
              </button>
            </div>

            <div className="border-t border-border py-1">
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="w-full px-4 py-2 text-xs text-destructive hover:bg-input text-left transition-colors flex items-center gap-2.5"
              >
                <LogOut className="size-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
