import React from 'react'
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Factory,
  FolderKanban,
  BarChart3,
  Settings,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  ClipboardList,
  Tag,
  MapPin,
  Building2,
  ListFilter,
  Layers,
  Wrench,
  BadgeCheck,
  RotateCcw,
  FileText,
  Users,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Receipt,
  QrCode,
  Zap,
  Warehouse,
} from 'lucide-react'
import { NavigationModule } from './types'

export const navigationModules: NavigationModule[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    defaultRoute: '/',
    sidebar: [
      {
        id: 'dash-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'dash-main',
        title: 'Workspace',
        type: 'nav',
        items: [
          {
            id: 'dash-overview',
            title: 'Overview',
            href: '/',
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
        ],
      },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    icon: <Boxes className="w-4 h-4" />,
    defaultRoute: '/inventory',
    permissions: ['Inventory.Read'],
    sidebar: [
      {
        id: 'inv-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'inventory-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
      },
      {
        id: 'inventory-quick-actions',
        title: 'Quick Actions',
        type: 'quick_actions',
        quickActions: [
          {
            id: 'act-new-item',
            label: 'New Component',
            href: '/components/new',
            variant: 'default',
            icon: <Plus className="w-3.5 h-3.5" />,
          },
          {
            id: 'act-receive-stock',
            label: 'Receive Stock',
            href: '/goods-receipts/new',
            variant: 'outline',
            icon: <ArrowDownLeft className="w-3.5 h-3.5" />,
          },
          {
            id: 'act-issue-stock',
            label: 'Issue Stock',
            href: '/transactions/new',
            variant: 'outline',
            icon: <ArrowUpRight className="w-3.5 h-3.5" />,
          },
          {
            id: 'act-transfer-stock',
            label: 'Transfer Stock',
            href: '/warehouse-transfers/new',
            variant: 'outline',
            icon: <ArrowRightLeft className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: 'inventory-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          {
            id: 'inv-overview',
            title: 'Overview',
            href: '/inventory',
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: 'inv-components',
            title: 'Components Catalog',
            href: '/components',
            icon: <Boxes className="w-4 h-4" />,
          },
          {
            id: 'inv-transactions',
            title: 'Ledger & Stock Movements',
            href: '/transactions',
            icon: <ListFilter className="w-4 h-4" />,
          },
          {
            id: 'inv-warehouses-group',
            title: 'Warehouses & Storage',
            href: '/warehouses',
            icon: <Warehouse className="w-4 h-4" />,
            children: [
              { id: 'inv-warehouses', title: 'Facilities Directory', href: '/warehouses', icon: <Warehouse className="w-4 h-4" /> },
              { id: 'inv-storage-bins', title: 'Storage Bins', href: '/warehouse-bins', icon: <Boxes className="w-4 h-4" /> },
              { id: 'inv-storage-policies', title: 'Storage Policies', href: '/warehouse-policies', icon: <ShieldCheck className="w-4 h-4" /> },
              { id: 'inv-locations', title: 'Locations Directory', href: '/locations', icon: <MapPin className="w-4 h-4" /> },
            ],
          },
          {
            id: 'inv-transfers',
            title: 'Internal Transfers',
            href: '/warehouse-transfers',
            icon: <ArrowRightLeft className="w-4 h-4" />,
          },
          {
            id: 'inv-counts-group',
            title: 'Stock Counts & Adjustments',
            href: '/stock-counts',
            icon: <ClipboardList className="w-4 h-4" />,
            children: [
              { id: 'inv-stock-counts', title: 'Physical Stock Counts', href: '/stock-counts', icon: <ClipboardList className="w-4 h-4" /> },
              { id: 'inv-cycle-counts', title: 'ABC Cycle Counts', href: '/cycle-counts', icon: <RotateCcw className="w-4 h-4" /> },
              { id: 'inv-stock-adjustments', title: 'Quantity Adjustments', href: '/stock-adjustments', icon: <Wrench className="w-4 h-4" /> },
            ],
          },
          {
            id: 'inv-traceability-group',
            title: 'Traceability & Allocations',
            href: '/batches',
            icon: <FileText className="w-4 h-4" />,
            children: [
              { id: 'inv-batches', title: 'Batches & Lots', href: '/batches', icon: <FileText className="w-4 h-4" /> },
              { id: 'inv-serials', title: 'Serial Numbers', href: '/serials', icon: <Tag className="w-4 h-4" /> },
              { id: 'inv-reservations', title: 'Stock Reservations', href: '/reservations', icon: <ClipboardList className="w-4 h-4" /> },
              { id: 'inv-projections', title: 'Demand Projections', href: '/projections', icon: <ListFilter className="w-4 h-4" /> },
            ],
          },
          {
            id: 'inv-barcodes',
            title: 'Barcode & QR Studio',
            href: '/barcodes',
            icon: <QrCode className="w-4 h-4" />,
          },
          {
            id: 'inv-master-data',
            title: 'Master Data',
            href: '/categories',
            icon: <Tag className="w-4 h-4" />,
            children: [
              { id: 'inv-categories', title: 'Categories', href: '/categories', icon: <Tag className="w-4 h-4" /> },
              { id: 'inv-manufacturers', title: 'Manufacturers', href: '/manufacturers', icon: <Building2 className="w-4 h-4" /> },
              { id: 'inv-units', title: 'Units of Measure', href: '/units', icon: <ListFilter className="w-4 h-4" /> },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'procurement',
    name: 'Procurement',
    icon: <ShoppingCart className="w-4 h-4" />,
    defaultRoute: '/procurement',
    permissions: ['Procurement.Read'],
    sidebar: [
      {
        id: 'proc-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'proc-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
      },
      {
        id: 'proc-quick-actions',
        title: 'Quick Actions',
        type: 'quick_actions',
        quickActions: [
          {
            id: 'act-new-po',
            label: 'Create Purchase Order',
            href: '/purchase-orders/new',
            variant: 'default',
            icon: <Plus className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: 'proc-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'proc-overview', title: 'Overview', href: '/procurement', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'proc-pos', title: 'Purchase Orders', href: '/purchase-orders', icon: <ShoppingCart className="w-4 h-4" /> },
          { id: 'proc-receipts', title: 'Goods Receipts', href: '/goods-receipts', icon: <ArrowDownLeft className="w-4 h-4" /> },
          { id: 'proc-invoices', title: 'Purchase Invoices', href: '/purchase-invoices', icon: <Receipt className="w-4 h-4" /> },
          { id: 'proc-returns', title: 'Supplier Returns', href: '/supplier-returns', icon: <ArrowUpRight className="w-4 h-4" /> },
          {
            id: 'proc-master-data',
            title: 'Master Data',
            href: '/suppliers',
            icon: <Users className="w-4 h-4" />,
            children: [
              { id: 'proc-suppliers', title: 'Suppliers Directory', href: '/suppliers', icon: <Users className="w-4 h-4" /> },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    icon: <Factory className="w-4 h-4" />,
    defaultRoute: '/manufacturing',
    permissions: ['Manufacturing.Read'],
    sidebar: [
      {
        id: 'mfg-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'mfg-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
      },
      {
        id: 'mfg-quick-actions',
        title: 'Quick Actions',
        type: 'quick_actions',
        quickActions: [
          {
            id: 'act-new-bom',
            label: 'New BOM',
            href: '/boms/new',
            variant: 'default',
            icon: <Plus className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: 'mfg-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'mfg-overview', title: 'Overview', href: '/manufacturing', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'mfg-boms', title: 'Bills of Materials (BOM)', href: '/boms', icon: <Layers className="w-4 h-4" /> },
          { id: 'mfg-prods', title: 'Production Orders', href: '/production-orders', icon: <Factory className="w-4 h-4" /> },
          { id: 'mfg-works', title: 'Work Orders', href: '/work-orders', icon: <Wrench className="w-4 h-4" /> },
          { id: 'mfg-consumption', title: 'Material Consumption', href: '/material-consumption', icon: <ListFilter className="w-4 h-4" /> },
          { id: 'mfg-finished', title: 'Finished Goods', href: '/finished-goods', icon: <BadgeCheck className="w-4 h-4" /> },
          {
            id: 'mfg-mrp-group',
            title: 'MRP & Material Planning',
            href: '/mrp',
            icon: <RotateCcw className="w-4 h-4" />,
            children: [
              { id: 'mfg-mrp-overview', title: 'Planning Overview', href: '/mrp', icon: <LayoutDashboard className="w-4 h-4" /> },
              { id: 'mfg-mrp-runs', title: 'Planning Runs', href: '/mrp/runs', icon: <RotateCcw className="w-4 h-4" /> },
              { id: 'mfg-mrp-shortages', title: 'Material Shortages', href: '/mrp/materials', icon: <Boxes className="w-4 h-4" /> },
              { id: 'mfg-mrp-purchases', title: 'Purchase Recommendations', href: '/mrp/purchases', icon: <ShoppingCart className="w-4 h-4" /> },
              { id: 'mfg-mrp-production', title: 'Production Recommendations', href: '/mrp/production', icon: <Factory className="w-4 h-4" /> },
              { id: 'mfg-mrp-capacity', title: 'Capacity Planning', href: '/mrp/capacity', icon: <Layers className="w-4 h-4" /> },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'projects',
    name: 'Projects & Services',
    icon: <FolderKanban className="w-4 h-4" />,
    defaultRoute: '/projects',
    permissions: ['Projects.Read'],
    sidebar: [
      {
        id: 'proj-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'proj-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'proj-list', title: 'Projects', href: '/projects', icon: <FolderKanban className="w-4 h-4" /> },
          { id: 'proj-tasks', title: 'Tasks', href: '/tasks', icon: <ClipboardList className="w-4 h-4" /> },
          { id: 'proj-time', title: 'Timesheets', href: '/time', icon: <ListFilter className="w-4 h-4" /> },
          { id: 'proj-service', title: 'Service Requests', href: '/service', icon: <Wrench className="w-4 h-4" /> },
          { id: 'proj-maint', title: 'Equipment Maintenance', href: '/maintenance', icon: <Wrench className="w-4 h-4" /> },
          { id: 'proj-warranty', title: 'Warranty Tracking', href: '/warranty', icon: <ShieldAlert className="w-4 h-4" /> },
          { id: 'proj-rma', title: 'RMA Returns', href: '/rma', icon: <ArrowDownLeft className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    icon: <BarChart3 className="w-4 h-4" />,
    defaultRoute: '/reports',
    permissions: ['Reporting.Read'],
    sidebar: [
      {
        id: 'analytics-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'analytics-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'rep-overview', title: 'Reports Hub', href: '/reports', exact: true, icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'rep-inventory', title: 'Inventory Reports', href: '/reports/inventory', icon: <Boxes className="w-4 h-4" /> },
          { id: 'rep-procurement', title: 'Procurement Reports', href: '/reports/procurement', icon: <ShoppingCart className="w-4 h-4" /> },
          { id: 'rep-manufacturing', title: 'Manufacturing Reports', href: '/reports/manufacturing', icon: <Factory className="w-4 h-4" /> },
          { id: 'rep-projects', title: 'Project Reports', href: '/reports/projects', icon: <FolderKanban className="w-4 h-4" /> },
          { id: 'rep-transactions', title: 'Transaction Reports', href: '/reports/transactions', icon: <ArrowRightLeft className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'settings',
    name: 'Administration',
    icon: <Settings className="w-4 h-4" />,
    defaultRoute: '/settings',
    permissions: ['Administration.Security'],
    sidebar: [
      {
        id: 'admin-favorites',
        title: 'Favorites & Recent',
        type: 'favorites',
      },
      {
        id: 'admin-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'settings-main', title: 'Organization Profile', href: '/settings', icon: <Settings className="w-4 h-4" /> },
          { id: 'settings-users', title: 'Users Directory', href: '/users', icon: <Users className="w-4 h-4" /> },
          { id: 'settings-roles', title: 'Roles & Permissions', href: '/roles', icon: <Shield className="w-4 h-4" /> },
          { id: 'settings-workflows', title: 'Workflow Automation', href: '/workflows', icon: <Zap className="w-4 h-4" /> },
          { id: 'settings-activity', title: 'Activity Center', href: '/activity', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'settings-audit', title: 'Audit Explorer', href: '/audit', icon: <ShieldCheck className="w-4 h-4" /> },
          { id: 'settings-security', title: 'Security Audit Log', href: '/settings/security', icon: <ShieldAlert className="w-4 h-4" /> },
        ],
      },
    ],
  },
]

export function getModuleForPath(pathname: string): NavigationModule {
  const fallback = navigationModules[0]!
  if (pathname === '/') {
    return fallback
  }

  for (const mod of navigationModules) {
    if (mod.id === 'dashboard') continue

    // Direct default route match
    if (pathname === mod.defaultRoute || pathname.startsWith(mod.defaultRoute + '/')) {
      return mod
    }

    // Check items inside sections
    for (const section of mod.sidebar) {
      if (!section.items) continue
      for (const item of section.items) {
        if (pathname === item.href || pathname.startsWith(item.href + '/')) {
          return mod
        }
        if (item.children) {
          for (const child of item.children) {
            if (pathname === child.href || pathname.startsWith(child.href + '/')) {
              return mod
            }
          }
        }
      }
    }
  }

  // Fallback to Dashboard
  return fallback
}
