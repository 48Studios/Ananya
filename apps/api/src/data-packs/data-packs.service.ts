import { Injectable, NotFoundException } from '@nestjs/common';
import { ImportExportService } from '../import-export/import-export.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { ActivityService } from '../activity/activity.service';

export interface DataPackDefinition {
  id: string;
  name: string;
  category: 'Core Lookup' | 'Infrastructure' | 'Demo Data';
  description: string;
  entityType: string;
  recordCount: number;
  rows: Record<string, unknown>[];
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
  ) {}

  getCatalog(): Omit<DataPackDefinition, 'rows'>[] {
    return DATA_PACKS.map(
      ({ id, name, category, description, entityType, recordCount }) => ({
        id,
        name,
        category,
        description,
        entityType,
        recordCount,
      }),
    );
  }

  getPackById(id: string): DataPackDefinition {
    const pack = DATA_PACKS.find((p) => p.id === id);
    if (!pack) {
      throw new NotFoundException(`Data Pack '${id}' not found.`);
    }
    return pack;
  }

  async installDataPack(id: string, userId?: string) {
    const pack = this.getPackById(id);

    // Auto-generate column mapping
    const template = this.importExportService.getTemplate(pack.entityType);
    const columnMapping: Record<string, string> = {};
    template.headers.forEach((h) => {
      columnMapping[h] = h;
    });

    // Execute import using production import engine
    const result = await this.importExportService.executeImport(
      {
        entityType: pack.entityType,
        columnMapping,
        rows: pack.rows,
      },
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
      packId: pack.id,
      packName: pack.name,
      processedRecords: result.processedRecords,
      jobId: result.id,
    };
  }
}
