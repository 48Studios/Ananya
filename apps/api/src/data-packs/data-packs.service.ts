import { Injectable, NotFoundException } from '@nestjs/common';
import { ImportExportService } from '../import-export/import-export.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { ActivityService } from '../activity/activity.service';
import { AttributesService } from '../attributes/attributes.service';
import { ELECTRONICS_SMD_PACK } from './packs/electronics-smd-pack';
import { db } from '@ananya/database';
import {
  units,
  categories,
  attributeDefinitions,
  attributeOptions,
  categoryAttributes,
  components,
  activityEvents,
} from '@ananya/database/schema';
import { and, eq, desc } from '@ananya/database/query';

export interface DataPackCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  entityType: string;
  recordCount: number;
  isInstalled: boolean;
  installedAt?: string | null;
}

export interface DataPackDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  entityType: string;
  recordCount: number;
  rows?: Record<string, unknown>[];
}

const DATA_PACKS: DataPackDefinition[] = [
  {
    id: 'base-units',
    name: 'Base Units of Measure',
    category: 'Core Lookup',
    description:
      'Standard physical units of measure (pcs, kg, g, mg, m, cm, mm, L, mL, box, roll, set, hr)',
    entityType: 'Unit',
    recordCount: 13,
    rows: [
      {
        name: 'pcs',
        category: 'Count',
        conversionFactor: '1.0000',
        precision: '0',
      },
      {
        name: 'kg',
        category: 'Weight',
        conversionFactor: '1.0000',
        precision: '4',
      },
      {
        name: 'g',
        category: 'Weight',
        conversionFactor: '0.0010',
        precision: '4',
      },
      {
        name: 'mg',
        category: 'Weight',
        conversionFactor: '0.000001',
        precision: '6',
      },
      {
        name: 'm',
        category: 'Length',
        conversionFactor: '1.0000',
        precision: '4',
      },
      {
        name: 'cm',
        category: 'Length',
        conversionFactor: '0.0100',
        precision: '4',
      },
      {
        name: 'mm',
        category: 'Length',
        conversionFactor: '0.0010',
        precision: '4',
      },
      {
        name: 'L',
        category: 'Volume',
        conversionFactor: '1.0000',
        precision: '4',
      },
      {
        name: 'mL',
        category: 'Volume',
        conversionFactor: '0.0010',
        precision: '4',
      },
      {
        name: 'box',
        category: 'Packaging',
        conversionFactor: '1.0000',
        precision: '0',
      },
      {
        name: 'roll',
        category: 'Packaging',
        conversionFactor: '1.0000',
        precision: '0',
      },
      {
        name: 'set',
        category: 'Packaging',
        conversionFactor: '1.0000',
        precision: '0',
      },
      {
        name: 'hr',
        category: 'Time',
        conversionFactor: '1.0000',
        precision: '2',
      },
    ],
  },
  {
    id: 'default-categories',
    name: 'Default Component Categories',
    category: 'Core Lookup',
    description:
      'Standard component categories for electronics and hardware manufacturing',
    entityType: 'Category',
    recordCount: 5,
    rows: [
      {
        code: 'ELEC',
        name: 'Electronic Components',
        description:
          'Integrated circuits, resistors, capacitors, and microcontrollers',
      },
      {
        code: 'MECH',
        name: 'Mechanical Parts',
        description: 'Fasteners, enclosures, gears, and structural brackets',
      },
      {
        code: 'RAW',
        name: 'Raw Materials',
        description:
          'Aluminum extrusion, copper sheets, plastic resin, and wire stock',
      },
      {
        code: 'ASSY',
        name: 'Assemblies',
        description: 'Sub-assemblies and finished module products',
      },
      {
        code: 'CONS',
        name: 'Consumables',
        description: 'Solder, adhesives, flux, tape, and thermal paste',
      },
    ],
  },
  {
    id: ELECTRONICS_SMD_PACK.id,
    name: ELECTRONICS_SMD_PACK.name,
    category: ELECTRONICS_SMD_PACK.category,
    description: ELECTRONICS_SMD_PACK.description,
    entityType: ELECTRONICS_SMD_PACK.entityType,
    recordCount: ELECTRONICS_SMD_PACK.recordCount,
  },
  {
    id: 'core-erp',
    name: 'Core Logistics & Warehousing Pack',
    category: 'Infrastructure',
    description:
      'Initial central warehouse, staging areas, and main storage locations',
    entityType: 'Warehouse',
    recordCount: 1,
    rows: [
      {
        code: 'WH-MAIN',
        name: 'Main Central Warehouse',
        description: 'Primary logistics hub and material storage facility',
      },
    ],
  },
  {
    id: 'demo-inventory',
    name: 'Demo Electronic Components Pack',
    category: 'Demo Data',
    description:
      'Sample electronic component catalog (resistors, capacitors, microcontrollers)',
    entityType: 'Component',
    recordCount: 5,
    rows: [
      {
        sku: 'RES-10K-001',
        name: '10k Ohm Resistor 1/4W',
        unit: 'pcs',
        description: '10k Ohm 5% carbon film resistor',
        categoryName: 'Electronic Components',
      },
      {
        sku: 'CAP-100UF-001',
        name: '100uF 25V Electrolytic Capacitor',
        unit: 'pcs',
        description: '100uF 25V radial aluminum capacitor',
        categoryName: 'Electronic Components',
      },
      {
        sku: 'MCU-STM32-001',
        name: 'STM32F407VGT6 Microcontroller',
        unit: 'pcs',
        description: 'ARM Cortex-M4 32b MCU 1MB Flash',
        categoryName: 'Electronic Components',
      },
      {
        sku: 'LED-RED-001',
        name: '3mm Red LED 20mA',
        unit: 'pcs',
        description: 'Standard 3mm red diffused LED',
        categoryName: 'Electronic Components',
      },
      {
        sku: 'OPAMP-NE5532-001',
        name: 'NE5532 Dual Low-Noise OpAmp',
        unit: 'pcs',
        description: 'Dual low-noise operational amplifier DIP-8',
        categoryName: 'Electronic Components',
      },
    ],
  },
];

