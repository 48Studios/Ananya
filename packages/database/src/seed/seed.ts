import { db, pool } from "../index";
import { createSeedContext, ctxId } from "./types";
import { buildProductCatalog } from "./fixtures/products";
import {
  CATEGORY_FIXTURES,
  MANUFACTURER_FIXTURES,
  PROJECT_FIXTURES,
  SUPPLIER_FIXTURES,
  UNIT_FIXTURES,
  WAREHOUSE_FIXTURES,
  DEMO_USERS,
} from "./fixtures/reference-data";
import { buildLocationTree, pickStorageLocationKeys } from "./fixtures/locations";
import { deterministicUuid, seedKey } from "./helpers/deterministic-id";
import { atDayOffset, DEMO_ORG_CREATED } from "./helpers/dates";
import { demoRng } from "./helpers/rng";
import { insertBatch, upsertBatch, sql } from "./helpers/batch-upsert";

import { units } from "../schema/units";
import { categories } from "../schema/categories";
import { manufacturers } from "../schema/manufacturers";
import { suppliers, supplierContacts } from "../schema/suppliers";
import { warehouses, warehouseZones, warehouseBins } from "../schema/warehouses";
import { locations } from "../schema/locations";
import { components } from "../schema/components";
import {
  projects,
  projectMaterials,
  projectTasks,
  projectMilestones,
  projectActivities,
  timeEntries,
  type NewProjectMaterialRecord,
  type NewProjectMilestoneRecord,
  type NewProjectTaskRecord,
  type NewProjectActivityRecord,
  type NewTimeEntryRecord,
} from "../schema/projects";

import {
  assignProductLocations,
  seedInventoryLedger,
} from "./generators/inventory-history";
import {
  seedProcurementHistory,
  seedSupplierComponents,
} from "./generators/procurement-history";
import { seedWarehouseOperations } from "./generators/warehouse-operations";

