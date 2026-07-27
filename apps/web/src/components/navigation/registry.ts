import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Truck,
  Factory,
  Warehouse,
  Landmark,
  Users,
  FolderKanban,
  RotateCcw,
  FileText,
  Settings,
} from 'lucide-react';

export interface NavSubItem {
  label: string;
  href: string;
}

export interface NavGroupItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: NavSubItem[];
}

export interface NavGroup {
  title: string;
  items: NavGroupItem[];
}

export const navigationRegistry: NavGroup[] = [
  {
    title: 'Core',
    items: [
      { label: 'Dashboard', href: '/', icon: React.createElement(LayoutDashboard, { size: 18 }) },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Inventory',
        icon: React.createElement(Boxes, { size: 18 }),
        children: [
          { label: 'Overview', href: '/inventory' },
          { label: 'Components', href: '/components' },
          { label: 'Manufacturers', href: '/manufacturers' },
          { label: 'Locations', href: '/locations' },
          { label: 'Warehouses', href: '/warehouses' },
          { label: 'Stock Counts', href: '/stock-counts' },
          { label: 'Cycle Counts', href: '/cycle-counts' },
          { label: 'Transactions', href: '/transactions' },
        ],
      },
      {
        label: 'Procurement',
        icon: React.createElement(Truck, { size: 18 }),
        children: [
          { label: 'Overview', href: '/procurement' },
          { label: 'Suppliers', href: '/suppliers' },
          { label: 'Purchase Orders', href: '/purchase-orders' },
          { label: 'Goods Receipts', href: '/goods-receipts' },
          { label: 'Supplier Returns', href: '/supplier-returns' },
          { label: 'Invoices', href: '/purchase-invoices' },
        ],
      },
      {
        label: 'Manufacturing',
        icon: React.createElement(Factory, { size: 18 }),
        children: [
          { label: 'Overview', href: '/manufacturing' },
          { label: 'BOMs', href: '/boms' },
          { label: 'Production Orders', href: '/production-orders' },
          { label: 'Work Orders', href: '/work-orders' },
          { label: 'Material Consumption', href: '/material-consumption' },
          { label: 'Finished Goods', href: '/finished-goods' },
        ],
      },
      {
        label: 'Sales',
        icon: React.createElement(ShoppingCart, { size: 18 }),
        children: [
          { label: 'Overview', href: '/sales' },
          { label: 'Customers', href: '/customers' },
          { label: 'Quotations', href: '/quotations' },
          { label: 'Sales Orders', href: '/sales-orders' },
          { label: 'Fulfillment', href: '/fulfillment' },
          { label: 'Customer Returns', href: '/customer-returns' },
        ],
      },
      {
        label: 'Warehouse',
        icon: React.createElement(Warehouse, { size: 18 }),
        children: [
          { label: 'Overview', href: '/warehouse' },
          { label: 'Warehouses', href: '/warehouses' },
          { label: 'Bins', href: '/warehouse-bins' },
          { label: 'Transfers', href: '/warehouse-transfers' },
          { label: 'Policies', href: '/warehouse-policies' },
        ],
      },
    ],
  },
  {
    title: 'Enterprise',
    items: [
      {
        label: 'Finance',
        icon: React.createElement(Landmark, { size: 18 }),
        children: [
          { label: 'Overview', href: '/finance' },
          { label: 'Chart of Accounts', href: '/chart-of-accounts' },
          { label: 'Journal Entries', href: '/journal-entries' },
          { label: 'Receivables', href: '/accounts-receivable' },
          { label: 'Payables', href: '/accounts-payable' },
          { label: 'Payments', href: '/payments' },
          { label: 'Bank Accounts', href: '/bank-accounts' },
          { label: 'Reconciliation', href: '/bank-reconciliation' },
        ],
      },
      {
        label: 'CRM',
        icon: React.createElement(Users, { size: 18 }),
        children: [
          { label: 'Overview', href: '/crm' },
          { label: 'Leads', href: '/leads' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Opportunities', href: '/opportunities' },
          { label: 'Activities', href: '/activities' },
        ],
      },
      {
        label: 'Projects & Service',
        icon: React.createElement(FolderKanban, { size: 18 }),
        children: [
          { label: 'Projects', href: '/projects' },
          { label: 'Tasks', href: '/tasks' },
          { label: 'Timesheets', href: '/time' },
          { label: 'Service Requests', href: '/service' },
          { label: 'RMA', href: '/rma' },
          { label: 'Warranty', href: '/warranty' },
          { label: 'Maintenance', href: '/maintenance' },
        ],
      },
      {
        label: 'MRP',
        icon: React.createElement(RotateCcw, { size: 18 }),
        children: [
          { label: 'Overview', href: '/mrp' },
          { label: 'Planning Runs', href: '/mrp/runs' },
          { label: 'Material Shortages', href: '/mrp/materials' },
          { label: 'Purchase Recs', href: '/mrp/purchases' },
          { label: 'Production Recs', href: '/mrp/production' },
          { label: 'Capacity Planning', href: '/mrp/capacity' },
        ],
      },
      {
        label: 'Traceability & Batches',
        icon: React.createElement(FileText, { size: 18 }),
        children: [
          { label: 'Batches', href: '/batches' },
          { label: 'Serials', href: '/serials' },
          { label: 'Reservations', href: '/reservations' },
          { label: 'Projections', href: '/projections' },
        ],
      },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: React.createElement(Settings, { size: 18 }) },
    ],
  },
];
