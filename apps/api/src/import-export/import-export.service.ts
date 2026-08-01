import { Injectable, BadRequestException } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  importExportJobs,
  components,
  locations,
  suppliers,
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
  // Prevent CSV Formula Injection
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
      Location: {
        headers: ['code', 'name', 'kind', 'description'],
        sampleRow: {
          code: 'WH-A-01',
          name: 'Main Warehouse Zone A Bin 01',
          kind: 'BIN',
          description: 'Top shelf bin 01',
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

    // Auto column mapping match
    const columnMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const matched = systemFields.find(
        (f) => f.toLowerCase() === h.toLowerCase(),
      );
      if (matched) {
        columnMapping[h] = matched;
      }
    });

    // Validation Preview
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
          const skuKey = dto.columnMapping.sku || 'sku';
          const nameKey = dto.columnMapping.name || 'name';
          const unitKey = dto.columnMapping.unit || 'unit';

          const skuVal = safeString(row[skuKey]) || `SKU-${Date.now()}-${i}`;
          const nameVal = safeString(row[nameKey]) || `Component ${skuVal}`;
          const unitVal = safeString(row[unitKey]) || 'pcs';
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

    // Filter columns if specified
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
      // CSV Export
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
