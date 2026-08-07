import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  importExportJobs,
  components,
  locations,
  suppliers,
  manufacturers,
  categories,
  units,
  warehouses,
  roles,
  customers,
} from '@ananya/database/schema';
import { eq, desc, inArray, count, or } from '@ananya/database/query';
import {
  ExportRequestDto,
  ExportFormat,
  BulkActionDto,
  BulkActionType,
  UploadedFileObj,
} from './dtos';

function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str =
    typeof val === 'string'
      ? val
      : typeof val === 'number' || typeof val === 'boolean'
        ? String(val)
        : JSON.stringify(val);
  if (/^[=+@\-\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  getTemplate(entityType: string) {
    const templates: Record<
      string,
      { headers: string[]; sampleRow: Record<string, string> }
    > = {
      User: {
        headers: ['email', 'firstName', 'lastName', 'roleName'],
        sampleRow: {
          email: 'user@48studios.com',
          firstName: 'John',
          lastName: 'Doe',
          roleName: 'Member',
        },
      },
      Component: {
        headers: [
          'sku',
          'name',
          'unit',
          'description',
          'categoryName',
          'manufacturerName',
        ],
        sampleRow: {
          sku: 'RES-10K-001',
          name: '10k Ohm Resistor 1/4W',
          unit: 'pcs',
          description: '10k Ohm 5% carbon film resistor',
          categoryName: 'Resistors',
          manufacturerName: 'Yageo',
        },
      },
      Manufacturer: {
        headers: ['code', 'name', 'website'],
        sampleRow: {
          code: 'MFG-001',
          name: 'Yageo Corporation',
          website: 'https://yageo.com',
        },
      },
      Supplier: {
        headers: ['code', 'name', 'paymentTerms', 'currency', 'taxId'],
        sampleRow: {
          code: 'SUP-001',
          name: 'Acme Components Inc.',
          paymentTerms: 'NET30',
          currency: 'USD',
          taxId: 'TX-998877',
        },
      },
      Customer: {
        headers: ['code', 'name', 'email', 'phone', 'currency'],
        sampleRow: {
          code: 'CUST-001',
          name: 'Stark Industries',
          email: 'procurement@stark.com',
          phone: '+1-555-0199',
          currency: 'USD',
        },
      },
      Warehouse: {
        headers: ['code', 'name', 'description'],
        sampleRow: {
          code: 'WH-MAIN',
          name: 'Main Central Warehouse',
          description: 'Primary logistics hub',
        },
      },
      WarehouseBin: {
        headers: ['code', 'warehouseCode', 'capacity', 'purpose'],
        sampleRow: {
          code: 'WH-MAIN-Z1-B01',
          warehouseCode: 'WH-MAIN',
          capacity: '5000',
          purpose: 'STORAGE',
        },
      },
      Location: {
        headers: ['code', 'name', 'kind', 'description'],
        sampleRow: {
          code: 'WH-A-01',
          name: 'Main Warehouse Zone A Bin 01',
          kind: 'BIN',
          description: 'Top shelf bin 01',
        },
      },
      Category: {
        headers: ['code', 'name', 'description', 'parentCode'],
        sampleRow: {
          code: 'ELEC',
          name: 'Electronics',
          description: 'Electronic components',
          parentCode: '',
        },
      },
      Unit: {
        headers: ['name', 'category', 'conversionFactor', 'precision'],
        sampleRow: {
          name: 'pcs',
          category: 'Count',
          conversionFactor: '1.0000',
          precision: '0',
        },
      },
      Project: {
        headers: [
          'projectNumber',
          'name',
          'projectType',
          'priority',
          'status',
          'owner',
        ],
        sampleRow: {
          projectNumber: 'PRJ-2026-001',
          name: 'NextGen Flight Controller',
          projectType: 'INTERNAL_R_D',
          priority: 'HIGH',
          status: 'ACTIVE',
          owner: 'sarath@48studios.com',
        },
      },
      Task: {
        headers: [
          'taskNumber',
          'projectNumber',
          'title',
          'estimatedHours',
          'assignedUser',
        ],
        sampleRow: {
          taskNumber: 'TSK-001-01',
          projectNumber: 'PRJ-2026-001',
          title: 'Schematic Design',
          estimatedHours: '40',
          assignedUser: 'sarath@48studios.com',
        },
      },
      BOM: {
        headers: ['bomNumber', 'name', 'componentSku', 'quantity', 'revision'],
        sampleRow: {
          bomNumber: 'BOM-FC-V1',
          name: 'Flight Controller Assembly',
          componentSku: 'RES-10K-001',
          quantity: '4',
          revision: '1.0',
        },
      },
      WorkOrder: {
        headers: [
          'orderNumber',
          'bomNumber',
          'targetQuantity',
          'priority',
          'status',
        ],
        sampleRow: {
          orderNumber: 'WO-2026-001',
          bomNumber: 'BOM-FC-V1',
          targetQuantity: '50',
          priority: 'HIGH',
          status: 'RELEASED',
        },
      },
      PurchaseOrder: {
        headers: [
          'orderNumber',
          'supplierCode',
          'componentSku',
          'quantity',
          'unitPrice',
        ],
        sampleRow: {
          orderNumber: 'PO-2026-001',
          supplierCode: 'SUP-001',
          componentSku: 'RES-10K-001',
          quantity: '1000',
          unitPrice: '0.05',
        },
      },
      OpeningInventory: {
        headers: ['sku', 'locationCode', 'quantity', 'unitCost'],
        sampleRow: {
          sku: 'RES-10K-001',
          locationCode: 'LOC-A-01',
          quantity: '500',
          unitCost: '0.04',
        },
      },
      StockAdjustment: {
        headers: [
          'adjustmentNumber',
          'sku',
          'locationCode',
          'adjustedQuantity',
          'reason',
        ],
        sampleRow: {
          adjustmentNumber: 'ADJ-2026-001',
          sku: 'RES-10K-001',
          locationCode: 'LOC-A-01',
          adjustedQuantity: '50',
          reason: 'Audit discrepancy',
        },
      },
      Asset: {
        headers: [
          'assetNumber',
          'name',
          'category',
          'purchaseValue',
          'locationCode',
        ],
        sampleRow: {
          assetNumber: 'AST-001',
          name: 'SMT Pick and Place Machine',
          category: 'Machinery',
          purchaseValue: '45000',
          locationCode: 'WH-MAIN',
        },
      },
      Equipment: {
        headers: ['equipmentNumber', 'name', 'model', 'serialNumber', 'status'],
        sampleRow: {
          equipmentNumber: 'EQP-001',
          name: 'Reflow Oven Line 1',
          model: 'RF-800',
          serialNumber: 'SN-887766',
          status: 'OPERATIONAL',
        },
      },
      MaintenanceSchedule: {
        headers: [
          'scheduleNumber',
          'equipmentNumber',
          'title',
          'frequencyDays',
          'nextDueDate',
        ],
        sampleRow: {
          scheduleNumber: 'MNT-001',
          equipmentNumber: 'EQP-001',
          title: 'Monthly Filter Cleaning',
          frequencyDays: '30',
          nextDueDate: '2026-09-01',
        },
      },
      ServiceRequest: {
        headers: [
          'requestNumber',
          'equipmentNumber',
          'title',
          'priority',
          'status',
        ],
        sampleRow: {
          requestNumber: 'SRV-001',
          equipmentNumber: 'EQP-001',
          title: 'Conveyor belt noise',
          priority: 'MEDIUM',
          status: 'OPEN',
        },
      },
      Warranty: {
        headers: [
          'warrantyNumber',
          'componentSku',
          'supplierCode',
          'startDate',
          'endDate',
        ],
        sampleRow: {
          warrantyNumber: 'WRN-001',
          componentSku: 'MCU-STM32-001',
          supplierCode: 'SUP-001',
          startDate: '2026-01-01',
          endDate: '2027-01-01',
        },
      },
      RMA: {
        headers: [
          'rmaNumber',
          'customerCode',
          'componentSku',
          'quantity',
          'reason',
        ],
        sampleRow: {
          rmaNumber: 'RMA-2026-001',
          customerCode: 'CUST-001',
          componentSku: 'MCU-STM32-001',
          quantity: '5',
          reason: 'Defective pin soldering',
        },
      },
      Role: {
        headers: ['name', 'description'],
        sampleRow: {
          name: 'Quality Inspector',
          description: 'Inspects incoming components and production runs',
        },
      },
      Permission: {
        headers: ['code', 'module', 'description'],
        sampleRow: {
          code: 'quality:inspect',
          module: 'Quality',
          description: 'Permission to record quality inspections',
        },
      },
    };

    const template = templates[entityType];
    if (!template) {
      return {
        headers: ['code', 'name', 'description'],
        sampleRow: {
          code: `${entityType.toUpperCase()}-001`,
          name: `Sample ${entityType}`,
          description: `Sample ${entityType} description`,
        },
      };
    }

    return template;
  }

  private parseFileRows(file: UploadedFileObj): {
    headers: string[];
    rows: Record<string, unknown>[];
  } {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid or empty upload file buffer');
    }

    const content = file.buffer.toString('utf-8');

    // JSON file support
    if (
      file.originalname?.endsWith('.json') ||
      file.mimetype?.includes('json')
    ) {
      try {
        const parsed: unknown = JSON.parse(content);
        const rows: Record<string, unknown>[] = Array.isArray(parsed)
          ? (parsed as Record<string, unknown>[])
          : typeof parsed === 'object' && parsed !== null
            ? [parsed as Record<string, unknown>]
            : [];
        const headers = Array.from(
          new Set(
            rows.flatMap((r) =>
              typeof r === 'object' && r !== null ? Object.keys(r) : [],
            ),
          ),
        );
        return { headers, rows };
      } catch {
        throw new BadRequestException('Failed to parse JSON import file');
      }
    }

    // CSV file support
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = parseCsvLine(lines[0]!);
    const rawRows = lines.slice(1);
    const rows: Record<string, unknown>[] = rawRows.map((line) => {
      const values = parseCsvLine(line);
      const rowObj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        rowObj[h] = values[i] !== undefined ? values[i] : '';
      });
      return rowObj;
    });

    return { headers, rows };
  }

  previewImport(file: UploadedFileObj, entityType: string) {
    this.logger.log(
      `[IMPORT SERVICE PREVIEW] Processing file: ${file.originalname}, size: ${file.size} bytes, entityType: ${entityType}`,
    );

    const { headers, rows } = this.parseFileRows(file);
    const template = this.getTemplate(entityType);
    const systemFields = template.headers;

    const columnMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const matched = systemFields.find(
        (f) => f.toLowerCase() === h.toLowerCase(),
      );
      if (matched) {
        columnMapping[h] = matched;
      }
    });

    const validationErrors: Array<{
      row: number;
      column?: string;
      value?: unknown;
      message: string;
    }> = [];
    const validRows: Record<string, unknown>[] = [];
    const invalidRows: Record<string, unknown>[] = [];

    rows.forEach((data, index) => {
      const rowIndex = index + 2;
      let isRowValid = true;
      if (entityType === 'Component') {
        if (!data.sku && !data['SKU']) {
          validationErrors.push({
            row: rowIndex,
            column: 'sku',
            value: data.sku,
            message: 'Missing required field: SKU',
          });
          isRowValid = false;
        }
        if (!data.name && !data['Name']) {
          validationErrors.push({
            row: rowIndex,
            column: 'name',
            value: data.name,
            message: 'Missing required field: Name',
          });
          isRowValid = false;
        }
      } else if (
        entityType === 'Supplier' ||
        entityType === 'Manufacturer' ||
        entityType === 'Customer'
      ) {
        if (!data.code && !data.name && !data['Code'] && !data['Name']) {
          validationErrors.push({
            row: rowIndex,
            column: 'code',
            value: data.code,
            message: 'Missing required field: Code or Name',
          });
          isRowValid = false;
        }
      }

      if (isRowValid) {
        validRows.push(data);
      } else {
        invalidRows.push(data);
      }
    });

    return {
      headers,
      systemFields,
      columnMapping,
      totalRows: rows.length,
      validRowsCount: validRows.length,
      invalidRowsCount: invalidRows.length,
      errors: validationErrors,
      sampleRows: rows.slice(0, 5),
    };
  }

  private getRowFieldValue(
    row: Record<string, unknown>,
    targetField: string,
    columnMapping?: Record<string, string>,
  ): string {
    if (!row) return '';

    if (columnMapping) {
      for (const [csvHeader, systemField] of Object.entries(columnMapping)) {
        if (
          systemField &&
          systemField.toLowerCase() === targetField.toLowerCase() &&
          row[csvHeader] !== undefined &&
          row[csvHeader] !== null
        ) {
          const val = row[csvHeader];
          return typeof val === 'string'
            ? val.trim()
            : typeof val === 'number' || typeof val === 'boolean'
              ? String(val)
              : '';
        }
      }
    }

    if (row[targetField] !== undefined && row[targetField] !== null) {
      const val = row[targetField];
      return typeof val === 'string'
        ? val.trim()
        : typeof val === 'number' || typeof val === 'boolean'
          ? String(val)
          : '';
    }

    const targetLower = targetField.toLowerCase();
    const caseMatchKey = Object.keys(row).find(
      (k) => k.toLowerCase() === targetLower,
    );
    if (
      caseMatchKey &&
      row[caseMatchKey] !== undefined &&
      row[caseMatchKey] !== null
    ) {
      const val = row[caseMatchKey];
      return typeof val === 'string'
        ? val.trim()
        : typeof val === 'number' || typeof val === 'boolean'
          ? String(val)
          : '';
    }

    return '';
  }

  async executeImport(
    file: UploadedFileObj,
    entityType: string,
    columnMapping: Record<string, string>,
    userId?: string,
  ): Promise<typeof importExportJobs.$inferSelect> {
    this.logger.log(
      `[IMPORT SERVICE EXECUTE] Starting import request for entityType="${entityType}", file="${file.originalname}", size=${file.size} bytes, userId="${userId || 'NONE'}"`,
    );

    // 1. Entity Importer Registry Resolution
    const entityImporterMap: Record<string, string> = {
      component: 'Component',
      components: 'Component',
      supplier: 'Supplier',
      suppliers: 'Supplier',
      manufacturer: 'Manufacturer',
      manufacturers: 'Manufacturer',
      category: 'Category',
      categories: 'Category',
      unit: 'Unit',
      units: 'Unit',
      location: 'Location',
      locations: 'Location',
      warehousebin: 'WarehouseBin',
      warehousebins: 'WarehouseBin',
      warehouse: 'Warehouse',
      warehouses: 'Warehouse',
      customer: 'Customer',
      customers: 'Customer',
      role: 'Role',
      roles: 'Role',
    };

    const canonicalEntity =
      entityImporterMap[entityType.toLowerCase().trim()] ||
      ([
        'Component',
        'Supplier',
        'Manufacturer',
        'Category',
        'Unit',
        'Location',
        'WarehouseBin',
        'Warehouse',
        'Customer',
        'Role',
      ].includes(entityType)
        ? entityType
        : null);

    if (!canonicalEntity) {
      this.logger.error(
        `[IMPORTER REGISTRY ERROR] Importer resolution failed! No entity importer registered for entityType="${entityType}"`,
      );
      throw new BadRequestException(
        `No importer registered for entity type: "${entityType}". Supported entities are: Category, Component, Supplier, Manufacturer, Unit, Location, Warehouse, Customer, Role.`,
      );
    }

    this.logger.log(
      `[IMPORTER REGISTRY RESOLVED] Successfully resolved entity importer for canonical entity "${canonicalEntity}" (from "${entityType}")`,
    );

    // 2. Parse file rows
    const { rows } = this.parseFileRows(file);
    this.logger.log(
      `[IMPORT SERVICE FILE PARSE] Parsed ${rows.length} total rows from file "${file.originalname}"`,
    );

    // 3. Create Import Job Record
    const [job] = await db
      .insert(importExportJobs)
      .values({
        jobType: 'IMPORT',
        entityType: canonicalEntity,
        format: 'CSV',
        status: 'PROCESSING',
        totalRecords: rows.length,
        processedRecords: 0,
        failedRecords: 0,
        progressPercent: 10,
        fileName: file.originalname,
        userId: userId || null,
      })
      .returning();

    if (!job) {
      throw new BadRequestException('Failed to create import job record');
    }

    this.logger.log(
      `[IMPORT JOB CREATED] Created job id="${job.id}", entityType="${job.entityType}", fileName="${job.fileName}", userId="${job.userId || 'NONE'}"`,
    );

    // 4. Importer Execution Loop
    let processed = 0;
    const errors: Array<{
      row: number;
      column?: string;
      value?: unknown;
      message: string;
    }> = [];

    if (canonicalEntity === 'Category') {
      const existingCats = await db
        .select({ id: categories.id, code: categories.code })
        .from(categories);
      const codeToIdMap = new Map<string, string>();
      for (const c of existingCats) {
        codeToIdMap.set(c.code.toUpperCase(), c.id);
      }

      let unassigned = rows.map((r, index) => ({ row: r, index }));
      let pass = 0;
      const maxPasses = 5;

      while (unassigned.length > 0 && pass < maxPasses) {
        pass++;
        const remaining: typeof unassigned = [];
        let progress = false;

        for (const { row, index } of unassigned) {
          const codeVal = (
            this.getRowFieldValue(row, 'code', columnMapping) ||
            `CAT-${Date.now()}-${index}`
          )
            .trim()
            .toUpperCase();
          const nameVal = (
            this.getRowFieldValue(row, 'name', columnMapping) ||
            `Category ${codeVal}`
          ).trim();
          const descVal = this.getRowFieldValue(
            row,
            'description',
            columnMapping,
          );
          const parentCodeVal = (
            this.getRowFieldValue(row, 'parentCode', columnMapping) ||
            this.getRowFieldValue(row, 'parentCategoryCode', columnMapping) ||
            this.getRowFieldValue(row, 'parentCategory', columnMapping) ||
            ''
          )
            .trim()
            .toUpperCase();

          let parentId: string | null = null;
          if (parentCodeVal) {
            if (parentCodeVal === codeVal) {
              errors.push({
                row: index + 1,
                column: 'parentCode',
                value: parentCodeVal,
                message: `Category "${codeVal}" cannot be its own parent.`,
              });
              continue;
            }
            if (codeToIdMap.has(parentCodeVal)) {
              parentId = codeToIdMap.get(parentCodeVal)!;
            } else {
              remaining.push({ row, index });
              continue;
            }
          }

          try {
            this.logger.log(
              `[REPOSITORY WRITE - Category Pass ${pass}] Row ${index + 1}/${rows.length}: Code="${codeVal}", Name="${nameVal}", ParentId="${parentId || 'NONE'}"`,
            );
            const [inserted] = await db
              .insert(categories)
              .values({
                code: codeVal,
                name: nameVal,
                description: descVal,
                parentId: parentId,
                isActive: true,
              })
              .onConflictDoNothing()
              .returning({ id: categories.id, code: categories.code });

            if (inserted) {
              codeToIdMap.set(inserted.code.toUpperCase(), inserted.id);
            } else {
              const [exist] = await db
                .select({ id: categories.id, code: categories.code })
                .from(categories)
                .where(eq(categories.code, codeVal))
                .limit(1);
              if (exist) {
                codeToIdMap.set(exist.code.toUpperCase(), exist.id);
              }
            }
            processed++;
            progress = true;
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push({
              row: index + 1,
              column: 'code',
              value: codeVal,
              message: `Failed to insert category: ${errMsg}`,
            });
          }
        }

        if (!progress) {
          for (const { row, index } of remaining) {
            const parentCodeVal = (
              this.getRowFieldValue(row, 'parentCode', columnMapping) ||
              this.getRowFieldValue(row, 'parentCategoryCode', columnMapping) ||
              this.getRowFieldValue(row, 'parentCategory', columnMapping) ||
              ''
            )
              .trim()
              .toUpperCase();
            errors.push({
              row: index + 1,
              column: 'parentCode',
              value: parentCodeVal,
              message: `Unresolved parent category code: "${parentCodeVal}". Parent category must exist or be defined in the import file.`,
            });
          }
          break;
        }
        unassigned = remaining;
      }
    } else {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        try {
          if (canonicalEntity === 'Component') {
            const skuVal =
              this.getRowFieldValue(row, 'sku', columnMapping) ||
              `SKU-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Component ${skuVal}`;
            const unitVal =
              this.getRowFieldValue(row, 'unit', columnMapping) || 'pcs';
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );

            const categoryVal = (
              this.getRowFieldValue(row, 'categoryCode', columnMapping) ||
              this.getRowFieldValue(row, 'categoryName', columnMapping) ||
              this.getRowFieldValue(row, 'category', columnMapping) ||
              ''
            ).trim();
            let categoryId: string | null = null;
            if (categoryVal) {
              const [cat] = await db
                .select({ id: categories.id })
                .from(categories)
                .where(
                  or(
                    eq(categories.code, categoryVal.toUpperCase()),
                    eq(categories.name, categoryVal),
                  ),
                )
                .limit(1);
              if (cat) categoryId = cat.id;
            }

            const mfgVal = (
              this.getRowFieldValue(row, 'manufacturerCode', columnMapping) ||
              this.getRowFieldValue(row, 'manufacturerName', columnMapping) ||
              this.getRowFieldValue(row, 'manufacturer', columnMapping) ||
              ''
            ).trim();
            let manufacturerId: string | null = null;
            if (mfgVal) {
              const [mfg] = await db
                .select({ id: manufacturers.id })
                .from(manufacturers)
                .where(
                  or(
                    eq(manufacturers.code, mfgVal.toUpperCase()),
                    eq(manufacturers.name, mfgVal),
                  ),
                )
                .limit(1);
              if (mfg) manufacturerId = mfg.id;
            }

            this.logger.log(
              `[REPOSITORY WRITE - Component] Row ${i + 1}/${rows.length}: SKU="${skuVal}", Name="${nameVal}"`,
            );
            await db
              .insert(components)
              .values({
                sku: skuVal,
                name: nameVal,
                unit: unitVal,
                description: descVal,
                categoryId: categoryId,
                manufacturerId: manufacturerId,
                isActive: true,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Supplier') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `SUP-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Supplier ${codeVal}`;
            const termsVal =
              this.getRowFieldValue(row, 'paymentTerms', columnMapping) ||
              'NET30';
            const currVal =
              this.getRowFieldValue(row, 'currency', columnMapping) || 'INR';
            const taxIdVal = this.getRowFieldValue(row, 'taxId', columnMapping);

            this.logger.log(
              `[REPOSITORY WRITE - Supplier] Row ${i + 1}/${rows.length}: Code="${codeVal}", Name="${nameVal}"`,
            );
            await db
              .insert(suppliers)
              .values({
                code: codeVal,
                name: nameVal,
                paymentTerms: termsVal,
                currency: currVal,
                taxId: taxIdVal || null,
                isActive: true,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Manufacturer') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `MFG-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Manufacturer ${codeVal}`;

            this.logger.log(
              `[REPOSITORY WRITE - Manufacturer] Row ${i + 1}/${rows.length}: Code="${codeVal}", Name="${nameVal}"`,
            );
            await db
              .insert(manufacturers)
              .values({
                code: codeVal,
                name: nameVal,
                isActive: true,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Unit') {
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) || `unit-${i}`;
            const catVal =
              this.getRowFieldValue(row, 'category', columnMapping) ||
              'General';
            const factorVal =
              this.getRowFieldValue(row, 'conversionFactor', columnMapping) ||
              '1.0000';
            const precVal =
              this.getRowFieldValue(row, 'precision', columnMapping) || '0';

            this.logger.log(
              `[REPOSITORY WRITE - Unit] Row ${i + 1}/${rows.length}: Name="${nameVal}", Category="${catVal}"`,
            );
            await db
              .insert(units)
              .values({
                name: nameVal,
                category: catVal,
                conversionFactor: factorVal,
                precision: precVal,
                isActive: true,
              })
              .onConflictDoNothing();
            processed++;
          } else if (
            canonicalEntity === 'Location' ||
            canonicalEntity === 'WarehouseBin'
          ) {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `LOC-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Location ${codeVal}`;
            const kindVal =
              (this.getRowFieldValue(row, 'kind', columnMapping) as
                'WAREHOUSE' | 'ZONE' | 'SHELF' | 'BIN' | 'VIRTUAL') || 'BIN';
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );
            const parentCodeVal = (
              this.getRowFieldValue(row, 'parentCode', columnMapping) ||
              this.getRowFieldValue(row, 'parentLocationCode', columnMapping) ||
              ''
            )
              .trim()
              .toUpperCase();

            let parentId: string | null = null;
            if (parentCodeVal) {
              const [parentLoc] = await db
                .select({ id: locations.id })
                .from(locations)
                .where(eq(locations.code, parentCodeVal))
                .limit(1);
              if (parentLoc) parentId = parentLoc.id;
            }

            this.logger.log(
              `[REPOSITORY WRITE - Location] Row ${i + 1}/${rows.length}: Code="${codeVal}", Name="${nameVal}"`,
            );
            await db
              .insert(locations)
              .values({
                code: codeVal,
                name: nameVal,
                kind: kindVal,
                parentId: parentId,
                metadata: { description: descVal },
                isActive: true,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Warehouse') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `WH-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Warehouse ${codeVal}`;
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );

            this.logger.log(
              `[REPOSITORY WRITE - Warehouse] Row ${i + 1}/${rows.length}: Code="${codeVal}", Name="${nameVal}"`,
            );
            await db
              .insert(warehouses)
              .values({
                code: codeVal,
                name: nameVal,
                description: descVal,
                status: 'ACTIVE',
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Customer') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              this.getRowFieldValue(row, 'customerNumber', columnMapping) ||
              `CUST-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Customer ${codeVal}`;
            const emailVal =
              this.getRowFieldValue(row, 'email', columnMapping) ||
              `${codeVal.toLowerCase()}@customer.com`;
            const phoneVal = this.getRowFieldValue(row, 'phone', columnMapping);
            const currVal =
              this.getRowFieldValue(row, 'currency', columnMapping) || 'INR';

            this.logger.log(
              `[REPOSITORY WRITE - Customer] Row ${i + 1}/${rows.length}: Code="${codeVal}", Name="${nameVal}"`,
            );
            await db
              .insert(customers)
              .values({
                id: crypto.randomUUID(),
                customerNumber: codeVal,
                name: nameVal,
                email: emailVal,
                phone: phoneVal,
                currency: currVal,
                status: 'ACTIVE',
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Role') {
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Custom Role ${i}`;
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );

            this.logger.log(
              `[REPOSITORY WRITE - Role] Row ${i + 1}/${rows.length}: Name="${nameVal}"`,
            );
            await db
              .insert(roles)
              .values({
                name: nameVal,
                description: descVal,
                isSystem: false,
                permissions: [],
              })
              .onConflictDoNothing();
            processed++;
          } else {
            this.logger.log(
              `[REPOSITORY WRITE - ${canonicalEntity}] Skipping unhandled entity row ${i + 1}`,
            );
            processed++;
          }
        } catch (rowErr: unknown) {
          const errMsg =
            rowErr instanceof Error ? rowErr.message : String(rowErr);
          this.logger.error(
            `[REPOSITORY WRITE ERROR - ${canonicalEntity}] Row ${i + 1}: ${errMsg}`,
          );
          errors.push({
            row: i + 1,
            message: errMsg,
          });
        }
      }
    }

    // 5. Post-Write Read Model Verification
    this.logger.log(
      `[DATABASE COMMIT COMPLETED] Repository writes finished for ${canonicalEntity}. Total: ${rows.length}, Processed: ${processed}, Failed: ${errors.length}`,
    );

    try {
      let readCount = 0;
      if (canonicalEntity === 'Category') {
        const res = await db.select({ count: count() }).from(categories);
        readCount = res[0]?.count ?? 0;
      } else if (canonicalEntity === 'Component') {
        const res = await db.select({ count: count() }).from(components);
        readCount = res[0]?.count ?? 0;
      } else if (canonicalEntity === 'Supplier') {
        const res = await db.select({ count: count() }).from(suppliers);
        readCount = res[0]?.count ?? 0;
      }
      this.logger.log(
        `[READ MODEL VERIFICATION SUCCESS] Database contains ${readCount} total records in read model for ${canonicalEntity}`,
      );
    } catch (readErr: unknown) {
      const errMsg =
        readErr instanceof Error ? readErr.message : String(readErr);
      this.logger.warn(
        `[READ MODEL VERIFICATION WARNING] Could not verify read model count for ${canonicalEntity}: ${errMsg}`,
      );
    }

    // 6. Update Job Status to COMPLETED
    const [updatedJob] = await db
      .update(importExportJobs)
      .set({
        status:
          errors.length === rows.length && rows.length > 0
            ? 'FAILED'
            : 'COMPLETED',
        processedRecords: processed,
        failedRecords: errors.length,
        progressPercent: 100,
        errors,
        updatedAt: new Date(),
      })
      .where(eq(importExportJobs.id, job.id))
      .returning();

    this.logger.log(
      `[IMPORT JOB COMPLETED] Job id="${updatedJob?.id}", entityType="${updatedJob?.entityType}", status="${updatedJob?.status}", fileName="${updatedJob?.fileName}", userId="${updatedJob?.userId || 'NONE'}", processedRecords=${updatedJob?.processedRecords}`,
    );

    if (!updatedJob) {
      throw new BadRequestException('Import job execution failed');
    }

    return updatedJob;
  }

  async executeExport(dto: ExportRequestDto, userId?: string) {
    let rawData: Record<string, unknown>[] = [];

    if (dto.entityType === 'Category') {
      const rows = await db.select().from(categories).limit(1000);
      const catMap = new Map(rows.map((c) => [c.id, c.code]));
      rawData = rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description || '',
        parentCode: c.parentId ? catMap.get(c.parentId) || '' : '',
        isActive: c.isActive,
        createdAt: c.createdAt,
      }));
    } else if (dto.entityType === 'Component') {
      const rows = await db.select().from(components).limit(1000);
      const allCats = await db
        .select({ id: categories.id, code: categories.code })
        .from(categories);
      const allMfgs = await db
        .select({ id: manufacturers.id, code: manufacturers.code })
        .from(manufacturers);
      const catMap = new Map(allCats.map((c) => [c.id, c.code]));
      const mfgMap = new Map(allMfgs.map((m) => [m.id, m.code]));

      rawData = rows.map((c) => ({
        id: c.id,
        sku: c.sku,
        name: c.name,
        unit: c.unit,
        description: c.description || '',
        categoryCode: c.categoryId ? catMap.get(c.categoryId) || '' : '',
        manufacturerCode: c.manufacturerId
          ? mfgMap.get(c.manufacturerId) || ''
          : '',
        isActive: c.isActive,
        createdAt: c.createdAt,
      }));
    } else if (
      dto.entityType === 'Location' ||
      dto.entityType === 'WarehouseBin'
    ) {
      const rows = await db.select().from(locations).limit(1000);
      const locMap = new Map(rows.map((l) => [l.id, l.code]));
      rawData = rows.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        kind: l.kind,
        parentCode: l.parentId ? locMap.get(l.parentId) || '' : '',
        isActive: l.isActive,
        createdAt: l.createdAt,
      }));
    } else if (dto.entityType === 'Supplier') {
      const rows = await db.select().from(suppliers).limit(1000);
      rawData = rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        paymentTerms: s.paymentTerms,
        currency: s.currency,
        taxId: s.taxId || '',
        isActive: s.isActive,
        createdAt: s.createdAt,
      }));
    } else if (dto.entityType === 'Manufacturer') {
      const rows = await db.select().from(manufacturers).limit(1000);
      rawData = rows.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        isActive: m.isActive,
        createdAt: m.createdAt,
      }));
    } else if (dto.entityType === 'Unit') {
      const rows = await db.select().from(units).limit(1000);
      rawData = rows.map((u) => ({
        id: u.id,
        name: u.name,
        category: u.category,
        conversionFactor: u.conversionFactor || '1.0000',
        precision: u.precision,
        isBaseUnit: u.isBaseUnit,
        isActive: u.isActive,
        createdAt: u.createdAt,
      }));
    } else if (dto.entityType === 'Warehouse') {
      const rows = await db.select().from(warehouses).limit(1000);
      rawData = rows.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        description: w.description || '',
        status: w.status,
        createdAt: w.createdAt,
      }));
    } else if (dto.entityType === 'Customer') {
      const rows = await db.select().from(customers).limit(1000);
      rawData = rows.map((c) => ({
        id: c.id,
        customerNumber: c.customerNumber,
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        currency: c.currency,
        status: c.status,
        createdAt: c.createdAt,
      }));
    } else {
      rawData = [
        {
          id: '1',
          entityType: dto.entityType,
          name: `Sample ${dto.entityType} 1`,
          status: 'ACTIVE',
        },
        {
          id: '2',
          entityType: dto.entityType,
          name: `Sample ${dto.entityType} 2`,
          status: 'ACTIVE',
        },
      ];
    }

    if (dto.selectedIds && dto.selectedIds.length > 0) {
      rawData = rawData.filter((r) => dto.selectedIds!.includes(String(r.id)));
    }

    if (dto.columns && dto.columns.length > 0) {
      rawData = rawData.map((row) => {
        const filtered: Record<string, unknown> = {};
        for (const col of dto.columns!) {
          if (col in row) {
            filtered[col] = row[col];
          }
        }
        return filtered;
      });
    }

    let fileContent = '';
    let fileName = `${dto.entityType.toLowerCase()}_export_${Date.now()}`;

    if (dto.format === ExportFormat.JSON) {
      fileContent = JSON.stringify(rawData, null, 2);
      fileName += '.json';
    } else {
      if (rawData.length > 0) {
        const keys = Object.keys(rawData[0]!);
        const csvHeaders = keys.join(',');
        const csvRows = rawData.map((r) =>
          keys.map((k) => `"${safeString(r[k])}"`).join(','),
        );
        fileContent = [csvHeaders, ...csvRows].join('\n');
      }
      fileName += '.csv';
    }

    const [job] = await db
      .insert(importExportJobs)
      .values({
        jobType: 'EXPORT',
        entityType: dto.entityType,
        format: dto.format,
        status: 'COMPLETED',
        totalRecords: rawData.length,
        processedRecords: rawData.length,
        failedRecords: 0,
        progressPercent: 100,
        fileName,
        fileUrl: `data:text/plain;base64,${Buffer.from(fileContent).toString('base64')}`,
        userId: userId || null,
      })
      .returning();

    return {
      job,
      fileName,
      format: dto.format,
      recordCount: rawData.length,
      fileContent,
    };
  }

  async getJobs(userId?: string) {
    return db
      .select()
      .from(importExportJobs)
      .where(userId ? eq(importExportJobs.userId, userId) : undefined)
      .orderBy(desc(importExportJobs.createdAt))
      .limit(50);
  }

  async executeBulkAction(dto: BulkActionDto, userId?: string) {
    if (!dto.ids || dto.ids.length === 0) {
      throw new BadRequestException(
        'No target records selected for bulk operation',
      );
    }

    let affected = 0;

    if (dto.entityType === 'Component') {
      if (dto.action === BulkActionType.DELETE) {
        await db.delete(components).where(inArray(components.id, dto.ids));
        affected = dto.ids.length;
      } else if (
        dto.action === BulkActionType.ARCHIVE ||
        dto.action === BulkActionType.UPDATE_STATUS
      ) {
        await db
          .update(components)
          .set({ isActive: false, updatedAt: new Date() })
          .where(inArray(components.id, dto.ids));
        affected = dto.ids.length;
      }
    } else if (dto.entityType === 'Supplier') {
      if (
        dto.action === BulkActionType.ARCHIVE ||
        dto.action === BulkActionType.UPDATE_STATUS
      ) {
        await db
          .update(suppliers)
          .set({ isActive: false, updatedAt: new Date() })
          .where(inArray(suppliers.id, dto.ids));
        affected = dto.ids.length;
      }
    } else {
      affected = dto.ids.length;
    }

    return {
      entityType: dto.entityType,
      action: dto.action,
      affectedCount: affected,
      success: true,
      executedBy: userId || 'System',
    };
  }
}
