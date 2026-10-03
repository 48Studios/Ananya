import React from "react";
import {
  LayoutDashboard,
  Archive,
  Package,
  ShoppingCart,
  Factory,
  Kanban,
  BarChart3,
  Settings,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  ClipboardList,
  ClipboardCheck,
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
  Bell,
  Zap,
  Warehouse,
  Sliders,
  Box,
  Database,
  Brain,
} from "lucide-react";
import { NavigationModule } from "./types";

export const navigationModules: NavigationModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    defaultRoute: "/dashboard",
    sidebar: [
      {
        id: "dash-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "dash-quick-stats",
        title: "Quick Stats",
        type: "quick_stats",
      },
      {
        id: "dash-quick-actions",
        title: "Quick Actions",
        type: "quick_actions",
        quickActions: [
          {
            id: "act-dash-new-item",
            label: "New Component",
            href: "/inventory/components/new",
            variant: "default",
            icon: <Plus className="w-3.5 h-3.5" />,
          },
          {
            id: "act-dash-create-po",
            label: "Create Purchase Order",
            href: "/procurement/purchase-orders/new",
            variant: "outline",
            icon: <ShoppingCart className="w-3.5 h-3.5" />,
          },
          {
            id: "act-dash-receive-stock",
            label: "Receive Stock",
            href: "/procurement/goods-receipts/new",
            variant: "outline",
            icon: <ArrowDownLeft className="w-3.5 h-3.5" />,
          },
          {
            id: "act-dash-barcode-studio",
            label: "Barcode Studio",
            href: "/inventory/barcodes",
            variant: "outline",
            icon: <QrCode className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: "dash-main",
        title: "Operations Hub",
        type: "nav",
        items: [
          {
            id: "dash-overview",
            title: "Overview",
            href: "/dashboard",
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: "dash-activity",
            title: "Operational Activity",
            href: "/dashboard/activity",
            icon: <BarChart3 className="w-4 h-4" />,
          },
          {
            id: "dash-notifications",
            title: "Notification Center",
            href: "/notifications",
            icon: <Bell className="w-4 h-4" />,
          },
        ],
      },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    icon: <Package className="w-4 h-4" />,
    defaultRoute: "/inventory",
    permissions: ["Inventory.Read"],
    sidebar: [
      {
        id: "inv-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "inventory-quick-stats",
        title: "Quick Stats",
        type: "quick_stats",
      },
      {
        id: "inventory-quick-actions",
        title: "Quick Actions",
        type: "quick_actions",
        quickActions: [
          {
            id: "act-new-item",
            label: "New Component",
            href: "/inventory/components/new",
            variant: "default",
            icon: <Plus className="w-3.5 h-3.5" />,
          },
          {
            id: "act-receive-stock",
            label: "Receive Stock",
            href: "/procurement/goods-receipts/new",
            variant: "outline",
            icon: <ArrowDownLeft className="w-3.5 h-3.5" />,
          },
          {
            id: "act-issue-stock",
            label: "Issue Stock",
            // The stock ledger is immutable and movements originate from domain
            // operations; adjustments are the existing issue/reconcile flow.
            href: "/inventory/stock-counts/adjustments",
            variant: "outline",
            icon: <ArrowUpRight className="w-3.5 h-3.5" />,
          },
          {
            id: "act-transfer-stock",
            label: "Transfer Stock",
            href: "/inventory/warehouse-transfers/new",
            variant: "outline",
            icon: <ArrowRightLeft className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: "inventory-nav",
        title: "Workspace",
        type: "nav",
        items: [
          {
            id: "inv-overview",
            title: "Overview",
            href: "/inventory",
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: "inv-components",
            title: "Components Catalog",
            href: "/inventory/components",
            icon: <Archive className="w-4 h-4" />,
          },
          {
            id: "inv-transactions",
            title: "Ledger & Stock Movements",
            href: "/inventory/transactions",
            icon: <ListFilter className="w-4 h-4" />,
          },
          {
            id: "inv-warehouses-group",
            title: "Warehouses & Storage",
            href: "/inventory/locations",
            icon: <Warehouse className="w-4 h-4" />,
            children: [
              {
                id: "inv-locations",
                title: "Storage Locations & Bins",
                href: "/inventory/locations",
                icon: <MapPin className="w-4 h-4" />,
              },
              {
                id: "inv-spatial-inventory",
                title: "Spatial Inventory",
                href: "/inventory/locations/spatial",
                icon: <Layers className="w-4 h-4" />,
              },
              {
                id: "inv-inventory-builder",
                title: "Inventory Builder",
                href: "/inventory/locations/spatial-builder",
                icon: <Sliders className="w-4 h-4" />,
              },
              {
                id: "inv-spatial-models",
                title: "Spatial Models & Anchors",
                href: "/inventory/locations/spatial-models",
                icon: <Box className="w-4 h-4" />,
              },
              {
                id: "inv-storage-policies",
                title: "Storage Policies",
                href: "/inventory/locations/policies",
                icon: <ShieldCheck className="w-4 h-4" />,
              },
            ],
          },
          {
            id: "inv-transfers",
            title: "Internal Transfers",
            href: "/inventory/warehouse-transfers",
            icon: <ArrowRightLeft className="w-4 h-4" />,
          },
          {
            id: "inv-counts-group",
            title: "Stock Counts & Adjustments",
            href: "/inventory/stock-counts",
            icon: <ClipboardList className="w-4 h-4" />,
            children: [
              {
                id: "inv-stock-counts",
                title: "Physical Stock Counts",
                href: "/inventory/stock-counts",
                icon: <ClipboardList className="w-4 h-4" />,
              },
              {
                id: "inv-cycle-counts",
                title: "ABC Cycle Counts",
                href: "/inventory/stock-counts/cycle-counts",
                icon: <RotateCcw className="w-4 h-4" />,
              },
              {
                id: "inv-stock-adjustments",
                title: "Quantity Adjustments",
                href: "/inventory/stock-counts/adjustments",
                icon: <Wrench className="w-4 h-4" />,
              },
            ],
          },
          {
            id: "inv-traceability-group",
            title: "Traceability & Allocations",
            href: "/inventory/batches",
            icon: <FileText className="w-4 h-4" />,
            children: [
              {
                id: "inv-batches",
                title: "Batches & Lots",
                href: "/inventory/batches",
                icon: <FileText className="w-4 h-4" />,
              },
              {
                id: "inv-serials",
                title: "Serial Numbers",
                href: "/inventory/batches/serials",
                icon: <Tag className="w-4 h-4" />,
              },
              {
                id: "inv-reservations",
                title: "Stock Reservations",
                href: "/inventory/batches/reservations",
                icon: <ClipboardList className="w-4 h-4" />,
              },
              {
                id: "inv-projections",
                title: "Demand Projections",
                href: "/inventory/batches/projections",
                icon: <ListFilter className="w-4 h-4" />,
              },
            ],
          },
          {
            id: "inv-barcodes",
            title: "Barcode & QR Studio",
            href: "/inventory/barcodes",
            icon: <QrCode className="w-4 h-4" />,
          },
          {
            id: "inv-master-data",
            title: "Master Data",
            href: "/inventory/master/categories",
            icon: <Database className="w-4 h-4" />,
            children: [
              {
                id: "inv-categories",
                title: "Categories",
                href: "/inventory/master/categories",
                icon: <Tag className="w-4 h-4" />,
              },
              {
                id: "inv-manufacturers",
                title: "Manufacturers",
                href: "/inventory/master/manufacturers",
                icon: <Building2 className="w-4 h-4" />,
              },
              {
                id: "inv-units",
                title: "Units of Measure",
                href: "/inventory/master/units",
                icon: <ListFilter className="w-4 h-4" />,
              },
              {
                id: "inv-attributes",
                title: "Attribute Library",
                href: "/inventory/master/attributes",
                icon: <Sliders className="w-4 h-4" />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "procurement",
    name: "Procurement",
    icon: <ShoppingCart className="w-4 h-4" />,
    defaultRoute: "/procurement",
    permissions: ["PurchaseOrders.Read"],
    sidebar: [
      {
        id: "proc-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "proc-quick-stats",
        title: "Quick Stats",
        type: "quick_stats",
      },
      {
        id: "proc-quick-actions",
        title: "Quick Actions",
        type: "quick_actions",
        quickActions: [
          {
            id: "act-new-po",
            label: "Create Purchase Order",
            href: "/procurement/purchase-orders/new",
            variant: "default",
            icon: <Plus className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: "proc-nav",
        title: "Workspace",
        type: "nav",
        items: [
          {
            id: "proc-overview",
            title: "Overview",
            href: "/procurement",
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: "proc-pos",
            title: "Purchase Orders",
            href: "/procurement/purchase-orders",
            icon: <ShoppingCart className="w-4 h-4" />,
          },
          {
            id: "proc-receipts",
            title: "Goods Receipts",
            href: "/procurement/goods-receipts",
            icon: <ArrowDownLeft className="w-4 h-4" />,
          },
          {
            id: "proc-invoices",
            title: "Purchase Invoices",
            href: "/procurement/purchase-invoices",
            icon: <Receipt className="w-4 h-4" />,
          },
          {
            id: "proc-returns",
            title: "Supplier Returns",
            href: "/procurement/supplier-returns",
            icon: <ArrowUpRight className="w-4 h-4" />,
          },
          {
            id: "proc-master-data",
            title: "Master Data",
            href: "/procurement/master/suppliers",
            icon: <Database className="w-4 h-4" />,
            children: [
              {
                id: "proc-suppliers",
                title: "Suppliers Directory",
                href: "/procurement/master/suppliers",
                icon: <Users className="w-4 h-4" />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    icon: <Factory className="w-4 h-4" />,
    defaultRoute: "/manufacturing",
    permissions: ["BOM.Read"],
    sidebar: [
      {
        id: "mfg-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "mfg-quick-stats",
        title: "Quick Stats",
        type: "quick_stats",
      },
      {
        id: "mfg-quick-actions",
        title: "Quick Actions",
        type: "quick_actions",
        quickActions: [
          {
            id: "act-new-bom",
            label: "New BOM",
            href: "/manufacturing/boms/new",
            variant: "default",
            icon: <Plus className="w-3.5 h-3.5" />,
          },
        ],
      },
      {
        id: "mfg-nav",
        title: "Workspace",
        type: "nav",
        items: [
          {
            id: "mfg-overview",
            title: "Overview",
            href: "/manufacturing",
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: "mfg-boms",
            title: "Bills of Materials (BOM)",
            href: "/manufacturing/boms",
            icon: <Layers className="w-4 h-4" />,
          },
          {
            id: "mfg-prods",
            title: "Production Orders",
            href: "/manufacturing/production-orders",
            icon: <ClipboardCheck className="w-4 h-4" />,
          },
          {
            id: "mfg-works",
            title: "Work Orders",
            href: "/manufacturing/work-orders",
            icon: <Wrench className="w-4 h-4" />,
          },
          {
            id: "mfg-consumption",
            title: "Material Consumption",
            href: "/manufacturing/material-consumption",
            icon: <ListFilter className="w-4 h-4" />,
          },
          {
            id: "mfg-finished",
            title: "Finished Goods",
            href: "/manufacturing/finished-goods",
            icon: <BadgeCheck className="w-4 h-4" />,
          },
          {
            id: "mfg-maintenance",
            title: "Equipment Maintenance",
            href: "/manufacturing/maintenance",
            icon: <Wrench className="w-4 h-4" />,
          },
          {
            id: "mfg-mrp-group",
            title: "MRP & Material Planning",
            href: "/manufacturing/mrp",
            icon: <RotateCcw className="w-4 h-4" />,
            children: [
              {
                id: "mfg-mrp-overview",
                title: "Planning Overview",
                href: "/manufacturing/mrp",
                exact: true,
                icon: <LayoutDashboard className="w-4 h-4" />,
              },
              {
                id: "mfg-mrp-runs",
                title: "Planning Runs",
                href: "/manufacturing/mrp/runs",
                icon: <RotateCcw className="w-4 h-4" />,
              },
              {
                id: "mfg-mrp-shortages",
                title: "Material Shortages",
                href: "/manufacturing/mrp/materials",
                icon: <Package className="w-4 h-4" />,
              },
              {
                id: "mfg-mrp-purchases",
                title: "Purchase Recommendations",
                href: "/manufacturing/mrp/purchases",
                icon: <ShoppingCart className="w-4 h-4" />,
              },
              {
                id: "mfg-mrp-production",
                title: "Production Recommendations",
                href: "/manufacturing/mrp/production",
                icon: <Factory className="w-4 h-4" />,
              },
              {
                id: "mfg-mrp-capacity",
                title: "Capacity Planning",
                href: "/manufacturing/mrp/capacity",
                icon: <Layers className="w-4 h-4" />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "projects",
    name: "Projects & Services",
    icon: <Kanban className="w-4 h-4" />,
    defaultRoute: "/projects",
    permissions: ["Projects.Read"],
    sidebar: [
      {
        id: "proj-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "proj-nav",
        title: "Workspace",
        type: "nav",
        items: [
          {
            id: "proj-list",
            title: "Projects",
            href: "/projects",
            icon: <Kanban className="w-4 h-4" />,
          },
          {
            id: "proj-tasks",
            title: "Tasks",
            href: "/projects/tasks",
            icon: <ClipboardList className="w-4 h-4" />,
          },
          {
            id: "proj-time",
            title: "Timesheets",
            href: "/projects/time",
            icon: <ListFilter className="w-4 h-4" />,
          },
          {
            id: "proj-service",
            title: "Service Requests",
            href: "/projects/service",
            icon: <Wrench className="w-4 h-4" />,
          },
          {
            id: "proj-warranty",
            title: "Warranty Tracking",
            href: "/projects/warranty",
            icon: <ShieldAlert className="w-4 h-4" />,
          },
          {
            id: "proj-rma",
            title: "RMA Returns",
            href: "/projects/rma",
            icon: <ArrowDownLeft className="w-4 h-4" />,
          },
        ],
      },
    ],
  },
  {
    id: "analytics",
    name: "Analytics",
    icon: <BarChart3 className="w-4 h-4" />,
    defaultRoute: "/reports",
    permissions: ["Reports.Read"],
    sidebar: [
      {
        id: "analytics-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "analytics-nav",
        title: "Workspace",
        type: "nav",
        items: [
          {
            id: "rep-overview",
            title: "Reports Hub",
            href: "/reports",
            exact: true,
            icon: <LayoutDashboard className="w-4 h-4" />,
          },
          {
            id: "rep-inventory",
            title: "Inventory Reports",
            href: "/reports/inventory",
            icon: <Package className="w-4 h-4" />,
          },
          {
            id: "rep-procurement",
            title: "Procurement Reports",
            href: "/reports/procurement",
            icon: <ShoppingCart className="w-4 h-4" />,
          },
          {
            id: "rep-manufacturing",
            title: "Manufacturing Reports",
            href: "/reports/manufacturing",
            icon: <Factory className="w-4 h-4" />,
          },
          {
            id: "rep-projects",
            title: "Project Reports",
            href: "/reports/projects",
            icon: <Kanban className="w-4 h-4" />,
          },
          {
            id: "rep-transactions",
            title: "Transaction Reports",
            href: "/reports/transactions",
            icon: <ArrowRightLeft className="w-4 h-4" />,
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    name: "Administration",
    icon: <Settings className="w-4 h-4" />,
    defaultRoute: "/settings",
    permissions: ["Administration.Security"],
    sidebar: [
      {
        id: "admin-favorites",
        title: "Favorites & Recent",
        type: "favorites",
      },
      {
        id: "admin-nav",
        title: "Workspace",
        type: "nav",
        items: [
          {
            id: "settings-main",
            title: "Organization Profile",
            href: "/settings",
            icon: <Settings className="w-4 h-4" />,
          },
          {
            // ML & Intelligence control plane. Administrator-only: the page and
            // every `/ml/ops/*` route require `Administration.Roles`.
            id: "settings-ml",
            title: "ML & Intelligence",
            href: "/settings/intelligence",
            icon: <Brain className="w-4 h-4" />,
            permissions: ["Administration.Roles"],
          },
          {
            id: "settings-users",
            title: "Users Directory",
            href: "/settings/users",
            icon: <Users className="w-4 h-4" />,
          },
          {
            id: "settings-roles",
            title: "Roles & Permissions",
            href: "/settings/roles",
            icon: <Shield className="w-4 h-4" />,
          },
          {
            id: "settings-workflows",
            title: "Workflow Automation",
            href: "/settings/workflows",
            icon: <Zap className="w-4 h-4" />,
          },
          {
            id: "settings-notifications",
            title: "Notifications & Email",
            href: "/settings/notifications",
            icon: <Bell className="w-4 h-4" />,
          },
          {
            id: "settings-data-operations",
            title: "Data Operations & Imports",
            href: "/settings/data-operations",
            icon: <RotateCcw className="w-4 h-4" />,
          },
          {
            id: "settings-data-packs",
            title: "Data Packs & Extensions",
            href: "/settings/data-packs",
            icon: <Box className="w-4 h-4" />,
          },
          {
            id: "settings-audit",
            title: "Audit Explorer",
            href: "/settings/audit",
            icon: <ShieldCheck className="w-4 h-4" />,
          },
        ],
      },
    ],
  },
];

export function getModuleForPath(pathname: string): NavigationModule {
  const fallback = navigationModules[0]!;
  if (!pathname || pathname === "/") {
    return fallback;
  }

  /*
    Longest matching href wins.

    Every module, item, and child is a candidate, including the Dashboard
    module (which a previous version skipped entirely, so `/dashboard/activity` and
    `/settings/audit` silently resolved to whichever later module also listed them).
    Matching whole segments keeps `/inventory/locations/spatial-builder` on its own item instead of
    collapsing into `/inventory/locations/spatial`, and keeps `/finance/accounts-payable` away from
    `/finance/chart-of-accounts`.
  */
  const candidates: Array<{ module: NavigationModule; length: number }> = [];

  const consider = (module: NavigationModule, href: string | undefined) => {
    if (!href || !href.startsWith("/")) return;
    if (pathname !== href && !pathname.startsWith(href + "/")) return;
    candidates.push({ module, length: href.length });
  };

  for (const mod of navigationModules) {
    consider(mod, mod.defaultRoute);
    for (const section of mod.sidebar) {
      for (const item of section.items ?? []) {
        consider(mod, item.href);
        for (const child of item.children ?? []) {
          consider(mod, child.href);
        }
      }
    }
  }

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0]?.module ?? fallback;
}
