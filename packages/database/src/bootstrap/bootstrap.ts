import { db, pool } from "../index";
import { roles } from "../schema/auth";
import {
  systemSettings,
  numberingSeries,
  featureFlags,
} from "../schema/settings";
import { eq } from "../query";

const SYSTEM_ROLES = [
  {
    name: "Admin",
    description: "System defined Admin role with full platform access",
    isSystem: true,
    permissions: [
      "user:read",
      "user:write",
      "user:delete",
      "role:read",
      "role:write",
      "role:delete",
      "component:read",
      "component:write",
      "component:delete",
      "supplier:read",
      "supplier:write",
      "supplier:delete",
      "purchase_order:read",
      "purchase_order:write",
      "purchase_order:approve",
      "work_order:read",
      "work_order:write",
      "work_order:execute",
      "bom:read",
      "bom:write",
      "bom:approve",
      "inventory:read",
      "inventory:adjust",
      "inventory:transfer",
      "project:read",
      "project:write",
      "project:delete",
      "settings:read",
      "settings:write",
      "audit:read",
    ],
  },
  {
    name: "Manager",
    description:
      "System defined Manager role with operational administrative access",
    isSystem: true,
    permissions: [
      "user:read",
      "component:read",
      "component:write",
      "supplier:read",
      "supplier:write",
      "purchase_order:read",
      "purchase_order:write",
      "work_order:read",
      "work_order:write",
      "bom:read",
      "bom:write",
      "inventory:read",
      "inventory:adjust",
      "inventory:transfer",
      "project:read",
      "project:write",
      "settings:read",
    ],
  },
  {
    name: "Member",
    description: "System defined Member role for standard operational users",
    isSystem: true,
    permissions: [
      "component:read",
      "supplier:read",
      "purchase_order:read",
      "work_order:read",
      "bom:read",
      "inventory:read",
      "project:read",
    ],
  },
  {
    name: "Viewer",
    description: "System defined Read-Only Viewer role",
    isSystem: true,
    permissions: [
      "component:read",
      "supplier:read",
      "purchase_order:read",
      "work_order:read",
      "bom:read",
      "inventory:read",
      "project:read",
    ],
  },
];

const DEFAULT_NUMBERING_SERIES = [
  {
    entityType: "PurchaseOrder",
    prefix: "PO-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "WorkOrder",
    prefix: "WO-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "Component",
    prefix: "CMP-",
    dateFormat: "",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "Project",
    prefix: "PRJ-",
    dateFormat: "",
    nextSequenceNumber: 1,
    zeroPadLength: 4,
  },
  {
    entityType: "GoodsReceipt",
    prefix: "GRN-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "InventoryTransaction",
    prefix: "TX-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 8,
  },
  {
    entityType: "SalesOrder",
    prefix: "SO-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "Quotation",
    prefix: "QT-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "Asset",
    prefix: "AST-",
    dateFormat: "",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "Equipment",
    prefix: "EQP-",
    dateFormat: "",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "MaintenanceSchedule",
    prefix: "MNT-",
    dateFormat: "",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "ServiceRequest",
    prefix: "SRV-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "Warranty",
    prefix: "WRN-",
    dateFormat: "",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
  {
    entityType: "RMA",
    prefix: "RMA-",
    dateFormat: "YYYY",
    nextSequenceNumber: 1,
    zeroPadLength: 6,
  },
];

const DEFAULT_FEATURE_FLAGS = [
  {
    key: "MFA_REQUIRED",
    name: "Multi-Factor Authentication",
    description: "Enforce MFA for all administrative roles",
    category: "SECURITY",
    isEnabled: false,
  },
  {
    key: "EXPERIMENTAL_AI_FORECAST",
    name: "AI Demand Forecasting",
    description: "Enable experimental machine learning demand prediction model",
    category: "EXPERIMENTAL",
    isEnabled: false,
  },
  {
    key: "BARCODE_STUDIO",
    name: "Barcode & QR Code Studio",
    description: "Enable advanced barcode label designer & scanning interface",
    category: "INVENTORY",
    isEnabled: true,
  },
];

export async function runBootstrap() {
  console.log("⚡ Executing Ananya ERP Platform System Bootstrap...");

  await db.transaction(async (tx) => {
    // 1. Initialize System Roles & Permission Matrix
    console.log("  -> Bootstrapping System Roles & Permissions Matrix...");
    for (const r of SYSTEM_ROLES) {
      const [existing] = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, r.name))
        .limit(1);
      if (!existing) {
        await tx.insert(roles).values(r);
      }
    }

    // 2. Initialize Platform System Settings Defaults
    console.log("  -> Bootstrapping System Settings...");
    const [existingSettings] = await tx.select().from(systemSettings).limit(1);
    if (!existingSettings) {
      await tx.insert(systemSettings).values({
        baseCurrency: "INR",
        supportedCurrencies: ["INR", "USD", "EUR"],
        fiscalYearStartMonth: 4,
        dateFormat: "YYYY-MM-DD",
      });
    }

    // 3. Initialize Default Numbering Series
    console.log("  -> Bootstrapping Numbering Series...");
    for (const ns of DEFAULT_NUMBERING_SERIES) {
      const [existing] = await tx
        .select()
        .from(numberingSeries)
        .where(eq(numberingSeries.entityType, ns.entityType))
        .limit(1);
      if (!existing) {
        await tx.insert(numberingSeries).values(ns);
      }
    }

    // 4. Initialize Default Feature Flags
    console.log("  -> Bootstrapping Feature Flags...");
    for (const ff of DEFAULT_FEATURE_FLAGS) {
      const [existing] = await tx
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, ff.key))
        .limit(1);
      if (!existing) {
        await tx.insert(featureFlags).values(ff);
      }
    }
  });

  console.log("✅ Platform System Bootstrap completed successfully!");
}

if (require.main === module) {
  runBootstrap()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ System Bootstrap failed:", err);
      await pool.end();
      process.exit(1);
    });
}
