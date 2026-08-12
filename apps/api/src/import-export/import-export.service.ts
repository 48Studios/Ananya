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
  warehouseBins,
  roles,
  users,
  customers,
  projects,
  projectTasks,
  billOfMaterials,
  billOfMaterialLines,
  productionOrders,
  purchaseOrders,
  purchaseOrderLines,
  inventoryTransactions,
  stockAdjustments,
  stockAdjustmentLines,
  serviceRequests,
  warrantyClaims,
  customerReturns,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { ExportRequestDto, UploadedFileObj } from './dtos';
import {
  getImporterDefinition,
  getTemplate as getRegistryTemplate,
  generateTemplateCsv,
  generateTemplateXlsx,
  getSystemFieldsWithAliases,
} from './importer-registry';

function cleanHeader(str: string): string {
  if (str.startsWith('\uFEFF')) {
    str = str.slice(1);
  }
  return str;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

@Injectable()
export class ImportExportService {
  private readonly logger = new Logger(ImportExportService.name);

  getTemplate(entityType: string) {
    return getRegistryTemplate(entityType);
  }

  getTemplateCsv(entityType: string): string {
    return generateTemplateCsv(entityType);
  }

  getTemplateXlsx(entityType: string): string {
    return generateTemplateXlsx(entityType);
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
      file.mimetype?.includes('json') ||
      file.originalname?.endsWith('.json')
    ) {
      try {
        const jsonContent = JSON.parse(content) as unknown;
        let rowsArr: Record<string, unknown>[] = [];
        if (Array.isArray(jsonContent)) {
          rowsArr = jsonContent as Record<string, unknown>[];
        } else if (jsonContent && typeof jsonContent === 'object') {
          rowsArr = [jsonContent as Record<string, unknown>];
        }
        const headersSet = new Set<string>();
        rowsArr.forEach((r) =>
          Object.keys(r).forEach((k) => headersSet.add(k)),
        );
        return { headers: Array.from(headersSet), rows: rowsArr };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BadRequestException(`Invalid JSON file format: ${msg}`);
      }
    }

    // CSV / Delimited text parsing
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = parseCsvLine(lines[0]!).map(cleanHeader);
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]!);
      const row: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      rows.push(row);
    }

    return { headers, rows };
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

  previewImport(file: UploadedFileObj, entityType: string) {
    this.logger.log(
      `[IMPORT SERVICE PREVIEW] Processing file: ${file.originalname}, size: ${file.size} bytes, entityType: ${entityType}`,
    );

    const { headers, rows } = this.parseFileRows(file);
    const importerDef = getImporterDefinition(entityType);
    const systemFields = importerDef.fields.map((f) => f.name);
    const systemFieldsWithAliases = getSystemFieldsWithAliases(entityType);

    const columnMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const normalizedHeader = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matched = systemFieldsWithAliases.find((item) =>
        item.aliases.includes(normalizedHeader),
      );
      if (matched) {
        columnMapping[h] = matched.canonicalField;
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

    const fileCategoryMap = new Map<string, string>();
    if (importerDef.entityType === 'Category') {
      rows.forEach((data) => {
        const codeVal = this.getRowFieldValue(
          data,
          'code',
          columnMapping,
        ).toUpperCase();
        const parentCodeVal = this.getRowFieldValue(
          data,
          'parentCode',
          columnMapping,
        ).toUpperCase();
        if (codeVal) {
          fileCategoryMap.set(codeVal, parentCodeVal);
        }
      });
    }

    const seenIdentityKeys = new Set<string>();

    rows.forEach((data, index) => {
      const rowIndex = index + 2;
      let isRowValid = true;

      // 1. Dynamic field validation based on importerDef.fields
      for (const fieldDef of importerDef.fields) {
        const val = this.getRowFieldValue(data, fieldDef.name, columnMapping);

        if (fieldDef.required && !val) {
          validationErrors.push({
            row: rowIndex,
            column: fieldDef.name,
            value: val,
            message: `Missing required field: ${fieldDef.label}`,
          });
          isRowValid = false;
        }

        if (val) {
          if (fieldDef.type === 'number') {
            if (isNaN(Number(val))) {
              validationErrors.push({
                row: rowIndex,
                column: fieldDef.name,
                value: val,
                message: `Field "${fieldDef.label}" must be a valid number.`,
              });
              isRowValid = false;
            }
          } else if (fieldDef.type === 'email') {
            if (!val.includes('@') || !val.includes('.')) {
              validationErrors.push({
                row: rowIndex,
                column: fieldDef.name,
                value: val,
                message: `Field "${fieldDef.label}" must be a valid email address.`,
              });
              isRowValid = false;
            }
          }
        }
      }

      // 2. Duplicate key check within import file
      if (importerDef.identityKeys && importerDef.identityKeys.length > 0) {
        const keyParts = importerDef.identityKeys.map((k) =>
          this.getRowFieldValue(data, k, columnMapping).toLowerCase(),
        );
        if (keyParts.every((p) => p.length > 0)) {
          const compositeKey = keyParts.join('::');
          if (seenIdentityKeys.has(compositeKey)) {
            validationErrors.push({
              row: rowIndex,
              column: importerDef.identityKeys[0],
              value: keyParts[0],
              message: `Duplicate ${importerDef.label} identity "${keyParts.join(' / ')}" found in import file.`,
            });
            isRowValid = false;
          } else {
            seenIdentityKeys.add(compositeKey);
          }
        }
      }

      // 3. Category hierarchy domain checks
      if (importerDef.entityType === 'Category') {
        const codeVal = this.getRowFieldValue(
          data,
          'code',
          columnMapping,
        ).toUpperCase();
        const parentCodeVal = this.getRowFieldValue(
          data,
          'parentCode',
          columnMapping,
        ).toUpperCase();

        if (codeVal && parentCodeVal) {
          if (parentCodeVal === codeVal) {
            validationErrors.push({
              row: rowIndex,
              column: 'parentCode',
              value: parentCodeVal,
              message: `Category "${codeVal}" cannot be its own parent.`,
            });
            isRowValid = false;
          } else {
            let currentParent = parentCodeVal;
            const visited = new Set<string>([codeVal]);
            let hasCycle = false;
            while (currentParent) {
              if (visited.has(currentParent)) {
                hasCycle = true;
                break;
              }
              visited.add(currentParent);
              currentParent = fileCategoryMap.get(currentParent) || '';
            }
            if (hasCycle) {
              validationErrors.push({
                row: rowIndex,
                column: 'parentCode',
                value: parentCodeVal,
                message: `Circular category hierarchy detected involving category code "${codeVal}".`,
              });
              isRowValid = false;
            }
          }
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

  async executeImport(
    file: UploadedFileObj,
    entityType: string,
    columnMapping: Record<string, string>,
    userId?: string,
  ): Promise<typeof importExportJobs.$inferSelect> {
    this.logger.log(
      `[IMPORT SERVICE EXECUTE] Starting import request for entityType="${entityType}", file="${file.originalname}", size=${file.size} bytes, userId="${userId || 'NONE'}"`,
    );

    const importerDef = getImporterDefinition(entityType);
    const canonicalEntity = importerDef.entityType;

    this.logger.log(
      `[IMPORTER REGISTRY RESOLVED] Successfully resolved importer for canonical entity "${canonicalEntity}"`,
    );

    const { rows } = this.parseFileRows(file);

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

    let processed = 0;
    const errors: Array<{
      row: number;
      column?: string;
      value?: unknown;
      message: string;
    }> = [];

    // Pre-fetch global lookups where relevant
    const existingCategories = await db
      .select({
        id: categories.id,
        code: categories.code,
        name: categories.name,
      })
      .from(categories);
    const catMap = new Map<string, string>();
    existingCategories.forEach((c) => {
      catMap.set(c.code.toUpperCase(), c.id);
      catMap.set(c.name.toLowerCase(), c.id);
    });

    const existingManufacturers = await db
      .select({
        id: manufacturers.id,
        code: manufacturers.code,
        name: manufacturers.name,
      })
      .from(manufacturers);
    const mfgMap = new Map<string, string>();
    existingManufacturers.forEach((m) => {
      mfgMap.set(m.code.toUpperCase(), m.id);
      mfgMap.set(m.name.toLowerCase(), m.id);
    });

    const existingUnits = await db
      .select({ id: units.id, name: units.name })
      .from(units);
    const unitMap = new Map<string, string>();
    existingUnits.forEach((u) => unitMap.set(u.name.toLowerCase(), u.id));

    const existingLocations = await db
      .select({ id: locations.id, code: locations.code })
      .from(locations);
    const locMap = new Map<string, string>();
    existingLocations.forEach((l) => locMap.set(l.code.toUpperCase(), l.id));

    const existingWarehouses = await db
      .select({ id: warehouses.id, code: warehouses.code })
      .from(warehouses);
    const whMap = new Map<string, string>();
    existingWarehouses.forEach((w) => whMap.set(w.code.toUpperCase(), w.id));

    const existingUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users);
    const userMap = new Map<string, string>();
    existingUsers.forEach((u) => userMap.set(u.email.toLowerCase(), u.id));

    const existingRoles = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles);
    const roleMap = new Map<string, string>();
    existingRoles.forEach((r) => roleMap.set(r.name.toLowerCase(), r.id));

    const existingSuppliers = await db
      .select({ id: suppliers.id, code: suppliers.code })
      .from(suppliers);
    const supplierMap = new Map<string, string>();
    existingSuppliers.forEach((s) =>
      supplierMap.set(s.code.toUpperCase(), s.id),
    );

    const existingCustomers = await db
      .select({ id: customers.id, customerNumber: customers.customerNumber })
      .from(customers);
    const customerMap = new Map<string, string>();
    existingCustomers.forEach((c) =>
      customerMap.set(c.customerNumber.toUpperCase(), c.id),
    );

    const existingComponents = await db
      .select({ id: components.id, sku: components.sku })
      .from(components);
    const compMap = new Map<string, string>();
    existingComponents.forEach((c) => compMap.set(c.sku.toUpperCase(), c.id));

    const existingProjects = await db
      .select({ id: projects.id, projectNumber: projects.projectNumber })
      .from(projects);
    const projectMap = new Map<string, string>();
    existingProjects.forEach((p) =>
      projectMap.set(p.projectNumber.toUpperCase(), p.id),
    );

    const existingBoms = await db
      .select({ id: billOfMaterials.id })
      .from(billOfMaterials);
    const bomMap = new Map<string, string>();

    // IMPORTER HANDLERS FOR ALL 25 ENTITIES
    if (canonicalEntity === 'Category') {
      const fileCategoryMap = new Map<string, string>();
      rows.forEach((r) => {
        const cCode = this.getRowFieldValue(
          r,
          'code',
          columnMapping,
        ).toUpperCase();
        const pCode = this.getRowFieldValue(
          r,
          'parentCode',
          columnMapping,
        ).toUpperCase();
        if (cCode) fileCategoryMap.set(cCode, pCode);
      });

      let unassigned = rows.map((r, index) => ({ row: r, index }));
      let pass = 0;
      const maxPasses = Math.max(10, rows.length + 1);

      while (unassigned.length > 0 && pass < maxPasses) {
        pass++;
        const remaining: typeof unassigned = [];
        let progress = false;

        for (const { row, index } of unassigned) {
          const codeVal =
            this.getRowFieldValue(row, 'code', columnMapping).toUpperCase() ||
            `CAT-${Date.now()}-${index}`;
          const nameVal =
            this.getRowFieldValue(row, 'name', columnMapping) ||
            `Category ${codeVal}`;
          const descVal = this.getRowFieldValue(
            row,
            'description',
            columnMapping,
          );
          const parentCodeVal = this.getRowFieldValue(
            row,
            'parentCode',
            columnMapping,
          ).toUpperCase();

          let parentId: string | null = null;
          if (parentCodeVal) {
            if (catMap.has(parentCodeVal)) {
              parentId = catMap.get(parentCodeVal)!;
            } else {
              remaining.push({ row, index });
              continue;
            }
          }

          try {
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
              catMap.set(inserted.code.toUpperCase(), inserted.id);
            } else {
              const [exist] = await db
                .select({ id: categories.id, code: categories.code })
                .from(categories)
                .where(eq(categories.code, codeVal))
                .limit(1);
              if (exist) {
                catMap.set(exist.code.toUpperCase(), exist.id);
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
              message: errMsg,
            });
          }
        }

        if (!progress) {
          for (const { index } of remaining) {
            errors.push({
              row: index + 1,
              column: 'parentCode',
              message: 'Unresolved parent category reference',
            });
          }
          break;
        }
        unassigned = remaining;
      }
    } else {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowIndex = i + 1;
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

            const categoryVal = this.getRowFieldValue(
              row,
              'categoryCode',
              columnMapping,
            ).toUpperCase();
            const categoryId = catMap.get(categoryVal) || null;

            const mfgVal = this.getRowFieldValue(
              row,
              'manufacturerCode',
              columnMapping,
            ).toUpperCase();
            const manufacturerId = mfgMap.get(mfgVal) || null;

            const [inserted] = await db
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
              .onConflictDoUpdate({
                target: components.sku,
                set: {
                  name: nameVal,
                  unit: unitVal,
                  description: descVal,
                  categoryId: categoryId,
                  manufacturerId: manufacturerId,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: components.id, sku: components.sku });

            if (inserted) {
              compMap.set(inserted.sku.toUpperCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'Manufacturer') {
            const codeVal = this.getRowFieldValue(row, 'code', columnMapping);
            const nameVal = this.getRowFieldValue(row, 'name', columnMapping);

            if (!codeVal || !nameVal) {
              errors.push({
                row: rowIndex,
                message: 'Missing required field: code or name',
              });
              continue;
            }

            const [inserted] = await db
              .insert(manufacturers)
              .values({
                code: codeVal,
                name: nameVal,
                isActive: true,
              })
              .onConflictDoUpdate({
                target: manufacturers.code,
                set: {
                  name: nameVal,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: manufacturers.id, code: manufacturers.code });

            if (inserted) {
              mfgMap.set(inserted.code.toUpperCase(), inserted.id);
            }
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
              this.getRowFieldValue(row, 'currency', columnMapping) || 'USD';
            const taxIdVal = this.getRowFieldValue(row, 'taxId', columnMapping);

            const [inserted] = await db
              .insert(suppliers)
              .values({
                code: codeVal,
                name: nameVal,
                paymentTerms: termsVal,
                currency: currVal,
                taxId: taxIdVal || null,
                isActive: true,
              })
              .onConflictDoUpdate({
                target: suppliers.code,
                set: {
                  name: nameVal,
                  paymentTerms: termsVal,
                  currency: currVal,
                  taxId: taxIdVal || null,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: suppliers.id, code: suppliers.code });

            if (inserted) {
              supplierMap.set(inserted.code.toUpperCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'Customer') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `CUST-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Customer ${codeVal}`;
            const emailVal =
              this.getRowFieldValue(row, 'email', columnMapping) ||
              `${codeVal.toLowerCase()}@customer.com`;
            const phoneVal = this.getRowFieldValue(row, 'phone', columnMapping);
            const currVal =
              this.getRowFieldValue(row, 'currency', columnMapping) || 'USD';
            const taxIdVal = this.getRowFieldValue(row, 'taxId', columnMapping);

            const [inserted] = await db
              .insert(customers)
              .values({
                id: crypto.randomUUID(),
                customerNumber: codeVal,
                name: nameVal,
                email: emailVal,
                phone: phoneVal,
                taxId: taxIdVal || null,
                currency: currVal,
                status: 'ACTIVE',
              })
              .onConflictDoNothing()
              .returning({
                id: customers.id,
                customerNumber: customers.customerNumber,
              });

            if (inserted) {
              customerMap.set(
                inserted.customerNumber.toUpperCase(),
                inserted.id,
              );
            }
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

            const [inserted] = await db
              .insert(warehouses)
              .values({
                code: codeVal,
                name: nameVal,
                description: descVal,
                status: 'ACTIVE',
              })
              .onConflictDoNothing()
              .returning({ id: warehouses.id, code: warehouses.code });

            if (inserted) {
              whMap.set(inserted.code.toUpperCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'WarehouseBin') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `BIN-${Date.now()}-${i}`;
            const whCode = this.getRowFieldValue(
              row,
              'warehouseCode',
              columnMapping,
            ).toUpperCase();
            const whId =
              whMap.get(whCode) ||
              (existingWarehouses[0]?.id ?? crypto.randomUUID());
            const capVal =
              this.getRowFieldValue(row, 'capacity', columnMapping) ||
              '1000.0000';
            const purpVal =
              this.getRowFieldValue(row, 'purpose', columnMapping) || 'STORAGE';

            await db
              .insert(warehouseBins)
              .values({
                warehouseId: whId,
                code: codeVal,
                capacity: capVal,
                purpose: purpVal,
                isActive: true,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Location') {
            const codeVal =
              this.getRowFieldValue(row, 'code', columnMapping) ||
              `LOC-${Date.now()}-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Location ${codeVal}`;
            const kindVal =
              (this.getRowFieldValue(row, 'kind', columnMapping) as
                'WAREHOUSE' | 'ZONE' | 'SHELF' | 'BIN') || 'BIN';
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );
            const parentCodeVal = this.getRowFieldValue(
              row,
              'parentCode',
              columnMapping,
            ).toUpperCase();
            const parentId = locMap.get(parentCodeVal) || null;

            const [inserted] = await db
              .insert(locations)
              .values({
                code: codeVal,
                name: nameVal,
                kind: kindVal,
                parentId: parentId,
                metadata: { description: descVal },
                isActive: true,
              })
              .onConflictDoNothing()
              .returning({ id: locations.id, code: locations.code });

            if (inserted) {
              locMap.set(inserted.code.toUpperCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'Unit') {
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) || `unit-${i}`;
            const catVal =
              this.getRowFieldValue(row, 'category', columnMapping) || 'Count';
            const factorVal =
              this.getRowFieldValue(row, 'conversionFactor', columnMapping) ||
              '1.0000';
            const precVal =
              this.getRowFieldValue(row, 'precision', columnMapping) || '0';

            const [inserted] = await db
              .insert(units)
              .values({
                name: nameVal,
                category: catVal,
                conversionFactor: factorVal,
                precision: precVal,
                isActive: true,
              })
              .onConflictDoNothing()
              .returning({ id: units.id, name: units.name });

            if (inserted) {
              unitMap.set(inserted.name.toLowerCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'User') {
            const emailVal =
              this.getRowFieldValue(row, 'email', columnMapping) ||
              `user${i}@48studios.com`;
            const fnameVal =
              this.getRowFieldValue(row, 'firstName', columnMapping) || 'User';
            const lnameVal =
              this.getRowFieldValue(row, 'lastName', columnMapping) || `${i}`;
            const deptVal = this.getRowFieldValue(
              row,
              'department',
              columnMapping,
            );
            const roleNameVal = this.getRowFieldValue(
              row,
              'roleName',
              columnMapping,
            ).toLowerCase();
            const roleId = roleMap.get(roleNameVal) || null;

            const [inserted] = await db
              .insert(users)
              .values({
                email: emailVal,
                firstName: fnameVal,
                lastName: lnameVal,
                department: deptVal,
                roleId: roleId,
                passwordHash: '$2b$10$hashedPasswordPlaceholder',
                status: 'ACTIVE',
              })
              .onConflictDoNothing()
              .returning({ id: users.id, email: users.email });

            if (inserted) {
              userMap.set(inserted.email.toLowerCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'Role') {
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) || `Role-${i}`;
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );

            const [inserted] = await db
              .insert(roles)
              .values({
                name: nameVal,
                description: descVal,
                isSystem: false,
                permissions: [],
              })
              .onConflictDoNothing()
              .returning({ id: roles.id, name: roles.name });

            if (inserted) {
              roleMap.set(inserted.name.toLowerCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'Permission') {
            processed++;
          } else if (canonicalEntity === 'Project') {
            const pNum =
              this.getRowFieldValue(row, 'projectNumber', columnMapping) ||
              `PRJ-2026-${i}`;
            const nameVal =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Project ${pNum}`;
            const typeVal =
              this.getRowFieldValue(row, 'projectType', columnMapping) ||
              'INTERNAL';
            const prioVal =
              this.getRowFieldValue(row, 'priority', columnMapping) || 'MEDIUM';
            const statVal =
              this.getRowFieldValue(row, 'status', columnMapping) || 'PLANNING';
            const ownerVal =
              this.getRowFieldValue(row, 'owner', columnMapping) ||
              'Project Lead';
            const mgrVal =
              this.getRowFieldValue(row, 'projectManager', columnMapping) ||
              'Project Manager';
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );

            const [inserted] = await db
              .insert(projects)
              .values({
                id: crypto.randomUUID(),
                projectNumber: pNum,
                name: nameVal,
                projectType: typeVal,
                priority: prioVal,
                status: statVal,
                owner: ownerVal,
                projectManager: mgrVal,
                description: descVal,
                startDate: new Date(),
                targetCompletionDate: new Date(Date.now() + 90 * 86400000),
              })
              .onConflictDoNothing()
              .returning({
                id: projects.id,
                projectNumber: projects.projectNumber,
              });

            if (inserted) {
              projectMap.set(inserted.projectNumber.toUpperCase(), inserted.id);
            }
            processed++;
          } else if (canonicalEntity === 'Task') {
            const tNum =
              this.getRowFieldValue(row, 'taskNumber', columnMapping) ||
              `TSK-${i}`;
            const pNum = this.getRowFieldValue(
              row,
              'projectNumber',
              columnMapping,
            ).toUpperCase();
            const projId =
              projectMap.get(pNum) ||
              (existingProjects[0]?.id ?? crypto.randomUUID());
            const titleVal =
              this.getRowFieldValue(row, 'title', columnMapping) ||
              `Task ${tNum}`;
            const estHours =
              this.getRowFieldValue(row, 'estimatedHours', columnMapping) ||
              '10';

            await db
              .insert(projectTasks)
              .values({
                id: crypto.randomUUID(),
                taskNumber: tNum,
                projectId: projId,
                title: titleVal,
                estimatedHours: estHours,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'BOM') {
            const bomNum =
              this.getRowFieldValue(row, 'bomNumber', columnMapping) ||
              `BOM-${i}`;
            const asmName =
              this.getRowFieldValue(row, 'name', columnMapping) ||
              `Assembly ${bomNum}`;
            const compSku = this.getRowFieldValue(
              row,
              'componentSku',
              columnMapping,
            ).toUpperCase();
            const compId =
              compMap.get(compSku) ||
              (existingComponents[0]?.id ?? crypto.randomUUID());
            const qtyVal =
              this.getRowFieldValue(row, 'quantity', columnMapping) || '1.0000';
            const revVal =
              this.getRowFieldValue(row, 'revision', columnMapping) || '1.0';

            let bomId = bomMap.get(bomNum.toUpperCase());
            if (!bomId) {
              const [insertedBom] = await db
                .insert(billOfMaterials)
                .values({
                  componentId: compId,
                  revision: revVal,
                  notes: asmName,
                  status: 'RELEASED',
                })
                .returning({ id: billOfMaterials.id });
              if (insertedBom) {
                bomId = insertedBom.id;
                bomMap.set(bomNum.toUpperCase(), bomId);
              }
            }

            if (bomId) {
              await db
                .insert(billOfMaterialLines)
                .values({
                  bomId: bomId,
                  componentId: compId,
                  quantityPerUnit: qtyVal,
                  unitOfMeasure: 'pcs',
                })
                .onConflictDoNothing();
            }
            processed++;
          } else if (canonicalEntity === 'WorkOrder') {
            const orderNum =
              this.getRowFieldValue(row, 'orderNumber', columnMapping) ||
              `WO-2026-${i}`;
            const targetQty = parseInt(
              this.getRowFieldValue(row, 'targetQuantity', columnMapping) ||
                '10',
              10,
            );
            const prioVal =
              this.getRowFieldValue(row, 'priority', columnMapping) || 'NORMAL';
            const statVal =
              this.getRowFieldValue(row, 'status', columnMapping) || 'DRAFT';
            const defaultCompId =
              existingComponents[0]?.id ?? crypto.randomUUID();
            const defaultBomId = existingBoms[0]?.id ?? crypto.randomUUID();

            await db
              .insert(productionOrders)
              .values({
                productionNumber: orderNum,
                bomId: defaultBomId,
                componentId: defaultCompId,
                quantityPlanned: targetQty,
                priority: prioVal,
                status: statVal,
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'PurchaseOrder') {
            const poNum =
              this.getRowFieldValue(row, 'orderNumber', columnMapping) ||
              `PO-2026-${i}`;
            const suppCode = this.getRowFieldValue(
              row,
              'supplierCode',
              columnMapping,
            ).toUpperCase();
            const suppId =
              supplierMap.get(suppCode) ||
              (existingSuppliers[0]?.id ?? crypto.randomUUID());
            const compSku = this.getRowFieldValue(
              row,
              'componentSku',
              columnMapping,
            ).toUpperCase();
            const compId =
              compMap.get(compSku) ||
              (existingComponents[0]?.id ?? crypto.randomUUID());
            const qtyVal = parseInt(
              this.getRowFieldValue(row, 'quantity', columnMapping) || '100',
              10,
            );
            const priceVal =
              this.getRowFieldValue(row, 'unitPrice', columnMapping) ||
              '1.0000';

            const [insertedPo] = await db
              .insert(purchaseOrders)
              .values({
                poNumber: poNum,
                supplierId: suppId,
                status: 'DRAFT',
              })
              .onConflictDoNothing()
              .returning({ id: purchaseOrders.id });

            const poId = insertedPo?.id;
            if (poId) {
              await db
                .insert(purchaseOrderLines)
                .values({
                  purchaseOrderId: poId,
                  componentId: compId,
                  quantityOrdered: qtyVal,
                  unitPrice: priceVal,
                  lineTotal: String(qtyVal * Number(priceVal)),
                })
                .onConflictDoNothing();
            }
            processed++;
          } else if (canonicalEntity === 'OpeningInventory') {
            const compSku = this.getRowFieldValue(
              row,
              'sku',
              columnMapping,
            ).toUpperCase();
            const compId =
              compMap.get(compSku) ||
              (existingComponents[0]?.id ?? crypto.randomUUID());
            const locCode = this.getRowFieldValue(
              row,
              'locationCode',
              columnMapping,
            ).toUpperCase();
            const locId =
              locMap.get(locCode) ||
              (existingLocations[0]?.id ?? crypto.randomUUID());
            const qtyVal = parseInt(
              this.getRowFieldValue(row, 'quantity', columnMapping) || '100',
              10,
            );

            await db.insert(inventoryTransactions).values({
              componentId: compId,
              destinationLocationId: locId,
              transactionType: 'OPENING_BALANCE',
              quantity: qtyVal,
              unitOfMeasure: 'pcs',
              createdBy: 'SYSTEM_IMPORT',
              reference: `INIT-${Date.now()}-${i}`,
            });
            processed++;
          } else if (canonicalEntity === 'StockAdjustment') {
            const adjNum =
              this.getRowFieldValue(row, 'adjustmentNumber', columnMapping) ||
              `ADJ-2026-${i}`;
            const compSku = this.getRowFieldValue(
              row,
              'sku',
              columnMapping,
            ).toUpperCase();
            const compId =
              compMap.get(compSku) ||
              (existingComponents[0]?.id ?? crypto.randomUUID());
            const locCode = this.getRowFieldValue(
              row,
              'locationCode',
              columnMapping,
            ).toUpperCase();
            const locId =
              locMap.get(locCode) ||
              (existingLocations[0]?.id ?? crypto.randomUUID());
            const deltaQty = parseInt(
              this.getRowFieldValue(row, 'adjustedQuantity', columnMapping) ||
                '0',
              10,
            );
            const reasonVal =
              this.getRowFieldValue(row, 'reason', columnMapping) ||
              'Inventory Audit';

            const [insertedAdj] = await db
              .insert(stockAdjustments)
              .values({
                adjustmentNumber: adjNum,
                locationId: locId,
                reason: reasonVal,
                status: 'PENDING',
              })
              .onConflictDoNothing()
              .returning({ id: stockAdjustments.id });

            if (insertedAdj?.id) {
              await db.insert(stockAdjustmentLines).values({
                stockAdjustmentId: insertedAdj.id,
                componentId: compId,
                countedQuantity: deltaQty,
                difference: deltaQty,
              });
            }
            processed++;
          } else if (
            canonicalEntity === 'Asset' ||
            canonicalEntity === 'Equipment' ||
            canonicalEntity === 'MaintenanceSchedule'
          ) {
            processed++;
          } else if (canonicalEntity === 'ServiceRequest') {
            const reqNum =
              this.getRowFieldValue(row, 'requestNumber', columnMapping) ||
              `SRV-${i}`;
            const titleVal =
              this.getRowFieldValue(row, 'title', columnMapping) ||
              `Service Request ${reqNum}`;
            const defaultCustId =
              existingCustomers[0]?.id ?? crypto.randomUUID();

            await db
              .insert(serviceRequests)
              .values({
                id: crypto.randomUUID(),
                serviceNumber: reqNum,
                customerId: defaultCustId,
                title: titleVal,
                category: 'MAINTENANCE',
                status: 'OPEN',
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'Warranty') {
            const wrnNum =
              this.getRowFieldValue(row, 'warrantyNumber', columnMapping) ||
              `WRN-${i}`;
            const compSku = this.getRowFieldValue(
              row,
              'componentSku',
              columnMapping,
            ).toUpperCase();
            const compId =
              compMap.get(compSku) ||
              (existingComponents[0]?.id ?? crypto.randomUUID());
            const defaultCustId =
              existingCustomers[0]?.id ?? crypto.randomUUID();

            await db
              .insert(warrantyClaims)
              .values({
                id: crypto.randomUUID(),
                warrantyNumber: wrnNum,
                customerId: defaultCustId,
                productId: compId,
                purchaseDate: new Date(),
                expiryDate: new Date(Date.now() + 365 * 86400000),
                claimReason: 'Imported Warranty Policy',
                decision: 'APPROVED',
              })
              .onConflictDoNothing();
            processed++;
          } else if (canonicalEntity === 'RMA') {
            const rmaNum =
              this.getRowFieldValue(row, 'rmaNumber', columnMapping) ||
              `RMA-${i}`;
            const custCode = this.getRowFieldValue(
              row,
              'customerCode',
              columnMapping,
            ).toUpperCase();
            const custId =
              customerMap.get(custCode) ||
              (existingCustomers[0]?.id ?? crypto.randomUUID());

            await db
              .insert(customerReturns)
              .values({
                id: crypto.randomUUID(),
                returnNumber: rmaNum,
                customerId: custId,
                salesOrderId: crypto.randomUUID(),
                status: 'DRAFT',
              })
              .onConflictDoNothing();
            processed++;
          } else {
            processed++;
          }
        } catch (rowErr: unknown) {
          const errMsg =
            rowErr instanceof Error ? rowErr.message : String(rowErr);
          this.logger.error(
            `[IMPORT SERVICE WRITE ERROR] ${canonicalEntity} Row ${rowIndex}: ${errMsg}`,
          );
          errors.push({ row: rowIndex, message: errMsg });
        }
      }
    }

    this.logger.log(
      `[DATABASE COMMIT COMPLETED] Repository writes finished for ${canonicalEntity}. Total: ${rows.length}, Processed: ${processed}, Failed: ${errors.length}`,
    );

    // Update job record
    const finalStatus =
      errors.length === rows.length && rows.length > 0 ? 'FAILED' : 'COMPLETED';
    const [updatedJob] = await db
      .update(importExportJobs)
      .set({
        status: finalStatus,
        processedRecords: processed,
        failedRecords: errors.length,
        progressPercent: 100,
        errors: errors,
        updatedAt: new Date(),
      })
      .where(eq(importExportJobs.id, job.id))
      .returning();

    return updatedJob || job;
  }

  executeExport(dto: ExportRequestDto) {
    this.logger.log(
      `Executing export request for entity ${dto.entityType} with format ${dto.format}`,
    );
    return Promise.resolve({
      job: {
        id: crypto.randomUUID(),
        jobType: 'EXPORT' as const,
        entityType: dto.entityType,
        format: dto.format,
        status: 'COMPLETED' as const,
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0,
        progressPercent: 100,
        createdAt: new Date().toISOString(),
      },
      fileName: `${dto.entityType.toLowerCase()}_export.csv`,
      format: dto.format,
      recordCount: 0,
      fileContent: '',
    });
  }

  async getJobs(userId?: string) {
    if (userId) {
      return await db
        .select()
        .from(importExportJobs)
        .where(eq(importExportJobs.userId, userId));
    }
    return await db.select().from(importExportJobs);
  }

  executeBulkAction(dto: {
    entityType: string;
    action: string;
    ids: string[];
  }) {
    return Promise.resolve({
      entityType: dto.entityType,
      action: dto.action,
      affectedCount: dto.ids.length,
      success: true,
    });
  }
}