export async function runSeed() {
  console.log("🌱 Starting Ananya ERP initial database seed...");

  const products = buildProductCatalog();
  const ctx = createSeedContext(products);

  await db.transaction(async (tx) => {
    // 1. Units
    console.log("  -> Seeding unit of measure fixtures...");
    const unitRows = UNIT_FIXTURES.map((u) => {
      const id = deterministicUuid(seedKey("unit", u.name));
      ctx.ids.unit.set(u.name, id);
      return {
        id,
        name: u.name,
        category: u.category,
        isBaseUnit: u.isBaseUnit,
        conversionFactor: u.conversionFactor,
        precision: u.precision,
        isActive: true,
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, units, unitRows, units.name, {
      category: sql`excluded.category`,
      isBaseUnit: sql`excluded.is_base_unit`,
      conversionFactor: sql`excluded.conversion_factor`,
      precision: sql`excluded.precision`,
      updatedAt: sql`excluded.updated_at`,
    });

    // 2. Categories
    console.log("  -> Seeding component category fixtures...");
    const categoryRows = CATEGORY_FIXTURES.map((c) => {
      const id = deterministicUuid(seedKey("category", c.code));
      ctx.ids.category.set(c.code, id);
      return {
        id,
        code: c.code,
        name: c.name,
        description: c.description,
        parentId: null,
        isActive: true,
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, categories, categoryRows, categories.code, {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      updatedAt: sql`excluded.updated_at`,
    });

    // 3. Manufacturers
    console.log("  -> Seeding manufacturer fixtures...");
    const manufacturerRows = MANUFACTURER_FIXTURES.map((m) => {
      const id = deterministicUuid(seedKey("manufacturer", m.code));
      ctx.ids.manufacturer.set(m.code, id);
      return {
        id,
        code: m.code,
        name: m.name,
        isActive: true,
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, manufacturers, manufacturerRows, manufacturers.code, {
      name: sql`excluded.name`,
      updatedAt: sql`excluded.updated_at`,
    });

    // 4. Suppliers & Contacts
    console.log("  -> Seeding supplier and contact fixtures...");
    const supplierRows = SUPPLIER_FIXTURES.map((s) => {
      const id = deterministicUuid(seedKey("supplier", s.code));
      ctx.ids.supplier.set(s.code, id);
      return {
        id,
        code: s.code,
        name: s.name,
        taxId: s.taxId,
        paymentTerms: s.paymentTerms,
        currency: s.currency,
        rating: s.rating,
        isActive: true,
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, suppliers, supplierRows, suppliers.code, {
      name: sql`excluded.name`,
      taxId: sql`excluded.tax_id`,
      paymentTerms: sql`excluded.payment_terms`,
      currency: sql`excluded.currency`,
      rating: sql`excluded.rating`,
      updatedAt: sql`excluded.updated_at`,
    });

    const contactRows = SUPPLIER_FIXTURES.filter((s) => s.contact).map((s) => {
      const id = deterministicUuid(seedKey("supplier-contact", s.code));
      return {
        id,
        supplierId: ctxId(ctx, "supplier", s.code),
        name: s.contact.name,
        email: s.contact.email,
        phone: s.contact.phone,
        role: s.contact.role,
        isPrimary: true,
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await insertBatch(tx, supplierContacts, contactRows);

    // 5. Warehouses, Zones & Bins
    console.log("  -> Seeding warehouse, zone, and bin fixtures...");
    const warehouseRows = WAREHOUSE_FIXTURES.map((w) => {
      const id = deterministicUuid(seedKey("warehouse", w.code));
      ctx.ids.warehouse.set(w.code, id);
      return {
        id,
        code: w.code,
        name: w.name,
        description: w.description,
        status: "ACTIVE",
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, warehouses, warehouseRows, warehouses.code, {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      updatedAt: sql`excluded.updated_at`,
    });

    const zoneRows = [];
    const binRows = [];
    const zoneCodes = ["A", "B", "C", "D"];

    for (const w of WAREHOUSE_FIXTURES) {
      const whId = ctxId(ctx, "warehouse", w.code);

      for (const zCode of zoneCodes) {
        const zKey = `${w.code}:${zCode}`;
        const zId = deterministicUuid(seedKey("warehouse-zone", zKey));
        ctx.ids.warehouseZone.set(zKey, zId);
        zoneRows.push({
          id: zId,
          warehouseId: whId,
          code: zCode,
          name: `Zone ${zCode}`,
          createdAt: DEMO_ORG_CREATED,
          updatedAt: DEMO_ORG_CREATED,
        });

        for (let b = 1; b <= 6; b += 1) {
          const binCode = `${w.code}-Z${zCode}-B0${b}`;
          const bId = deterministicUuid(seedKey("warehouse-bin", binCode));
          ctx.ids.warehouseBin.set(binCode, bId);
          binRows.push({
            id: bId,
            warehouseId: whId,
            code: binCode,
            capacity: "5000.0000",
            currentUtilization: "1200.0000",
            purpose: "STORAGE",
            isActive: true,
            createdAt: DEMO_ORG_CREATED,
            updatedAt: DEMO_ORG_CREATED,
          });
        }
      }
    }
    await insertBatch(tx, warehouseZones, zoneRows);
    await upsertBatch(tx, warehouseBins, binRows, warehouseBins.code, {
      capacity: sql`excluded.capacity`,
      currentUtilization: sql`excluded.current_utilization`,
      updatedAt: sql`excluded.updated_at`,
    });

    // 6. Locations Tree
    console.log("  -> Seeding hierarchical location tree...");
    const locationTreeNodes = buildLocationTree();
    const locationRows = locationTreeNodes.map((node) => {
      const id = deterministicUuid(seedKey("location", node.key));
      ctx.ids.location.set(node.key, id);
      return {
        id,
        code: node.code,
        name: node.name,
        kind: node.kind,
        parentId: node.parentKey
          ? deterministicUuid(seedKey("location", node.parentKey))
          : null,
        isActive: true,
        metadata: node.metadata ?? {},
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, locations, locationRows, locations.code, {
      name: sql`excluded.name`,
      kind: sql`excluded.kind`,
      parentId: sql`excluded.parent_id`,
      metadata: sql`excluded.metadata`,
      updatedAt: sql`excluded.updated_at`,
    });

    // 7. Products / Components
    console.log("  -> Assigning default locations & seeding 300 components...");
    const binLocationKeys = pickStorageLocationKeys(demoRng);
    assignProductLocations(ctx, binLocationKeys);

    const componentRows = ctx.products.map((p) => {
      const id = deterministicUuid(seedKey("component", p.key));
      ctx.ids.component.set(p.key, id);
      const defaultLocKey = ctx.productLocation.get(p.key)!;
      return {
        id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        manufacturerId: ctxId(ctx, "manufacturer", p.manufacturerCode),
        categoryId: ctxId(ctx, "category", p.categoryCode),
        defaultLocationId: ctxId(ctx, "location", defaultLocKey),
        unit: p.unit,
        isActive: true,
        createdAt: DEMO_ORG_CREATED,
        updatedAt: DEMO_ORG_CREATED,
      };
    });
    await upsertBatch(tx, components, componentRows, components.sku, {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      manufacturerId: sql`excluded.manufacturer_id`,
      categoryId: sql`excluded.category_id`,
      defaultLocationId: sql`excluded.default_location_id`,
      unit: sql`excluded.unit`,
      updatedAt: sql`excluded.updated_at`,
    });

    // 8. Supplier Components mapping
    console.log("  -> Seeding supplier component pricing & lead times...");
    await seedSupplierComponents(tx, ctx);

    // 9. Projects & Materials/Tasks
    console.log("  -> Seeding project management fixtures...");
    const projectRows = PROJECT_FIXTURES.map((p) => {
      const id = deterministicUuid(seedKey("project", p.key));
      ctx.ids.project.set(p.key, id);
      const startDate = atDayOffset(p.startOffsetDays, 9, 0);
      const targetCompletionDate = atDayOffset(
        p.startOffsetDays + p.durationDays,
        17,
        0,
      );
      return {
        id,
        projectNumber: p.projectNumber,
        name: p.name,
        projectType: p.projectType,
        description: p.description,
        owner: p.owner,
        projectManager: p.projectManager,
        startDate,
        targetCompletionDate,
        priority: p.priority,
        status: p.status,
        createdAt: startDate,
        updatedAt: startDate,
      };
    });
    await upsertBatch(tx, projects, projectRows, projects.projectNumber, {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      owner: sql`excluded.owner`,
      projectManager: sql`excluded.project_manager`,
      priority: sql`excluded.priority`,
      status: sql`excluded.status`,
      updatedAt: sql`excluded.updated_at`,
    });

    const projMaterialRows: NewProjectMaterialRecord[] = [];
    const projMilestoneRows: NewProjectMilestoneRecord[] = [];
    const projTaskRows: NewProjectTaskRecord[] = [];
    const projActivityRows: NewProjectActivityRecord[] = [];
    const timeEntryRows: NewTimeEntryRecord[] = [];

    for (const p of PROJECT_FIXTURES) {
      const projId = ctxId(ctx, "project", p.key);
      const allocatedProducts = demoRng
        .shuffle(ctx.products)
        .slice(0, demoRng.int(3, 8));

      allocatedProducts.forEach((product, idx) => {
        const matId = deterministicUuid(seedKey("proj-mat", p.key, idx));
        const qty = demoRng.int(10, 100);
        projMaterialRows.push({
          id: matId,
          projectId: projId,
          componentId: ctxId(ctx, "component", product.key),
          locationId: ctxId(
            ctx,
            "location",
            ctx.productLocation.get(product.key)!,
          ),
          allocatedQuantity: String(qty),
          issuedQuantity: String(Math.floor(qty * 0.7)),
          returnedQuantity: "0.0000",
          unitOfMeasure: product.unit,
          notes: `Allocated for ${p.name}`,
          createdAt: atDayOffset(p.startOffsetDays, 10, 0),
          updatedAt: atDayOffset(p.startOffsetDays, 10, 0),
        });
      });

      const milestoneNames = ["Schematic Review", "PCB Layout", "Prototype Build", "Testing & QC"];
      milestoneNames.forEach((name, idx) => {
        const mId = deterministicUuid(seedKey("proj-ms", p.key, idx));
        const dueOffset = p.startOffsetDays + Math.floor((p.durationDays / 4) * (idx + 1));
        projMilestoneRows.push({
          id: mId,
          projectId: projId,
          name,
          dueDate: atDayOffset(dueOffset, 17, 0),
          status: idx < 2 ? "COMPLETED" : "OPEN",
          completionPercentage: idx < 2 ? "100.00" : "0.00",
          createdAt: atDayOffset(p.startOffsetDays, 9, 0),
          updatedAt: atDayOffset(p.startOffsetDays, 9, 0),
        });
      });

      for (let t = 1; t <= 4; t += 1) {
        const taskNumber = `TSK-${p.projectNumber.replace("PRJ-", "")}-${String(t).padStart(2, "0")}`;
        const taskId = deterministicUuid(seedKey("proj-task", taskNumber));
        const assignedUser = demoRng.pick(DEMO_USERS);
        const estHours = demoRng.int(8, 40);
        const actHours = demoRng.int(4, estHours);

        projTaskRows.push({
          id: taskId,
          taskNumber,
          projectId: projId,
          title: `${p.name} - Phase ${t} Implementation`,
          description: `Task ${t} execution details`,
          assignedUser,
          estimatedHours: String(estHours),
          actualHours: String(actHours),
          priority: p.priority,
          status: demoRng.pick(["DONE", "IN_PROGRESS", "TODO"]),
          createdAt: atDayOffset(p.startOffsetDays + t * 5, 9, 0),
          updatedAt: atDayOffset(p.startOffsetDays + t * 5, 17, 0),
        });

        timeEntryRows.push({
          id: deterministicUuid(seedKey("time-entry", taskNumber)),
          userId: assignedUser,
          taskId,
          date: atDayOffset(p.startOffsetDays + t * 5, 12, 0),
          hours: String(actHours),
          description: `Worked on ${taskNumber}`,
          status: "APPROVED",
          approvedBy: p.projectManager,
          createdAt: atDayOffset(p.startOffsetDays + t * 5, 17, 0),
          updatedAt: atDayOffset(p.startOffsetDays + t * 5, 17, 0),
        });
      }

      projActivityRows.push({
        id: deterministicUuid(seedKey("proj-activity", p.key)),
        projectId: projId,
        activityType: "CREATED",
        description: `Project ${p.name} initialized`,
        performedBy: p.owner,
        metadata: JSON.stringify({ priority: p.priority }),
        createdAt: atDayOffset(p.startOffsetDays, 9, 0),
      });
    }

    await insertBatch(tx, projectMaterials, projMaterialRows, 500);
    await insertBatch(tx, projectMilestones, projMilestoneRows, 500);
    await upsertBatch(tx, projectTasks, projTaskRows, projectTasks.taskNumber, {
      title: sql`excluded.title`,
      status: sql`excluded.status`,
      actualHours: sql`excluded.actual_hours`,
      updatedAt: sql`excluded.updated_at`,
    });
    await insertBatch(tx, projectActivities, projActivityRows, 500);
    await insertBatch(tx, timeEntries, timeEntryRows, 500);

    // 10. Inventory Ledger & Projections
    console.log("  -> Generating 6 months of historical inventory transactions...");
    await seedInventoryLedger(tx, ctx);

    // 11. Procurement History
    console.log("  -> Generating 26 weeks of purchase orders & goods receipts...");
    await seedProcurementHistory(tx, ctx);

    // 12. Warehouse Operations
    console.log("  -> Generating warehouse operations (transfers, adjustments, cycle/stock counts, reservations)...");
    await seedWarehouseOperations(tx, ctx);
  });

  console.log("✅ Seed completed successfully!");
}

if (require.main === module) {
  runSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("❌ Seed failed with error:", err);
      await pool.end();
      process.exit(1);
    });
}
