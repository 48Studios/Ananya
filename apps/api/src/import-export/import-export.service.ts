import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
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
  maintenanceSchedules,
  systemSettings,
  goodsReceipts,
  salesOrders,
  quotations,
  crmLeads,
  cycleCounts,
  warehouseTransfers,
  attributeDefinitions,
} from '@ananya/database/schema';
import { eq, inArray, desc } from '@ananya/database/query';
import { resolveCurrency } from '../common/utils/currency-resolver';
import {
  ExportRequestDto,
  ExportResponseDto,
  ExportFormat,
  UploadedFileObj,
} from './dtos';
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
      } else if (importerDef.entityType === 'PurchaseOrder') {
        const qtyVal = Number(
          this.getRowFieldValue(data, 'quantity', columnMapping),
        );
        if (!isNaN(qtyVal) && qtyVal <= 0) {
          validationErrors.push({
            row: rowIndex,
            column: 'quantity',
            value: qtyVal,
            message: `Quantity ordered must be strictly greater than 0.`,
          });
          isRowValid = false;
        }

        const priceVal = Number(
          this.getRowFieldValue(data, 'unitPrice', columnMapping),
        );
        if (!isNaN(priceVal) && priceVal < 0) {
          validationErrors.push({
            row: rowIndex,
            column: 'unitPrice',
            value: priceVal,
            message: `Unit price must be non-negative.`,
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
      entityType: importerDef.entityType,
      label: importerDef.label,
      description: importerDef.description,
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
    const createdEntities: Array<{
      entityType: string;
      id: string;
      isSideEffect?: boolean;
    }> = [];
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
      .select({
        id: suppliers.id,
        code: suppliers.code,
        currency: suppliers.currency,
      })
      .from(suppliers);
    const supplierMap = new Map<string, { id: string; currency: string }>();
    existingSuppliers.forEach((s) =>
      supplierMap.set(s.code.toUpperCase(), { id: s.id, currency: s.currency }),
    );

    const [sysSettings] = await db.select().from(systemSettings);
    const orgCurrency = sysSettings?.baseCurrency;

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

    const existingPos = await db
      .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders);
    const poMap = new Map<string, string>();
    existingPos.forEach((p) => poMap.set(p.poNumber.toUpperCase(), p.id));

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
              createdEntities.push({ entityType: 'Category', id: inserted.id });
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
            const skuVal = (
              this.getRowFieldValue(row, 'sku', columnMapping) ||
              `SKU-${Date.now()}-${i}`
            )
              .trim()
              .toUpperCase();
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
              createdEntities.push({
                entityType: 'Component',
                id: inserted.id,
              });
            }
            processed++;
          } else if (canonicalEntity === 'AttributeDefinition') {
            const codeVal = this.getRowFieldValue(row, 'code', columnMapping)
              ?.toLowerCase()
              .replace(/[\s-]+/g, '_');
            const nameVal = this.getRowFieldValue(row, 'name', columnMapping);
            const typeVal = (
              this.getRowFieldValue(row, 'dataType', columnMapping) || 'TEXT'
            ).toUpperCase();
            const unitCatVal = this.getRowFieldValue(
              row,
              'unitCategory',
              columnMapping,
            );
            const defUnitVal = this.getRowFieldValue(
              row,
              'defaultUnit',
              columnMapping,
            );
            const descVal = this.getRowFieldValue(
              row,
              'description',
              columnMapping,
            );

            if (!codeVal || !nameVal) {
              errors.push({
                row: rowIndex,
                message: 'Missing required field: code or name',
              });
              continue;
            }

            const [inserted] = await db
              .insert(attributeDefinitions)
              .values({
                code: codeVal,
                name: nameVal,
                dataType: typeVal,
                unitCategory: unitCatVal || null,
                defaultUnit: defUnitVal || null,
                description: descVal || null,
                isActive: true,
              })
              .onConflictDoUpdate({
                target: attributeDefinitions.code,
                set: {
                  name: nameVal,
                  dataType: typeVal,
                  unitCategory: unitCatVal || null,
                  defaultUnit: defUnitVal || null,
                  description: descVal || null,
                  updatedAt: new Date(),
                },
              })
              .returning({
                id: attributeDefinitions.id,
                code: attributeDefinitions.code,
              });

            if (inserted) {
              createdEntities.push({
                entityType: 'AttributeDefinition',
                id: inserted.id,
              });
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
              createdEntities.push({
                entityType: 'Manufacturer',
                id: inserted.id,
              });
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
              this.getRowFieldValue(row, 'currency', columnMapping) || 'INR';
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
              .returning({
                id: suppliers.id,
                code: suppliers.code,
                currency: suppliers.currency,
              });

            if (inserted) {
              supplierMap.set(inserted.code.toUpperCase(), {
                id: inserted.id,
                currency: inserted.currency,
              });
              createdEntities.push({ entityType: 'Supplier', id: inserted.id });
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
            const rowCurr = this.getRowFieldValue(
              row,
              'currency',
              columnMapping,
            );
            const currVal = resolveCurrency({
              explicitCurrency: rowCurr,
              organizationCurrency: orgCurrency,
              fallbackCurrency: 'INR',
            });
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
              createdEntities.push({ entityType: 'Customer', id: inserted.id });
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
              createdEntities.push({
                entityType: 'Warehouse',
                id: inserted.id,
              });
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

            const [insertedBin] = await db
              .insert(warehouseBins)
              .values({
                warehouseId: whId,
                code: codeVal,
                capacity: capVal,
                purpose: purpVal,
                isActive: true,
              })
              .onConflictDoNothing()
              .returning({ id: warehouseBins.id });
            if (insertedBin) {
              createdEntities.push({
                entityType: 'WarehouseBin',
                id: insertedBin.id,
              });
            }
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
              createdEntities.push({ entityType: 'Location', id: inserted.id });
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
              createdEntities.push({ entityType: 'Unit', id: inserted.id });
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
              createdEntities.push({ entityType: 'User', id: inserted.id });
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
              createdEntities.push({ entityType: 'Role', id: inserted.id });
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
              createdEntities.push({ entityType: 'Project', id: inserted.id });
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

            const [insertedTask] = await db
              .insert(projectTasks)
              .values({
                id: crypto.randomUUID(),
                taskNumber: tNum,
                projectId: projId,
                title: titleVal,
                estimatedHours: estHours,
              })
              .onConflictDoNothing()
              .returning({ id: projectTasks.id });

            if (insertedTask) {
              createdEntities.push({
                entityType: 'ProjectTask',
                id: insertedTask.id,
              });
            }
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
            let compId = compMap.get(compSku);
            if (!compId && compSku) {
              const normalizedSku = compSku.toUpperCase();
              const [insertedComp] = await db
                .insert(components)
                .values({
                  sku: normalizedSku,
                  name: compSku,
                  unit: 'pcs',
                  description: 'Auto-created from BOM import',
                  isActive: true,
                })
                .onConflictDoUpdate({
                  target: components.sku,
                  set: {
                    updatedAt: new Date(),
                  },
                })
                .returning({ id: components.id, sku: components.sku });
              if (insertedComp) {
                compId = insertedComp.id;
                compMap.set(compSku, compId);
                compMap.set(insertedComp.sku.toUpperCase(), compId);
                createdEntities.push({
                  entityType: 'Component',
                  id: insertedComp.id,
                  isSideEffect: true,
                });
              }
            }
            if (!compId) {
              compId = existingComponents[0]?.id ?? crypto.randomUUID();
            }
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
                createdEntities.push({
                  entityType: 'BillOfMaterials',
                  id: insertedBom.id,
                });
              }
            }

            if (bomId) {
              const [insertedBomLine] = await db
                .insert(billOfMaterialLines)
                .values({
                  bomId: bomId,
                  componentId: compId,
                  quantityPerUnit: qtyVal,
                  unitOfMeasure: 'pcs',
                })
                .onConflictDoNothing()
                .returning({ id: billOfMaterialLines.id });
              if (insertedBomLine) {
                createdEntities.push({
                  entityType: 'BillOfMaterialsLine',
                  id: insertedBomLine.id,
                });
              }
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

            const [insertedWo] = await db
              .insert(productionOrders)
              .values({
                productionNumber: orderNum,
                bomId: defaultBomId,
                componentId: defaultCompId,
                quantityPlanned: targetQty,
                priority: prioVal,
                status: statVal,
              })
              .onConflictDoNothing()
              .returning({ id: productionOrders.id });
            if (insertedWo) {
              createdEntities.push({
                entityType: 'WorkOrder',
                id: insertedWo.id,
              });
            }
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
            const suppInfo = supplierMap.get(suppCode);
            const suppId = suppInfo?.id;
            if (!suppId) {
              errors.push({
                row: i + 1,
                column: 'supplierCode',
                value: suppCode,
                message: `Supplier with code "${suppCode}" not found in database repository.`,
              });
              continue;
            }

            const compNameVal = this.getRowFieldValue(
              row,
              'componentName',
              columnMapping,
            );
            const vpnVal = this.getRowFieldValue(
              row,
              'vendorPartNumber',
              columnMapping,
            );
            const compCatVal = this.getRowFieldValue(
              row,
              'componentCategory',
              columnMapping,
            )?.trim();
            const compMfgVal = this.getRowFieldValue(
              row,
              'componentManufacturer',
              columnMapping,
            )?.trim();

            let categoryId: string | undefined = undefined;
            if (compCatVal) {
              categoryId =
                catMap.get(compCatVal.toUpperCase()) ||
                catMap.get(compCatVal.toLowerCase());
              if (!categoryId) {
                const cleanCatCode =
                  compCatVal
                    .toUpperCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^A-Z0-9_-]/g, '')
                    .slice(0, 50) || `CAT-${Date.now()}`;
                const [newCat] = await db
                  .insert(categories)
                  .values({
                    code: cleanCatCode,
                    name: compCatVal,
                    isActive: true,
                  })
                  .onConflictDoUpdate({
                    target: categories.code,
                    set: { updatedAt: new Date() },
                  })
                  .returning({
                    id: categories.id,
                    code: categories.code,
                    name: categories.name,
                  });
                if (newCat) {
                  categoryId = newCat.id;
                  catMap.set(newCat.code.toUpperCase(), categoryId);
                  catMap.set(newCat.name.toLowerCase(), categoryId);
                  createdEntities.push({
                    entityType: 'Category',
                    id: newCat.id,
                    isSideEffect: true,
                  });
                }
              }
            }

            let manufacturerId: string | undefined = undefined;
            if (compMfgVal) {
              manufacturerId =
                mfgMap.get(compMfgVal.toUpperCase()) ||
                mfgMap.get(compMfgVal.toLowerCase());
              if (!manufacturerId) {
                const cleanMfgCode =
                  compMfgVal
                    .toUpperCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^A-Z0-9_-]/g, '')
                    .slice(0, 50) || `MFG-${Date.now()}`;
                const [newMfg] = await db
                  .insert(manufacturers)
                  .values({
                    code: cleanMfgCode,
                    name: compMfgVal,
                    isActive: true,
                  })
                  .onConflictDoUpdate({
                    target: manufacturers.code,
                    set: { updatedAt: new Date() },
                  })
                  .returning({
                    id: manufacturers.id,
                    code: manufacturers.code,
                    name: manufacturers.name,
                  });
                if (newMfg) {
                  manufacturerId = newMfg.id;
                  mfgMap.set(newMfg.code.toUpperCase(), manufacturerId);
                  mfgMap.set(newMfg.name.toLowerCase(), manufacturerId);
                  createdEntities.push({
                    entityType: 'Manufacturer',
                    id: newMfg.id,
                    isSideEffect: true,
                  });
                }
              }
            }

            const compSku = this.getRowFieldValue(
              row,
              'componentSku',
              columnMapping,
            ).toUpperCase();
            let compId = compMap.get(compSku);
            if (!compId && compSku) {
              const normalizedSku = compSku.toUpperCase();
              const componentName =
                compNameVal || (vpnVal ? `${compSku} (${vpnVal})` : compSku);
              const [insertedComp] = await db
                .insert(components)
                .values({
                  sku: normalizedSku,
                  name: componentName,
                  unit: 'pcs',
                  description: vpnVal
                    ? `Auto-created from PO import. Vendor part: ${vpnVal}`
                    : 'Auto-created from Purchase Order import',
                  categoryId: categoryId || null,
                  manufacturerId: manufacturerId || null,
                  isActive: true,
                })
                .onConflictDoUpdate({
                  target: components.sku,
                  set: {
                    ...(categoryId ? { categoryId } : {}),
                    ...(manufacturerId ? { manufacturerId } : {}),
                    updatedAt: new Date(),
                  },
                })
                .returning({ id: components.id, sku: components.sku });

              if (insertedComp) {
                compId = insertedComp.id;
                compMap.set(compSku, compId);
                compMap.set(insertedComp.sku.toUpperCase(), compId);
                createdEntities.push({
                  entityType: 'Component',
                  id: insertedComp.id,
                  isSideEffect: true,
                });
              }
            } else if (compId && (categoryId || manufacturerId)) {
              await db
                .update(components)
                .set({
                  ...(categoryId ? { categoryId } : {}),
                  ...(manufacturerId ? { manufacturerId } : {}),
                  updatedAt: new Date(),
                })
                .where(eq(components.id, compId));
            }

            if (!compId) {
              errors.push({
                row: i + 1,
                column: 'componentSku',
                value: compSku,
                message: `Failed to resolve or create component with SKU "${compSku}".`,
              });
              continue;
            }

            const qtyVal = parseInt(
              this.getRowFieldValue(row, 'quantity', columnMapping) || '100',
              10,
            );
            const priceVal =
              this.getRowFieldValue(row, 'unitPrice', columnMapping) ||
              '1.0000';
            const taxVal =
              this.getRowFieldValue(row, 'taxRate', columnMapping) || '0.00';
            const rowCurr = this.getRowFieldValue(
              row,
              'currency',
              columnMapping,
            );
            const currVal = resolveCurrency({
              explicitCurrency: rowCurr,
              organizationCurrency: orgCurrency,
              fallbackCurrency: suppInfo?.currency || 'INR',
            });
            const statusVal =
              this.getRowFieldValue(row, 'status', columnMapping) || 'DRAFT';
            const notesVal = this.getRowFieldValue(row, 'notes', columnMapping);

            let poId = poMap.get(poNum.toUpperCase());
            if (!poId) {
              const [insertedPo] = await db
                .insert(purchaseOrders)
                .values({
                  poNumber: poNum,
                  supplierId: suppId,
                  status: statusVal,
                  currency: currVal,
                  notes: notesVal || null,
                })
                .onConflictDoNothing()
                .returning({ id: purchaseOrders.id });

              if (insertedPo) {
                poId = insertedPo.id;
                poMap.set(poNum.toUpperCase(), poId);
                createdEntities.push({
                  entityType: 'PurchaseOrder',
                  id: insertedPo.id,
                });
              } else {
                const [existPo] = await db
                  .select({ id: purchaseOrders.id })
                  .from(purchaseOrders)
                  .where(eq(purchaseOrders.poNumber, poNum))
                  .limit(1);
                if (existPo) {
                  poId = existPo.id;
                  poMap.set(poNum.toUpperCase(), poId);
                }
              }
            }

            if (poId) {
              const lineTot = String((qtyVal * Number(priceVal)).toFixed(4));
              const [insertedLine] = await db
                .insert(purchaseOrderLines)
                .values({
                  purchaseOrderId: poId,
                  componentId: compId,
                  vendorPartNumber: vpnVal || null,
                  quantityOrdered: qtyVal,
                  unitPrice: priceVal,
                  taxRate: taxVal,
                  lineTotal: lineTot,
                })
                .onConflictDoNothing()
                .returning({ id: purchaseOrderLines.id });

              if (insertedLine) {
                createdEntities.push({
                  entityType: 'PurchaseOrderLine',
                  id: insertedLine.id,
                });
              }
            }
            processed++;
          } else if (canonicalEntity === 'OpeningInventory') {
            const compSku = this.getRowFieldValue(
              row,
              'sku',
              columnMapping,
            ).toUpperCase();
            let compId = compMap.get(compSku);
            if (!compId && compSku) {
              const normalizedSku = compSku.toUpperCase();
              const [insertedComp] = await db
                .insert(components)
                .values({
                  sku: normalizedSku,
                  name: compSku,
                  unit: 'pcs',
                  description: 'Auto-created from Opening Inventory import',
                  isActive: true,
                })
                .onConflictDoUpdate({
                  target: components.sku,
                  set: {
                    updatedAt: new Date(),
                  },
                })
                .returning({ id: components.id, sku: components.sku });
              if (insertedComp) {
                compId = insertedComp.id;
                compMap.set(compSku, compId);
                compMap.set(insertedComp.sku.toUpperCase(), compId);
                createdEntities.push({
                  entityType: 'Component',
                  id: insertedComp.id,
                  isSideEffect: true,
                });
              }
            }
            if (!compId) {
              compId = existingComponents[0]?.id ?? crypto.randomUUID();
            }
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

            const [insertedTx] = await db
              .insert(inventoryTransactions)
              .values({
                componentId: compId,
                destinationLocationId: locId,
                transactionType: 'OPENING_BALANCE',
                quantity: qtyVal,
                unitOfMeasure: 'pcs',
                createdBy: 'SYSTEM_IMPORT',
                reference: `INIT-${Date.now()}-${i}`,
              })
              .returning({ id: inventoryTransactions.id });

            if (insertedTx) {
              createdEntities.push({
                entityType: 'InventoryTransaction',
                id: insertedTx.id,
              });
            }
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
            let compId = compMap.get(compSku);
            if (!compId && compSku) {
              const normalizedSku = compSku.toUpperCase();
              const [insertedComp] = await db
                .insert(components)
                .values({
                  sku: normalizedSku,
                  name: compSku,
                  unit: 'pcs',
                  description: 'Auto-created from Stock Adjustment import',
                  isActive: true,
                })
                .onConflictDoUpdate({
                  target: components.sku,
                  set: {
                    updatedAt: new Date(),
                  },
                })
                .returning({ id: components.id, sku: components.sku });
              if (insertedComp) {
                compId = insertedComp.id;
                compMap.set(compSku, compId);
                compMap.set(insertedComp.sku.toUpperCase(), compId);
                createdEntities.push({
                  entityType: 'Component',
                  id: insertedComp.id,
                  isSideEffect: true,
                });
              }
            }
            if (!compId) {
              compId = existingComponents[0]?.id ?? crypto.randomUUID();
            }
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
              createdEntities.push({
                entityType: 'StockAdjustment',
                id: insertedAdj.id,
              });

              const [insertedLine] = await db
                .insert(stockAdjustmentLines)
                .values({
                  stockAdjustmentId: insertedAdj.id,
                  componentId: compId,
                  countedQuantity: deltaQty,
                  difference: deltaQty,
                })
                .returning({ id: stockAdjustmentLines.id });

              if (insertedLine) {
                createdEntities.push({
                  entityType: 'StockAdjustmentLine',
                  id: insertedLine.id,
                });
              }
            }
            processed++;
          } else if (canonicalEntity === 'Asset') {
            processed++;
          } else if (canonicalEntity === 'Equipment') {
            processed++;
          } else if (canonicalEntity === 'MaintenanceSchedule') {
            const mntNum =
              this.getRowFieldValue(row, 'scheduleNumber', columnMapping) ||
              `MNT-${Date.now()}-${i}`;
            const eqpNum = this.getRowFieldValue(
              row,
              'equipmentNumber',
              columnMapping,
            );
            const titleVal =
              this.getRowFieldValue(row, 'title', columnMapping) ||
              `Maintenance Routine ${mntNum}`;
            const freqDays =
              this.getRowFieldValue(row, 'frequencyDays', columnMapping) ||
              '30';
            const dueDateStr = this.getRowFieldValue(
              row,
              'nextDueDate',
              columnMapping,
            );
            const defaultCustId =
              existingCustomers[0]?.id ?? crypto.randomUUID();

            const [insertedMnt] = await db
              .insert(maintenanceSchedules)
              .values({
                id: crypto.randomUUID(),
                scheduleNumber: mntNum,
                customerId: defaultCustId,
                assetName: eqpNum || titleVal,
                frequency: `${freqDays} DAYS`,
                nextVisitDate: dueDateStr
                  ? new Date(dueDateStr)
                  : new Date(Date.now() + 30 * 86400000),
                status: 'ACTIVE',
                notes: titleVal,
              })
              .onConflictDoNothing()
              .returning({ id: maintenanceSchedules.id });

            if (insertedMnt) {
              createdEntities.push({
                entityType: 'MaintenanceSchedule',
                id: insertedMnt.id,
              });
            }
            processed++;
          } else if (canonicalEntity === 'ServiceRequest') {
            const reqNum =
              this.getRowFieldValue(row, 'requestNumber', columnMapping) ||
              `SRV-${i}`;
            const eqpNum = this.getRowFieldValue(
              row,
              'equipmentNumber',
              columnMapping,
            );
            const titleVal =
              this.getRowFieldValue(row, 'title', columnMapping) ||
              `Service Request ${reqNum}`;
            const prioVal =
              this.getRowFieldValue(row, 'priority', columnMapping) || 'MEDIUM';
            const statVal =
              this.getRowFieldValue(row, 'status', columnMapping) || 'OPEN';
            const defaultCustId =
              existingCustomers[0]?.id ?? crypto.randomUUID();

            const [insertedSrv] = await db
              .insert(serviceRequests)
              .values({
                id: crypto.randomUUID(),
                serviceNumber: reqNum,
                customerId: defaultCustId,
                title: titleVal,
                priority: prioVal,
                category: 'MAINTENANCE',
                status: statVal,
                description: eqpNum ? `Equipment Tag: ${eqpNum}` : null,
              })
              .onConflictDoNothing()
              .returning({ id: serviceRequests.id });

            if (insertedSrv) {
              createdEntities.push({
                entityType: 'ServiceRequest',
                id: insertedSrv.id,
              });
            }
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
            const suppCode = this.getRowFieldValue(
              row,
              'supplierCode',
              columnMapping,
            ).toUpperCase();
            const startDateStr = this.getRowFieldValue(
              row,
              'startDate',
              columnMapping,
            );
            const endDateStr = this.getRowFieldValue(
              row,
              'endDate',
              columnMapping,
            );
            const defaultCustId =
              existingCustomers[0]?.id ?? crypto.randomUUID();

            const startDate = startDateStr
              ? new Date(startDateStr)
              : new Date();
            const endDate = endDateStr
              ? new Date(endDateStr)
              : new Date(Date.now() + 365 * 86400000);

            const [insertedWrn] = await db
              .insert(warrantyClaims)
              .values({
                id: crypto.randomUUID(),
                warrantyNumber: wrnNum,
                customerId: defaultCustId,
                productId: compId,
                purchaseDate: startDate,
                expiryDate: endDate,
                claimReason: suppCode
                  ? `Warranting Supplier Code: ${suppCode}`
                  : 'Imported Warranty Policy',
                decision: 'APPROVED',
              })
              .onConflictDoNothing()
              .returning({ id: warrantyClaims.id });

            if (insertedWrn) {
              createdEntities.push({
                entityType: 'WarrantyClaim',
                id: insertedWrn.id,
              });
            }
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
            const compSku = this.getRowFieldValue(
              row,
              'componentSku',
              columnMapping,
            );
            const qtyVal = this.getRowFieldValue(
              row,
              'quantity',
              columnMapping,
            );
            const reasonVal = this.getRowFieldValue(
              row,
              'reason',
              columnMapping,
            );

            const [insertedRma] = await db
              .insert(customerReturns)
              .values({
                id: crypto.randomUUID(),
                returnNumber: rmaNum,
                customerId: custId,
                salesOrderId: crypto.randomUUID(),
                status: 'DRAFT',
                notes:
                  reasonVal ||
                  (compSku ? `Component: ${compSku}, Qty: ${qtyVal}` : null),
              })
              .onConflictDoNothing()
              .returning({ id: customerReturns.id });

            if (insertedRma) {
              createdEntities.push({
                entityType: 'CustomerReturn',
                id: insertedRma.id,
              });
            }
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
      `[DATABASE COMMIT COMPLETED] Repository writes finished for ${canonicalEntity}. Total: ${rows.length}, Processed: ${processed}, Failed: ${errors.length}, Created Entities Tracked: ${createdEntities.length}`,
    );

    // For PurchaseOrder imports: finalize subtotal, taxTotal, and grandTotal on purchaseOrders table
    if (canonicalEntity === 'PurchaseOrder' && poMap.size > 0) {
      for (const poId of poMap.values()) {
        const poLines = await db
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.purchaseOrderId, poId));

        let subtotal = 0;
        let taxTotal = 0;
        for (const pl of poLines) {
          const base =
            (parseFloat(pl.unitPrice) || 0) * (pl.quantityOrdered || 0);
          const tax = base * ((parseFloat(pl.taxRate) || 0) / 100);
          subtotal += base;
          taxTotal += tax;
        }
        const grandTotal = subtotal + taxTotal;

        await db
          .update(purchaseOrders)
          .set({
            subtotal: subtotal.toFixed(4),
            taxTotal: taxTotal.toFixed(4),
            grandTotal: grandTotal.toFixed(4),
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrders.id, poId));
      }
    }

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
        createdEntities: createdEntities,
        updatedAt: new Date(),
      })
      .where(eq(importExportJobs.id, job.id))
      .returning();

    return updatedJob || job;
  }

  async reverseImport(id: string, userId?: string) {
    const job = await this.getJob(id);

    if (job.status === 'REVERSED') {
      throw new BadRequestException(
        'This import job has already been reversed.',
      );
    }

    if (job.jobType !== 'IMPORT') {
      throw new BadRequestException('Only IMPORT jobs can be reversed.');
    }

    const createdEntities =
      (job.createdEntities as Array<{
        entityType: string;
        id: string;
        isSideEffect?: boolean;
      }>) || [];

    if (createdEntities.length === 0) {
      const [updatedJob] = await db
        .update(importExportJobs)
        .set({
          status: 'REVERSED',
          updatedAt: new Date(),
        })
        .where(eq(importExportJobs.id, job.id))
        .returning();

      return {
        success: true,
        message: 'Import job marked as reversed (no created records found).',
        revertedCount: 0,
        job: updatedJob || job,
      };
    }

    const byType: Record<string, string[]> = {};
    for (const item of createdEntities) {
      if (!byType[item.entityType]) {
        byType[item.entityType] = [];
      }
      byType[item.entityType]!.push(item.id);
    }

    this.logger.log(
      `[IMPORT REVERSE] Reversing import job "${id}" (${job.entityType}) by user "${userId || 'system'}" with ${createdEntities.length} created entities across types: ${Object.keys(byType).join(', ')}`,
    );

    // Reverse/Delete in strict reverse topological dependency order
    if (byType['PurchaseOrderLine']?.length) {
      await db
        .delete(purchaseOrderLines)
        .where(inArray(purchaseOrderLines.id, byType['PurchaseOrderLine']));
    }
    if (byType['PurchaseOrder']?.length) {
      await db
        .delete(purchaseOrders)
        .where(inArray(purchaseOrders.id, byType['PurchaseOrder']));
    }
    if (byType['BillOfMaterialsLine']?.length) {
      await db
        .delete(billOfMaterialLines)
        .where(inArray(billOfMaterialLines.id, byType['BillOfMaterialsLine']));
    }
    if (byType['BillOfMaterials']?.length) {
      await db
        .delete(billOfMaterials)
        .where(inArray(billOfMaterials.id, byType['BillOfMaterials']));
    }
    if (byType['WorkOrder']?.length) {
      await db
        .delete(productionOrders)
        .where(inArray(productionOrders.id, byType['WorkOrder']));
    }
    if (byType['StockAdjustmentLine']?.length) {
      await db
        .delete(stockAdjustmentLines)
        .where(inArray(stockAdjustmentLines.id, byType['StockAdjustmentLine']));
    }
    if (byType['StockAdjustment']?.length) {
      await db
        .delete(stockAdjustments)
        .where(inArray(stockAdjustments.id, byType['StockAdjustment']));
    }
    if (byType['InventoryTransaction']?.length) {
      await db
        .delete(inventoryTransactions)
        .where(
          inArray(inventoryTransactions.id, byType['InventoryTransaction']),
        );
    }
    if (byType['ProjectTask']?.length) {
      await db
        .delete(projectTasks)
        .where(inArray(projectTasks.id, byType['ProjectTask']));
    }
    if (byType['Project']?.length) {
      await db.delete(projects).where(inArray(projects.id, byType['Project']));
    }
    if (byType['ServiceRequest']?.length) {
      await db
        .delete(serviceRequests)
        .where(inArray(serviceRequests.id, byType['ServiceRequest']));
    }
    if (byType['WarrantyClaim']?.length) {
      await db
        .delete(warrantyClaims)
        .where(inArray(warrantyClaims.id, byType['WarrantyClaim']));
    }
    if (byType['CustomerReturn']?.length) {
      await db
        .delete(customerReturns)
        .where(inArray(customerReturns.id, byType['CustomerReturn']));
    }
    if (byType['MaintenanceSchedule']?.length) {
      await db
        .delete(maintenanceSchedules)
        .where(inArray(maintenanceSchedules.id, byType['MaintenanceSchedule']));
    }
    if (byType['Component']?.length) {
      await db
        .delete(components)
        .where(inArray(components.id, byType['Component']));
    }
    if (byType['Customer']?.length) {
      await db
        .delete(customers)
        .where(inArray(customers.id, byType['Customer']));
    }
    if (byType['Supplier']?.length) {
      await db
        .delete(suppliers)
        .where(inArray(suppliers.id, byType['Supplier']));
    }
    if (byType['Manufacturer']?.length) {
      await db
        .delete(manufacturers)
        .where(inArray(manufacturers.id, byType['Manufacturer']));
    }
    if (byType['Category']?.length) {
      await db
        .delete(categories)
        .where(inArray(categories.id, byType['Category']));
    }
    if (byType['WarehouseBin']?.length) {
      await db
        .delete(warehouseBins)
        .where(inArray(warehouseBins.id, byType['WarehouseBin']));
    }
    if (byType['Location']?.length) {
      await db
        .delete(locations)
        .where(inArray(locations.id, byType['Location']));
    }
    if (byType['Warehouse']?.length) {
      await db
        .delete(warehouses)
        .where(inArray(warehouses.id, byType['Warehouse']));
    }
    if (byType['Unit']?.length) {
      await db.delete(units).where(inArray(units.id, byType['Unit']));
    }
    if (byType['Role']?.length) {
      await db.delete(roles).where(inArray(roles.id, byType['Role']));
    }
    if (byType['User']?.length) {
      await db.delete(users).where(inArray(users.id, byType['User']));
    }

    const [updatedJob] = await db
      .update(importExportJobs)
      .set({
        status: 'REVERSED',
        updatedAt: new Date(),
      })
      .where(eq(importExportJobs.id, job.id))
      .returning();

    return {
      success: true,
      message: `Successfully reversed import job for "${job.entityType}". Reverted ${createdEntities.length} created record(s) including side effects.`,
      revertedCount: createdEntities.length,
      job: updatedJob || job,
    };
  }

  async executeExport(dto: ExportRequestDto): Promise<ExportResponseDto> {
    this.logger.log(
      `Executing export request for entity ${dto.entityType} with format ${dto.format}`,
    );

    const entityTypeUpper = (dto.entityType || '').trim();
    let rawRows: Record<string, unknown>[] = [];

    try {
      switch (entityTypeUpper.toLowerCase()) {
        case 'component':
        case 'components':
          rawRows = await db.select().from(components);
          break;
        case 'category':
        case 'categories':
          rawRows = await db.select().from(categories);
          break;
        case 'supplier':
        case 'suppliers':
          rawRows = await db.select().from(suppliers);
          break;
        case 'manufacturer':
        case 'manufacturers':
          rawRows = await db.select().from(manufacturers);
          break;
        case 'customer':
        case 'customers':
          rawRows = await db.select().from(customers);
          break;
        case 'warehouse':
        case 'warehouses':
          rawRows = await db.select().from(warehouses);
          break;
        case 'warehousebin':
        case 'warehousebins':
          rawRows = await db.select().from(warehouseBins);
          break;
        case 'location':
        case 'locations':
          rawRows = await db.select().from(locations);
          break;
        case 'unit':
        case 'units':
          rawRows = await db.select().from(units);
          break;
        case 'attributedefinition':
        case 'attributedefinitions':
        case 'attribute':
        case 'attributes':
          rawRows = await db.select().from(attributeDefinitions);
          break;
        case 'user':
        case 'users': {
          const uList = await db.select().from(users);
          rawRows = uList.map((u) => {
            const copy = { ...u } as Record<string, unknown>;
            delete copy.passwordHash;
            return copy;
          });
          break;
        }
        case 'role':
        case 'roles':
          rawRows = await db.select().from(roles);
          break;
        case 'project':
        case 'projects':
          rawRows = await db.select().from(projects);
          break;
        case 'task':
        case 'tasks':
        case 'projecttask':
        case 'projecttasks':
          rawRows = await db.select().from(projectTasks);
          break;
        case 'bom':
        case 'boms':
        case 'billofmaterials':
          rawRows = await db.select().from(billOfMaterials);
          break;
        case 'workorder':
        case 'workorders':
        case 'productionorder':
        case 'productionorders':
        case 'manufacturing':
          rawRows = await db.select().from(productionOrders);
          break;
        case 'purchaseorder':
        case 'purchaseorders':
        case 'procurement':
          rawRows = await db.select().from(purchaseOrders);
          break;
        case 'goodsreceipt':
        case 'goodsreceipts':
          rawRows = await db.select().from(goodsReceipts);
          break;
        case 'openinginventory':
        case 'inventorytransaction':
        case 'inventorytransactions':
          rawRows = await db.select().from(inventoryTransactions);
          break;
        case 'stockadjustment':
        case 'stockadjustments':
          rawRows = await db.select().from(stockAdjustments);
          break;
        case 'cyclecount':
        case 'cyclecounts':
          rawRows = await db.select().from(cycleCounts);
          break;
        case 'warehousetransfer':
        case 'warehousetransfers':
          rawRows = await db.select().from(warehouseTransfers);
          break;
        case 'maintenanceschedule':
        case 'maintenanceschedules':
        case 'maintenance':
          rawRows = await db.select().from(maintenanceSchedules);
          break;
        case 'servicerequest':
        case 'servicerequests':
        case 'service':
          rawRows = await db.select().from(serviceRequests);
          break;
        case 'warranty':
        case 'warranties':
        case 'warrantyclaim':
        case 'warrantyclaims':
          rawRows = await db.select().from(warrantyClaims);
          break;
        case 'rma':
        case 'rmas':
        case 'customerreturn':
        case 'customerreturns':
          rawRows = await db.select().from(customerReturns);
          break;
        case 'salesorder':
        case 'salesorders':
          rawRows = await db.select().from(salesOrders);
          break;
        case 'quotation':
        case 'quotations':
          rawRows = await db.select().from(quotations);
          break;
        case 'lead':
        case 'leads':
        case 'crmlead':
        case 'crmleads':
          rawRows = await db.select().from(crmLeads);
          break;
        default:
          try {
            const def = getImporterDefinition(dto.entityType);
            if (
              def?.entityType &&
              def.entityType.toLowerCase() !== entityTypeUpper.toLowerCase()
            ) {
              return await this.executeExport({
                ...dto,
                entityType: def.entityType,
              });
            }
          } catch {
            // Unregistered entity
          }
          rawRows = [];
          break;
      }
    } catch (err) {
      this.logger.error(
        `Failed to query records for entity "${dto.entityType}": ${err instanceof Error ? err.message : String(err)}`,
      );
      rawRows = [];
    }

    let filteredRows = rawRows;
    if (dto.selectedIds && dto.selectedIds.length > 0) {
      const idSet = new Set(dto.selectedIds.map(String));
      filteredRows = rawRows.filter((r) => idSet.has(String(r.id)));
    }

    // Determine export columns
    let exportColumns: string[] = [];
    if (dto.columns && dto.columns.length > 0) {
      exportColumns = dto.columns.filter((c) => Boolean(c && c.trim()));
    }

    if (exportColumns.length === 0) {
      try {
        const def = getImporterDefinition(dto.entityType);
        if (def?.fields && def.fields.length > 0) {
          exportColumns = ['id', ...def.fields.map((f) => f.name)];
        }
      } catch {
        // Fall back to row keys
      }
      if (exportColumns.length === 0 && filteredRows.length > 0) {
        exportColumns = Object.keys(filteredRows[0] || {});
      }
    }

    if (exportColumns.length === 0) {
      exportColumns = ['id', 'name', 'code', 'status', 'createdAt'];
    }

    const formatRowValue = (
      row: Record<string, unknown>,
      col: string,
    ): unknown => {
      if (row[col] !== undefined) {
        return row[col];
      }
      const colLower = col.toLowerCase();
      for (const key of Object.keys(row)) {
        if (key.toLowerCase() === colLower) {
          return row[key];
        }
      }
      return '';
    };

    const escapeCsvValue = (val: unknown): string => {
      if (val === null || val === undefined) {
        return '';
      }
      let str: string;
      if (val instanceof Date) {
        str = val.toISOString();
      } else if (typeof val === 'object') {
        str = JSON.stringify(val);
      } else if (typeof val === 'string') {
        str = val;
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        str = String(val);
      } else {
        str = '';
      }
      if (
        str.includes(',') ||
        str.includes('"') ||
        str.includes('\n') ||
        str.includes('\r')
      ) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let fileContent = '';
    let fileName = '';

    if (dto.format === ExportFormat.JSON) {
      const jsonRows = filteredRows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (const col of exportColumns) {
          obj[col] = formatRowValue(row, col);
        }
        return obj;
      });
      fileContent = JSON.stringify(jsonRows, null, 2);
      fileName = `${dto.entityType.toLowerCase()}_export.json`;
    } else {
      // CSV and EXCEL: prepended with UTF-8 BOM for full Excel/Sheets compatibility
      const headerLine = exportColumns.map(escapeCsvValue).join(',');
      const dataLines = filteredRows.map((row) =>
        exportColumns
          .map((col) => escapeCsvValue(formatRowValue(row, col)))
          .join(','),
      );
      fileContent = '\uFEFF' + [headerLine, ...dataLines].join('\n');
      fileName = `${dto.entityType.toLowerCase()}_export.csv`;
    }

    let createdJob: typeof importExportJobs.$inferSelect | null = null;
    try {
      const [inserted] = await db
        .insert(importExportJobs)
        .values({
          id: crypto.randomUUID(),
          jobType: 'EXPORT',
          entityType: dto.entityType,
          format: dto.format || ExportFormat.CSV,
          status: 'COMPLETED',
          totalRecords: filteredRows.length,
          processedRecords: filteredRows.length,
          failedRecords: 0,
          progressPercent: 100,
          fileName,
        })
        .returning();
      createdJob = inserted ?? null;
    } catch (e) {
      this.logger.warn(
        `Failed to record export job in database: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      job: createdJob || {
        id: crypto.randomUUID(),
        jobType: 'EXPORT' as const,
        entityType: dto.entityType,
        format: dto.format,
        status: 'COMPLETED' as const,
        totalRecords: filteredRows.length,
        processedRecords: filteredRows.length,
        failedRecords: 0,
        progressPercent: 100,
        createdAt: new Date().toISOString(),
      },
      fileName,
      format: dto.format,
      recordCount: filteredRows.length,
      fileContent,
    };
  }

  async getJobs(userId?: string) {
    if (userId) {
      return await db
        .select()
        .from(importExportJobs)
        .where(eq(importExportJobs.userId, userId))
        .orderBy(desc(importExportJobs.createdAt));
    }
    return await db
      .select()
      .from(importExportJobs)
      .orderBy(desc(importExportJobs.createdAt));
  }

  async getJob(id: string) {
    const [job] = await db
      .select()
      .from(importExportJobs)
      .where(eq(importExportJobs.id, id))
      .limit(1);

    if (!job) {
      throw new NotFoundException(`Import job with ID "${id}" not found`);
    }

    return job;
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