@Injectable()
export class DataPacksService {
  constructor(
    private readonly importExportService: ImportExportService,
    private readonly auditService: SecurityAuditService,
    private readonly activityService: ActivityService,
    private readonly attributesService: AttributesService,
  ) {}

  async getCatalog(): Promise<DataPackCatalogItem[]> {
    // 1. Fetch installation events from activityEvents
    const installedLogs = await db
      .select({
        packId: activityEvents.entityId,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.entityType, 'DataPack'),
          eq(activityEvents.eventType, 'DATA_PACK_INSTALLED'),
        ),
      )
      .orderBy(desc(activityEvents.createdAt));

    const installedMap = new Map<string, string | null>();
    for (const log of installedLogs) {
      if (!installedMap.has(log.packId)) {
        installedMap.set(
          log.packId,
          log.createdAt ? log.createdAt.toISOString() : null,
        );
      }
    }

    // 2. Check content existence as a verification/fallback
    const [sampleAttr] = await db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .limit(1);

    const [sampleUnit] = await db.select({ id: units.id }).from(units).limit(1);

    const [sampleCategory] = await db
      .select({ id: categories.id })
      .from(categories)
      .limit(1);

    return DATA_PACKS.map(
      ({ id, name, category, description, entityType, recordCount }) => {
        let isInstalled = installedMap.has(id);
        const installedAt = installedMap.get(id) || null;

        // Content check verification
        if (id === ELECTRONICS_SMD_PACK.id) {
          isInstalled = isInstalled || Boolean(sampleAttr);
        } else if (id === 'base-units') {
          isInstalled = isInstalled || Boolean(sampleUnit);
        } else if (
          id === 'material-categories' ||
          id === 'default-categories'
        ) {
          isInstalled = isInstalled || Boolean(sampleCategory);
        }

        return {
          id,
          name,
          category,
          description,
          entityType,
          recordCount,
          isInstalled,
          installedAt,
        };
      },
    );
  }

  getPackById(id: string): DataPackDefinition {
    if (id === ELECTRONICS_SMD_PACK.id) {
      return {
        ...ELECTRONICS_SMD_PACK,
        categoryMappings: ELECTRONICS_SMD_PACK.categoryBindings,
      } as unknown as DataPackDefinition;
    }
    const pack = DATA_PACKS.find((p) => p.id === id);
    if (!pack) {
      throw new NotFoundException(`Data Pack '${id}' not found.`);
    }
    return pack;
  }

  async installDataPack(id: string, userId?: string) {
    if (id === ELECTRONICS_SMD_PACK.id) {
      return this.installElectronicsSmdPack(userId);
    }

    const pack = this.getPackById(id);
    if (!pack.rows || pack.rows.length === 0) {
      throw new Error(`Data pack '${id}' has no rows to import.`);
    }

    // Auto-generate column mapping
    const template = this.importExportService.getTemplate(pack.entityType);
    const columnMapping: Record<string, string> = {};
    template.headers.forEach((h) => {
      columnMapping[h] = h;
    });

    const csvLines = [
      template.headers.join(','),
      ...pack.rows.map((r) =>
        template.headers
          .map((h) => {
            const val = r[h];
            return typeof val === 'string'
              ? val
              : typeof val === 'number' || typeof val === 'boolean'
                ? String(val)
                : '';
          })
          .join(','),
      ),
    ];
    const csvContent = csvLines.join('\n');
    const mockFile = {
      originalname: `${pack.id}.csv`,
      buffer: Buffer.from(csvContent),
      size: Buffer.from(csvContent).length,
      mimetype: 'text/csv',
    };

    // Execute import using production import engine
    const result = await this.importExportService.executeImport(
      mockFile,
      pack.entityType,
      columnMapping,
      userId,
    );

    if (!result) {
      throw new Error('Data pack import execution failed');
    }

    await this.activityService.createEvent({
      module: 'Administration',
      entityType: 'DataPack',
      entityId: pack.id,
      eventType: 'DATA_PACK_INSTALLED',
      description: `Installed Data Pack '${pack.name}' (${pack.recordCount} records)`,
      severity: 'INFO',
      status: 'COMPLETED',
      userId,
    });

    await this.auditService.record({
      action: 'DATA_PACK_INSTALLED',
      category: 'Administration',
      userId,
      details: {
        packId: pack.id,
        packName: pack.name,
        entityType: pack.entityType,
        processedRecords: result.processedRecords,
      },
    });

    return {
      success: true,
      status: 'COMPLETED',
      packId: pack.id,
      packName: pack.name,
      recordsProcessed: result.processedRecords,
      processedRecords: result.processedRecords,
      jobId: result.id,
    };
  }

  private async installElectronicsSmdPack(userId?: string) {
    let processedRecords = 0;

    // 1. Install / Upsert Units of Measure
    for (const u of ELECTRONICS_SMD_PACK.units) {
      await db
        .insert(units)
        .values({
          name: u.name,
          category: u.category,
          isBaseUnit: u.isBaseUnit,
          conversionFactor: u.conversionFactor,
          precision: u.precision,
          isActive: true,
        })
        .onConflictDoNothing({ target: units.name });
      processedRecords++;
    }

    // 2. Install / Upsert Categories
    const catMap = new Map<string, string>();

    // First ensure root category ELEC exists
    const [rootCat] = await db
      .insert(categories)
      .values({
        code: 'ELEC',
        name: 'Electronic Components',
        description:
          'Master electronics category for passive and active components',
        parentId: null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: categories.code,
        set: {
          name: 'Electronic Components',
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: categories.id, code: categories.code });

    if (rootCat) {
      catMap.set(rootCat.code, rootCat.id);
      processedRecords++;
    }

    // Insert child categories
    for (const cat of ELECTRONICS_SMD_PACK.categories) {
      if (cat.code === 'ELEC') continue;
      const parentId = cat.parentCode
        ? (catMap.get(cat.parentCode) ?? null)
        : null;

      const [c] = await db
        .insert(categories)
        .values({
          code: cat.code,
          name: cat.name,
          description: cat.description ?? null,
          parentId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: categories.code,
          set: {
            name: cat.name,
            description: cat.description ?? null,
            parentId,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning({ id: categories.id, code: categories.code });

      if (c) {
        catMap.set(c.code, c.id);
        processedRecords++;
      }
    }

    // 3. Install / Upsert Attribute Definitions and Options
    const defMap = new Map<string, string>();

    for (const def of ELECTRONICS_SMD_PACK.attributeDefinitions) {
      const [savedDef] = await db
        .insert(attributeDefinitions)
        .values({
          code: def.code,
          name: def.name,
          description: def.description ?? null,
          dataType: def.dataType,
          unitCategory: def.unitCategory ?? null,
          defaultUnit: def.defaultUnit ?? null,
          isFilterable: def.isFilterable ?? true,
          sortOrder: def.sortOrder ?? 0,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: attributeDefinitions.code,
          set: {
            name: def.name,
            description: def.description ?? null,
            dataType: def.dataType,
            unitCategory: def.unitCategory ?? null,
            defaultUnit: def.defaultUnit ?? null,
            isFilterable: def.isFilterable ?? true,
            sortOrder: def.sortOrder ?? 0,
            isActive: true,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: attributeDefinitions.id,
          code: attributeDefinitions.code,
        });

      if (savedDef) {
        defMap.set(savedDef.code, savedDef.id);
        processedRecords++;

        // Install options if defined
        if (def.options && def.options.length > 0) {
          for (const opt of def.options) {
            await db
              .insert(attributeOptions)
              .values({
                attributeDefinitionId: savedDef.id,
                code: opt.code,
                label: opt.label,
                sortOrder: opt.sortOrder ?? 0,
                isActive: true,
              })
              .onConflictDoUpdate({
                target: [
                  attributeOptions.attributeDefinitionId,
                  attributeOptions.code,
                ],
                set: {
                  label: opt.label,
                  sortOrder: opt.sortOrder ?? 0,
                  isActive: true,
                  updatedAt: new Date(),
                },
              });
            processedRecords++;
          }
        }
      }
    }

    // 4. Install / Upsert Category Attribute Bindings
    for (const binding of ELECTRONICS_SMD_PACK.categoryBindings) {
      const catId = catMap.get(binding.categoryCode);
      const defId = defMap.get(binding.attributeCode);

      if (catId && defId) {
        await db
          .insert(categoryAttributes)
          .values({
            categoryId: catId,
            attributeDefinitionId: defId,
            isRequired: binding.isRequired ?? false,
            sortOrder: binding.sortOrder ?? 0,
          })
          .onConflictDoUpdate({
            target: [
              categoryAttributes.categoryId,
              categoryAttributes.attributeDefinitionId,
            ],
            set: {
              isRequired: binding.isRequired ?? false,
              sortOrder: binding.sortOrder ?? 0,
              updatedAt: new Date(),
            },
          });
        processedRecords++;
      }
    }

    // 5. Install / Upsert Sample Products with dynamic attributes
    for (const sample of ELECTRONICS_SMD_PACK.sampleComponents) {
      const catId = catMap.get(sample.categoryCode) ?? null;

      const [comp] = await db
        .insert(components)
        .values({
          sku: sample.sku,
          name: sample.name,
          unit: sample.unit,
          description: sample.description,
          categoryId: catId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: components.sku,
          set: {
            name: sample.name,
            unit: sample.unit,
            description: sample.description,
            categoryId: catId,
            updatedAt: new Date(),
          },
        })
        .returning({ id: components.id });

      if (comp && sample.attributes) {
        const rawAttrs = sample.attributes as Record<string, unknown>;
        const attrInputs = Object.entries(rawAttrs).map(([code, val]) => {
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            const obj = val as {
              value?: unknown;
              numberValue?: unknown;
              textValue?: unknown;
              unit?: string;
              code?: string;
              optionCode?: string;
            };
            return {
              code,
              value: obj.value ?? obj.numberValue ?? obj.textValue,
              unit: obj.unit,
              optionCode:
                obj.optionCode ??
                obj.code ??
                (typeof obj.value === 'string' ? obj.value : undefined),
            };
          }
          return {
            code,
            value: val,
            optionCode: String(val),
          };
        });

        await this.attributesService.saveComponentAttributes(
          comp.id,
          attrInputs,
        );
        processedRecords++;
      }
    }

    await this.activityService.createEvent({
      module: 'Administration',
      entityType: 'DataPack',
      entityId: ELECTRONICS_SMD_PACK.id,
      eventType: 'DATA_PACK_INSTALLED',
      description: `Installed Data Pack '${ELECTRONICS_SMD_PACK.name}' (${processedRecords} configuration records)`,
      severity: 'INFO',
      status: 'COMPLETED',
      userId,
    });

    await this.auditService.record({
      action: 'DATA_PACK_INSTALLED',
      category: 'Administration',
      userId,
      details: {
        packId: ELECTRONICS_SMD_PACK.id,
        packName: ELECTRONICS_SMD_PACK.name,
        entityType: ELECTRONICS_SMD_PACK.entityType,
        processedRecords,
      },
    });

    return {
      success: true,
      status: 'COMPLETED',
      packId: ELECTRONICS_SMD_PACK.id,
      packName: ELECTRONICS_SMD_PACK.name,
      recordsProcessed: processedRecords,
      processedRecords,
      jobId: 'direct-pack-installation',
    };
  }
}
