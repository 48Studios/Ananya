import { Injectable, BadRequestException } from '@nestjs/common';
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
import { eq, desc, inArray } from '@ananya/database/query';
import {
  ExportRequestDto,
  ExportFormat,
  ImportPreviewDto,
  ExecuteImportDto,
  BulkActionDto,
  BulkActionType,
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

  previewImport(dto: ImportPreviewDto) {
    const lines = dto.fileContent
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 1) {
      throw new BadRequestException('Import file is empty');
    }

    const headers = lines[0]!
      .split(',')
      .map((h) => h.replace(/^"|"$/g, '').trim());
    const rawRows = lines.slice(1);
    const parsedRows = rawRows.map((line, index) => {
      const values = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
      const rowObj: Record<string, string> = {};
      headers.forEach((h, i) => {
        rowObj[h] = values[i] || '';
      });
      return { rowIndex: index + 2, data: rowObj };
    });

    const template = this.getTemplate(dto.entityType);
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

    parsedRows.forEach(({ rowIndex, data }) => {
      let isRowValid = true;
      if (dto.entityType === 'Component') {
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
        dto.entityType === 'Supplier' ||
        dto.entityType === 'Manufacturer' ||
        dto.entityType === 'Customer'
      ) {
        if (!data.code && !data.name) {
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
      totalRows: parsedRows.length,
      validRowsCount: validRows.length,
      invalidRowsCount: invalidRows.length,
      errors: validationErrors,
      sampleRows: parsedRows.slice(0, 5).map((r) => r.data),
    };
  }

  async executeImport(dto: ExecuteImportDto, userId?: string) {
    const [job] = await db
      .insert(importExportJobs)
      .values({
        jobType: 'IMPORT',
        entityType: dto.entityType,
        format: 'CSV',
        status: 'PROCESSING',
        totalRecords: dto.rows.length,
        processedRecords: 0,
        failedRecords: 0,
        progressPercent: 10,
        userId: userId || null,
      })
      .returning();

    if (!job) {
      throw new BadRequestException('Failed to create import job');
    }

    let processed = 0;
    const errors: Array<{
      row: number;
      column?: string;
      value?: unknown;
      message: string;
    }> = [];

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i]!;
      try {
        if (dto.entityType === 'Component') {
          const skuVal =
            safeString(row.sku || row[dto.columnMapping.sku || 'sku']) ||
            `SKU-${Date.now()}-${i}`;
          const nameVal =
            safeString(row.name || row[dto.columnMapping.name || 'name']) ||
            `Component ${skuVal}`;
          const unitVal =
            safeString(row.unit || row[dto.columnMapping.unit || 'unit']) ||
            'pcs';
          const descVal = safeString(row.description);

          await db
            .insert(components)
            .values({
              sku: skuVal,
              name: nameVal,
              unit: unitVal,
              description: descVal,
              isActive: true,
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Supplier') {
          const codeVal =
            safeString(row.code || row[dto.columnMapping.code || 'code']) ||
            `SUP-${Date.now()}-${i}`;
          const nameVal =
            safeString(row.name || row[dto.columnMapping.name || 'name']) ||
            `Supplier ${codeVal}`;
          const termsVal = safeString(row.paymentTerms) || 'NET30';
          const currVal = safeString(row.currency) || 'INR';

          await db
            .insert(suppliers)
            .values({
              code: codeVal,
              name: nameVal,
              paymentTerms: termsVal,
              currency: currVal,
              isActive: true,
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Manufacturer') {
          const codeVal = safeString(row.code) || `MFG-${Date.now()}-${i}`;
          const nameVal = safeString(row.name) || `Manufacturer ${codeVal}`;
          await db
            .insert(manufacturers)
            .values({
              code: codeVal,
              name: nameVal,
              isActive: true,
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Category') {
          const codeVal = safeString(row.code) || `CAT-${Date.now()}-${i}`;
          const nameVal = safeString(row.name) || `Category ${codeVal}`;
          await db
            .insert(categories)
            .values({
              code: codeVal,
              name: nameVal,
              description: safeString(row.description),
              isActive: true,
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Unit') {
          const nameVal = safeString(row.name) || `unit-${i}`;
          await db
            .insert(units)
            .values({
              name: nameVal,
              category: safeString(row.category) || 'General',
              conversionFactor: safeString(row.conversionFactor) || '1.0000',
              precision: safeString(row.precision) || '0',
              isActive: true,
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Location') {
          const codeVal = safeString(row.code) || `LOC-${Date.now()}-${i}`;
          const nameVal = safeString(row.name) || `Location ${codeVal}`;
          await db
            .insert(locations)
            .values({
              code: codeVal,
              name: nameVal,
              kind:
                (safeString(row.kind) as
                  'WAREHOUSE' | 'ZONE' | 'SHELF' | 'BIN' | 'VIRTUAL') || 'BIN',
              metadata: { description: safeString(row.description) },
              isActive: true,
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Warehouse') {
          const codeVal = safeString(row.code) || `WH-${Date.now()}-${i}`;
          const nameVal = safeString(row.name) || `Warehouse ${codeVal}`;
          await db
            .insert(warehouses)
            .values({
              code: codeVal,
              name: nameVal,
              description: safeString(row.description),
              status: 'ACTIVE',
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Customer') {
          const codeVal = safeString(row.code) || `CUST-${Date.now()}-${i}`;
          const nameVal = safeString(row.name) || `Customer ${codeVal}`;
          const emailVal =
            safeString(row.email) || `${codeVal.toLowerCase()}@customer.com`;
          await db
            .insert(customers)
            .values({
              id: crypto.randomUUID(),
              customerNumber: codeVal,
              name: nameVal,
              email: emailVal,
              phone: safeString(row.phone),
              currency: safeString(row.currency) || 'INR',
              status: 'ACTIVE',
            })
            .onConflictDoNothing();
        } else if (dto.entityType === 'Role') {
          const nameVal = safeString(row.name) || `Custom Role ${i}`;
          await db
            .insert(roles)
            .values({
              name: nameVal,
              description: safeString(row.description),
              isSystem: false,
              permissions: [],
            })
            .onConflictDoNothing();
        }
        processed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Row import error';
        errors.push({ row: i + 2, message: msg });
      }
    }

    const [updatedJob] = await db
      .update(importExportJobs)
      .set({
        status: errors.length === dto.rows.length ? 'FAILED' : 'COMPLETED',
        processedRecords: processed,
        failedRecords: errors.length,
        progressPercent: 100,
        errors,
        updatedAt: new Date(),
      })
      .where(eq(importExportJobs.id, job.id))
      .returning();

    return updatedJob;
  }

  async executeExport(dto: ExportRequestDto, userId?: string) {
    let rawData: Record<string, unknown>[] = [];

    if (dto.entityType === 'Component') {
      const rows = await db.select().from(components).limit(1000);
      rawData = rows.map((c) => ({
        id: c.id,
        sku: c.sku,
        name: c.name,
        unit: c.unit,
        isActive: c.isActive,
        createdAt: c.createdAt,
      }));
    } else if (dto.entityType === 'Location') {
      const rows = await db.select().from(locations).limit(1000);
      rawData = rows.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        kind: l.kind,
        isActive: l.isActive,
      }));
    } else if (dto.entityType === 'Supplier') {
      const rows = await db.select().from(suppliers).limit(1000);
      rawData = rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        paymentTerms: s.paymentTerms,
        isActive: s.isActive,
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
