import { Injectable } from '@nestjs/common';

export interface PermissionDefinition {
  code: string;
  name: string;
  category: string;
  description: string;
}

export interface PermissionGroup {
  category: string;
  permissions: PermissionDefinition[];
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  // Inventory
  {
    code: 'Inventory.Read',
    name: 'View Inventory',
    category: 'Inventory',
    description: 'View stock levels, components, and storage locations',
  },
  {
    code: 'Inventory.Create',
    name: 'Create Components',
    category: 'Inventory',
    description: 'Create new catalog components',
  },
  {
    code: 'Inventory.Update',
    name: 'Edit Components',
    category: 'Inventory',
    description: 'Modify component master data',
  },
  {
    code: 'Inventory.Delete',
    name: 'Delete Components',
    category: 'Inventory',
    description: 'Remove catalog components',
  },
  {
    code: 'Inventory.Adjust',
    name: 'Reconcile Stock',
    category: 'Inventory',
    description: 'Create and submit stock adjustments',
  },
  {
    code: 'Inventory.Transfer',
    name: 'Transfer Inventory',
    category: 'Inventory',
    description: 'Execute inter-facility warehouse transfers',
  },
  {
    code: 'Inventory.Reserve',
    name: 'Reserve Inventory',
    category: 'Inventory',
    description: 'Create and manage stock reservations',
  },

  // Procurement
  {
    code: 'PurchaseOrders.Read',
    name: 'View Purchase Orders',
    category: 'Procurement',
    description: 'View purchase orders and vendor details',
  },
  {
    code: 'PurchaseOrders.Create',
    name: 'Create Purchase Orders',
    category: 'Procurement',
    description: 'Create draft purchase orders',
  },
  {
    code: 'PurchaseOrders.Update',
    name: 'Edit Purchase Orders',
    category: 'Procurement',
    description: 'Edit purchase orders',
  },
  {
    code: 'PurchaseOrders.Approve',
    name: 'Approve Purchase Orders',
    category: 'Procurement',
    description: 'Approve and issue purchase orders',
  },
  {
    code: 'GoodsReceipts.Receive',
    name: 'Receive Goods',
    category: 'Procurement',
    description: 'Process goods receipts and incoming shipments',
  },

  // Manufacturing
  {
    code: 'BOM.Read',
    name: 'View BOMs',
    category: 'Manufacturing',
    description: 'View bill of materials specifications',
  },
  {
    code: 'BOM.Manage',
    name: 'Manage BOMs',
    category: 'Manufacturing',
    description: 'Create and publish revisions of BOMs',
  },
  {
    code: 'WorkOrders.Manage',
    name: 'Manage Work Orders',
    category: 'Manufacturing',
    description: 'Create and edit production work orders',
  },
  {
    code: 'Manufacturing.Execute',
    name: 'Execute Production',
    category: 'Manufacturing',
    description: 'Record batch output, issues, and scrap',
  },

  // Projects
  {
    code: 'Projects.Read',
    name: 'View Projects',
    category: 'Projects',
    description: 'View project tracking and milestones',
  },
  {
    code: 'Projects.Manage',
    name: 'Manage Projects',
    category: 'Projects',
    description: 'Create and update project metadata',
  },
  {
    code: 'Projects.Allocate',
    name: 'Allocate Materials',
    category: 'Projects',
    description: 'Reserve and issue inventory to projects',
  },

  // Reporting
  {
    code: 'Reports.Read',
    name: 'View Reports',
    category: 'Reporting',
    description: 'Access operational reports and dashboards',
  },
  {
    code: 'Reports.Export',
    name: 'Export Reports',
    category: 'Reporting',
    description: 'Download and export analytical report data',
  },

  // Administration & Security
  {
    code: 'Administration.Users',
    name: 'Manage Users',
    category: 'Administration',
    description: 'Create, edit, activate, and disable user accounts',
  },
  {
    code: 'Administration.Roles',
    name: 'Manage Roles',
    category: 'Administration',
    description: 'Create custom roles and modify permissions',
  },
  {
    code: 'Administration.Security',
    name: 'View Security Audit',
    category: 'Administration',
    description: 'Access security audit trail and active sessions',
  },
  {
    code: 'Administration.Settings',
    name: 'Manage System Settings',
    category: 'Administration',
    description: 'Update organization profile, system preferences, numbering series, and feature flags',
  },

