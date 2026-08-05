import { ReactNode } from "react";

export interface QuickStat {
  id: string;
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  href?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export interface NavigationItem {
  id: string;
  title: string;
  href: string;
  exact?: boolean;
  icon?: ReactNode;
  badge?: string | number;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  permissions?: string[];
  featureFlag?: string;
  children?: NavigationItem[];
}

export interface SidebarSection {
  id: string;
  title: string;
  type:
    | "nav"
    | "quick_stats"
    | "quick_actions"
    | "pinned"
    | "favorites"
    | "recent"
    | "settings";
  collapsible?: boolean;
  items?: NavigationItem[];
  quickStats?: QuickStat[];
  quickActions?: QuickAction[];
}

export interface NavigationModule {
  id: string;
  name: string;
  icon: ReactNode;
  defaultRoute: string;
  permissions?: string[];
  sidebar: SidebarSection[];
}

export interface NavigationConfig {
  modules: NavigationModule[];
}

export interface NavigationState {
  currentModuleId: string;
  activePath: string;
  isSidebarCollapsed: boolean;
  sidebarWidth: number;
  expandedAccordions: Record<string, boolean>;
  pinnedItems: string[];
  isMobileOpen: boolean;
  searchOpen: boolean;
}
