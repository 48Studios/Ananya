import React from 'react'
import {
  LayoutDashboard,
  Boxes,
  Truck,
  Factory,
  ShoppingCart,
  Warehouse,
  Landmark,
  Users,
  FolderKanban,
  RotateCcw,
  FileText,
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
  FileSpreadsheet,
  Receipt,
  UserCheck,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  QrCode,
  Shield,
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
        id: 'dashboard-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
        quickStats: [
          { id: 'stat-active-po', label: 'Active POs', value: '14', trend: 'up' },
          { id: 'stat-low-stock', label: 'Low Stock Alerts', value: '8', trend: 'down' },
        ],
      },
      {
        id: 'dashboard-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'dashboard-main',
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
    sidebar: [
      {
        id: 'inventory-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
        quickStats: [
          { id: 'inv-items', label: 'Total SKUs', value: '1,240' },
          { id: 'inv-low', label: 'Low Stock', value: '12', trend: 'down' },
        ],
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
        id: 'inventory-pinned',
        title: 'Pinned',
        type: 'pinned',
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
            id: 'inv-master-data',
            title: 'Master Data',
            href: '/components',
            icon: <Boxes className="w-4 h-4" />,
            children: [
              { id: 'inv-components', title: 'Components', href: '/components', icon: <Boxes className="w-4 h-4" /> },
              { id: 'inv-categories', title: 'Categories', href: '/categories', icon: <Tag className="w-4 h-4" /> },
              { id: 'inv-manufacturers', title: 'Manufacturers', href: '/manufacturers', icon: <Building2 className="w-4 h-4" /> },
              { id: 'inv-locations', title: 'Locations', href: '/locations', icon: <MapPin className="w-4 h-4" /> },
            ],
          },
          {
            id: 'inv-operations',
            title: 'Operations',
            href: '/transactions',
            icon: <ListFilter className="w-4 h-4" />,
            children: [
              { id: 'inv-transactions', title: 'Ledger Transactions', href: '/transactions', icon: <ListFilter className="w-4 h-4" /> },
              { id: 'inv-adjustments', title: 'Stock Adjustments', href: '/stock-adjustments', icon: <Wrench className="w-4 h-4" /> },
              { id: 'inv-barcodes', title: 'Barcode & QR Studio', href: '/barcodes', icon: <QrCode className="w-4 h-4" /> },
            ],
          },
          {
            id: 'inv-audits',
            title: 'Audits & Counts',
            href: '/stock-counts',
            icon: <ClipboardList className="w-4 h-4" />,
            children: [
              { id: 'inv-stock-counts', title: 'Stock Counts', href: '/stock-counts', icon: <ClipboardList className="w-4 h-4" /> },
              { id: 'inv-cycle-counts', title: 'Cycle Counts', href: '/cycle-counts', icon: <RotateCcw className="w-4 h-4" /> },
            ],
          },
        ],
      },
      {
        id: 'inventory-settings',
        title: 'Settings',
        type: 'settings',
        items: [
          { id: 'inv-settings-link', title: 'Inventory Settings', href: '/settings?tab=inventory', icon: <Settings className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'procurement',
    name: 'Procurement',
    icon: <Truck className="w-4 h-4" />,
    defaultRoute: '/procurement',
    sidebar: [
      {
        id: 'proc-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
        quickStats: [
          { id: 'proc-open-po', label: 'Open Orders', value: '9' },
          { id: 'proc-pending-rec', label: 'Pending Receipts', value: '4' },
        ],
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
        id: 'proc-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'proc-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'proc-overview', title: 'Overview', href: '/procurement', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'proc-suppliers', title: 'Suppliers', href: '/suppliers', icon: <Users className="w-4 h-4" /> },
          { id: 'proc-pos', title: 'Purchase Orders', href: '/purchase-orders', icon: <Truck className="w-4 h-4" /> },
          { id: 'proc-receipts', title: 'Goods Receipts', href: '/goods-receipts', icon: <ArrowDownLeft className="w-4 h-4" /> },
          { id: 'proc-returns', title: 'Supplier Returns', href: '/supplier-returns', icon: <ArrowUpRight className="w-4 h-4" /> },
          { id: 'proc-invoices', title: 'Purchase Invoices', href: '/purchase-invoices', icon: <Receipt className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing',
    icon: <Factory className="w-4 h-4" />,
    defaultRoute: '/manufacturing',
    sidebar: [
      {
        id: 'mfg-quick-stats',
        title: 'Quick Stats',
        type: 'quick_stats',
        quickStats: [
          { id: 'mfg-boms', label: 'Active BOMs', value: '34' },
          { id: 'mfg-active-wo', label: 'Active Work Orders', value: '7' },
        ],
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
        id: 'mfg-pinned',
        title: 'Pinned',
        type: 'pinned',
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
        ],
      },
    ],
  },
  {
    id: 'sales',
    name: 'Sales',
    icon: <ShoppingCart className="w-4 h-4" />,
    defaultRoute: '/sales',
    sidebar: [
      {
        id: 'sales-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'sales-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'sales-overview', title: 'Overview', href: '/sales', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'sales-customers', title: 'Customers', href: '/customers', icon: <UserCheck className="w-4 h-4" /> },
          { id: 'sales-quotes', title: 'Quotations', href: '/quotations', icon: <FileSpreadsheet className="w-4 h-4" /> },
          { id: 'sales-orders', title: 'Sales Orders', href: '/sales-orders', icon: <ShoppingCart className="w-4 h-4" /> },
          { id: 'sales-fulfillment', title: 'Fulfillment', href: '/fulfillment', icon: <PackageCheck className="w-4 h-4" /> },
          { id: 'sales-returns', title: 'Customer Returns', href: '/customer-returns', icon: <ArrowDownLeft className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'warehouse',
    name: 'Warehouse & Logistics',
    icon: <Warehouse className="w-4 h-4" />,
    defaultRoute: '/warehouse',
    sidebar: [
      {
        id: 'wh-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'wh-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'wh-overview', title: 'Overview', href: '/warehouse', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'wh-warehouses', title: 'Warehouses', href: '/warehouses', icon: <Warehouse className="w-4 h-4" /> },
          { id: 'wh-bins', title: 'Storage Bins', href: '/warehouse-bins', icon: <Boxes className="w-4 h-4" /> },
          { id: 'wh-transfers', title: 'Internal Transfers', href: '/warehouse-transfers', icon: <ArrowRightLeft className="w-4 h-4" /> },
          { id: 'wh-policies', title: 'Storage Policies', href: '/warehouse-policies', icon: <ShieldCheck className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: <Landmark className="w-4 h-4" />,
    defaultRoute: '/finance',
    sidebar: [
      {
        id: 'fin-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'fin-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'fin-overview', title: 'Overview', href: '/finance', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'fin-coa', title: 'Chart of Accounts', href: '/chart-of-accounts', icon: <FileSpreadsheet className="w-4 h-4" /> },
          { id: 'fin-journals', title: 'Journal Entries', href: '/journal-entries', icon: <ListFilter className="w-4 h-4" /> },
          { id: 'fin-ar', title: 'Accounts Receivable', href: '/accounts-receivable', icon: <ArrowDownLeft className="w-4 h-4" /> },
          { id: 'fin-ap', title: 'Accounts Payable', href: '/accounts-payable', icon: <ArrowUpRight className="w-4 h-4" /> },
          { id: 'fin-payments', title: 'Payments', href: '/payments', icon: <Receipt className="w-4 h-4" /> },
          { id: 'fin-banks', title: 'Bank Accounts', href: '/bank-accounts', icon: <Landmark className="w-4 h-4" /> },
          { id: 'fin-recon', title: 'Bank Reconciliation', href: '/bank-reconciliation', icon: <RotateCcw className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    icon: <Users className="w-4 h-4" />,
    defaultRoute: '/crm',
    sidebar: [
      {
        id: 'crm-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'crm-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'crm-overview', title: 'Overview', href: '/crm', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'crm-leads', title: 'Leads', href: '/leads', icon: <Users className="w-4 h-4" /> },
          { id: 'crm-accounts', title: 'Accounts', href: '/accounts', icon: <Building2 className="w-4 h-4" /> },
          { id: 'crm-opps', title: 'Opportunities', href: '/opportunities', icon: <ShoppingCart className="w-4 h-4" /> },
          { id: 'crm-activities', title: 'Activities', href: '/activities', icon: <ClipboardList className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'projects',
    name: 'Projects & Service',
    icon: <FolderKanban className="w-4 h-4" />,
    defaultRoute: '/projects',
    sidebar: [
      {
        id: 'proj-pinned',
        title: 'Pinned',
        type: 'pinned',
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
          { id: 'proj-rma', title: 'RMA', href: '/rma', icon: <ArrowDownLeft className="w-4 h-4" /> },
          { id: 'proj-warranty', title: 'Warranty', href: '/warranty', icon: <ShieldAlert className="w-4 h-4" /> },
          { id: 'proj-maint', title: 'Maintenance', href: '/maintenance', icon: <Wrench className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'mrp',
    name: 'MRP & Planning',
    icon: <RotateCcw className="w-4 h-4" />,
    defaultRoute: '/mrp',
    sidebar: [
      {
        id: 'mrp-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'mrp-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'mrp-overview', title: 'Overview', href: '/mrp', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'mrp-runs', title: 'Planning Runs', href: '/mrp/runs', icon: <RotateCcw className="w-4 h-4" /> },
          { id: 'mrp-materials', title: 'Material Shortages', href: '/mrp/materials', icon: <Boxes className="w-4 h-4" /> },
          { id: 'mrp-purchases', title: 'Purchase Recs', href: '/mrp/purchases', icon: <Truck className="w-4 h-4" /> },
          { id: 'mrp-production', title: 'Production Recs', href: '/mrp/production', icon: <Factory className="w-4 h-4" /> },
          { id: 'mrp-capacity', title: 'Capacity Planning', href: '/mrp/capacity', icon: <Layers className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'traceability',
    name: 'Traceability',
    icon: <FileText className="w-4 h-4" />,
    defaultRoute: '/batches',
    sidebar: [
      {
        id: 'trace-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'trace-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'trace-batches', title: 'Batches', href: '/batches', icon: <FileText className="w-4 h-4" /> },
          { id: 'trace-serials', title: 'Serials', href: '/serials', icon: <Tag className="w-4 h-4" /> },
          { id: 'trace-reservations', title: 'Stock Reservations', href: '/reservations', icon: <ClipboardList className="w-4 h-4" /> },
          { id: 'trace-projections', title: 'Demand Projections', href: '/projections', icon: <ListFilter className="w-4 h-4" /> },
        ],
      },
    ],
  },
  {
    id: 'reports',
    name: 'Reporting & Analytics',
    icon: <BarChart3 className="w-4 h-4" />,
    defaultRoute: '/reports',
    sidebar: [
      {
        id: 'reports-pinned',
        title: 'Pinned',
        type: 'pinned',
      },
      {
        id: 'reports-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'rep-overview', title: 'Reports Hub', href: '/reports', icon: <LayoutDashboard className="w-4 h-4" /> },
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
    name: 'Settings',
    icon: <Settings className="w-4 h-4" />,
    defaultRoute: '/settings',
    sidebar: [
      {
        id: 'settings-nav',
        title: 'Workspace',
        type: 'nav',
        items: [
          { id: 'settings-main', title: 'General Settings', href: '/settings', icon: <Settings className="w-4 h-4" /> },
          { id: 'settings-activity', title: 'Activity Center', href: '/activity', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'settings-audit', title: 'Audit Explorer', href: '/audit', icon: <Shield className="w-4 h-4" /> },
          { id: 'settings-profile', title: 'My Profile', href: '/profile', icon: <UserCheck className="w-4 h-4" /> },
          { id: 'settings-users', title: 'Users Directory', href: '/users', icon: <Users className="w-4 h-4" /> },
          { id: 'settings-roles', title: 'Roles & Permissions', href: '/roles', icon: <Shield className="w-4 h-4" /> },
          { id: 'settings-security', title: 'Security Audit Log', href: '/settings/security', icon: <ShieldCheck className="w-4 h-4" /> },
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