  // Sales & CRM
  {
    code: 'Sales.Read',
    name: 'View Sales & Customers',
    category: 'Sales',
    description: 'View sales orders, customers, quotations, and CRM accounts',
  },
  {
    code: 'Sales.Create',
    name: 'Create Sales Orders & Quotes',
    category: 'Sales',
    description: 'Create sales orders, quotes, leads, and customer accounts',
  },
  {
    code: 'Sales.Update',
    name: 'Manage Sales Orders & Quotes',
    category: 'Sales',
    description: 'Update sales orders, approve quotes, and manage fulfillment',
  },
  {
    code: 'Sales.Delete',
    name: 'Delete Sales Records',
    category: 'Sales',
    description: 'Cancel and delete sales orders and quotations',
  },

  // Finance & Accounting
  {
    code: 'Accounting.Read',
    name: 'View Financial Records',
    category: 'Accounting',
    description: 'View chart of accounts, journal entries, invoices, and payments',
  },
  {
    code: 'Accounting.Create',
    name: 'Create Financial Transactions',
    category: 'Accounting',
    description: 'Create draft journal entries, invoices, and payment records',
  },
  {
    code: 'Accounting.Update',
    name: 'Edit Financial Records',
    category: 'Accounting',
    description: 'Update draft financial entries and bank reconciliations',
  },
  {
    code: 'Accounting.Post',
    name: 'Post Financial Ledgers',
    category: 'Accounting',
    description: 'Post journal entries, execute payments, and approve reconciliations',
  },
  {
    code: 'Accounting.Delete',
    name: 'Delete Financial Records',
    category: 'Accounting',
    description: 'Delete unposted journal entries and draft invoices',
  },

  // Maintenance & Service
  {
    code: 'Maintenance.Read',
    name: 'View Maintenance & Service',
    category: 'Maintenance',
    description: 'View maintenance schedules, service requests, and warranty claims',
  },
  {
    code: 'Maintenance.Manage',
    name: 'Manage Maintenance & Service',
    category: 'Maintenance',
    description: 'Create, update, and resolve maintenance schedules and service requests',
  },
];

export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  Administrator: ['*'],
  'Inventory Manager': [
    'Inventory.Read',
    'Inventory.Create',
    'Inventory.Update',
    'Inventory.Adjust',
    'Inventory.Transfer',
    'Inventory.Reserve',
    'GoodsReceipts.Receive',
    'Reports.Read',
  ],
  'Warehouse Operator': [
    'Inventory.Read',
    'GoodsReceipts.Receive',
    'Inventory.Transfer',
  ],
  'Purchasing Agent': [
    'PurchaseOrders.Read',
    'PurchaseOrders.Create',
    'PurchaseOrders.Update',
    'PurchaseOrders.Approve',
    'GoodsReceipts.Receive',
    'Reports.Read',
  ],
  'Manufacturing Lead': [
    'BOM.Read',
    'BOM.Manage',
    'WorkOrders.Manage',
    'Manufacturing.Execute',
    'Inventory.Read',
  ],
  'Project Manager': [
    'Projects.Read',
    'Projects.Manage',
    'Projects.Allocate',
    'Inventory.Read',
  ],
  Auditor: [
    'Reports.Read',
    'Reports.Export',
    'Administration.Security',
    'Accounting.Read',
  ],
  Accountant: [
    'Accounting.Read',
    'Accounting.Create',
    'Accounting.Update',
    'Accounting.Post',
    'Accounting.Delete',
    'Reports.Read',
    'Reports.Export',
  ],
  'Sales Representative': [
    'Sales.Read',
    'Sales.Create',
    'Sales.Update',
    'Reports.Read',
  ],
  'Maintenance Technician': [
    'Maintenance.Read',
    'Maintenance.Manage',
    'Inventory.Read',
  ],
};

@Injectable()
export class PermissionsService {
  getAllPermissions(): PermissionDefinition[] {
    return ALL_PERMISSIONS;
  }

  getPermissionGroups(): PermissionGroup[] {
    const groupsMap = new Map<string, PermissionDefinition[]>();
    for (const perm of ALL_PERMISSIONS) {
      if (!groupsMap.has(perm.category)) {
        groupsMap.set(perm.category, []);
      }
      groupsMap.get(perm.category)!.push(perm);
    }

    return Array.from(groupsMap.entries()).map(([category, permissions]) => ({
      category,
      permissions,
    }));
  }

  hasPermission(
    userPermissions: string[],
    requiredPermission: string,
  ): boolean {
    if (userPermissions.includes('*')) return true;
    if (userPermissions.includes(requiredPermission)) return true;

    const [domain] = requiredPermission.split('.');
    if (domain && userPermissions.includes(`${domain}.*`)) return true;

    return false;
  }
}
