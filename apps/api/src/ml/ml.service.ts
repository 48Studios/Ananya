import { Injectable, Logger, Optional } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  categories,
  manufacturers,
  components,
  attributeDefinitions,
  aiSuggestionFeedback,
} from '@ananya/database/schema';
import { and, eq, desc, gte, lte } from '@ananya/database/query';
import { MlClientService } from './ml-client.service';
import { DataPacksService } from '../data-packs/data-packs.service';
import * as fs from 'fs';
import * as path from 'path';
import {
  SuggestComponentDto,
  ComponentSuggestionResponseDto,
  CategorySuggestionDto,
  ManufacturerSuggestionDto,
  DuplicateWarningDto,
  ExtractedAttributeDto,
  EvidenceItemDto,
  CreateMlFeedbackDto,
  ExportFeedbackQueryDto,
  ReviewQuarantineRecordDto,
  QuarantineFilterQueryDto,
} from './dtos';

interface RawExtractedAttribute {
  code?: string;
  value: string | number | boolean | null;
  unit?: string | null;
  formatted: string;
  confidence: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: EvidenceItemDto[];
}

const FALLBACK_MANUFACTURER_PREFIXES: Record<string, string> = {
  RC: 'Yageo',
  RT: 'Yageo',
  CC: 'Yageo',
  GRM: 'Murata',
  GJM: 'Murata',
  BLM: 'Murata',
  C: 'KEMET',
  T491: 'KEMET',
  SI: 'Vishay',
  CRCW: 'Vishay',
  CS: 'Samwha',
  SWPA: 'Sunlord',
  BSS: 'Slkor',
  MBR: 'JSMSEMI',
  MC: 'Multicomp Pro',
  TSA: 'BZCN',
  JS: 'Jushuo',
  AFC: 'Jushuo',
  XL: 'Xinglight',
};

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(
    private readonly mlClient: MlClientService,
    @Optional() private readonly dataPacksService?: DataPacksService,
  ) {}

  async suggest(
    dto: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    const t0 = performance.now();
    const query = dto.query.trim();
    const partNumber = (dto.partNumber || query).trim();
    const description = (dto.description || query).trim();

    // 1. Fetch reference lookups from database and active Data Pack hints
    const [
      allCategories,
      allManufacturers,
      allAttributes,
      existingComps,
      datapackHints,
    ] = await Promise.all([
      db.select().from(categories).where(eq(categories.isActive, true)),
      db.select().from(manufacturers).where(eq(manufacturers.isActive, true)),
      db.select().from(attributeDefinitions),
      db
        .select({
          id: components.id,
          sku: components.sku,
          name: components.name,
          description: components.description,
        })
        .from(components)
        .limit(100),
      this.dataPacksService
        ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
        : Promise.resolve([]),
    ]);

    // 2. Try ananya-ml microservice first with dynamic Data Pack hints
    let isMlActive = false;
    let mlResponse = null;

    if (this.mlClient.enabled) {
      mlResponse = await this.mlClient.suggest({
        query,
        part_number: partNumber,
        description,
        existing_components: existingComps.map((c) => ({
          id: c.id,
          sku: c.sku,
          name: c.name,
          description: c.description || undefined,
        })),
        datapack_hints: datapackHints,
      });

      if (mlResponse) {
        isMlActive = true;
      }
    }

    // 3. Category Resolution
    let primaryCategory: CategorySuggestionDto | null = null;
    const alternativeCategories: CategorySuggestionDto[] = [];

    if (mlResponse && mlResponse.category_predictions.length > 0) {
      for (const [idx, pred] of mlResponse.category_predictions.entries()) {
        const subName = pred.subcategory || pred.category;
        const matchedCat = allCategories.find(
          (c) =>
            c.name.toLowerCase() === subName.toLowerCase() ||
            c.code.toLowerCase() === subName.toLowerCase() ||
            c.name.toLowerCase() === pred.category.toLowerCase(),
        );

        const item: CategorySuggestionDto = {
          categoryId: matchedCat?.id || null,
          categoryCode: matchedCat?.code,
          categoryName: pred.category,
          subcategoryId: matchedCat?.parentId ? matchedCat.id : null,
          subcategoryCode: matchedCat?.parentId ? matchedCat.code : undefined,
          subcategoryName: pred.subcategory,
          confidence: pred.confidence,
          confidenceLevel:
            pred.confidence_level ||
            (pred.confidence >= 0.85
              ? 'HIGH'
              : pred.confidence >= 0.6
                ? 'MEDIUM'
                : 'LOW'),
          evidence: pred.evidence || [],
        };

        if (idx === 0) {
          primaryCategory = item;
        } else {
          alternativeCategories.push(item);
        }
      }
    } else {
      // Deterministic Category Fallback (Leveraging Data Pack Hints and In-Memory Rules)
      const lower = `${partNumber} ${description}`.toLowerCase();
      const upper = partNumber.toUpperCase();
      let matchedName = 'Electronic Components';
      let evidenceType = 'keyword';
      let evidenceDesc = 'Matched basic category keyword';

      // Check Data Pack MPN patterns and aliases first
      let dpMatched = false;
      for (const hint of datapackHints) {
        if (hint.mpnPatterns) {
          for (const pat of hint.mpnPatterns) {
            try {
              if (
                new RegExp(pat, 'i').test(upper) ||
                new RegExp(pat, 'i').test(partNumber)
              ) {
                matchedName = hint.categoryName || matchedName;
                evidenceType = 'mpn_pattern';
                evidenceDesc = `Matched Data Pack MPN pattern '${pat}' for ${hint.categoryName}`;
                dpMatched = true;
                break;
              }
            } catch {
              // Ignore invalid regex pattern
            }
          }
        }
        if (dpMatched) break;
        if (hint.aliases) {
          for (const alias of hint.aliases) {
            if (
              alias.length >= 2 &&
              new RegExp(`\\b${alias}\\b`, 'i').test(lower)
            ) {
              matchedName = hint.categoryName || matchedName;
              evidenceType = 'data_pack_rule';
              evidenceDesc = `Matched category alias '${alias}' in description`;
              dpMatched = true;
              break;
            }
          }
        }
        if (dpMatched) break;
      }

      if (!dpMatched) {
        if (
          lower.includes('resistor') ||
          lower.includes('ohm') ||
          lower.includes('rc0805')
        ) {
          matchedName = 'Resistors';
          evidenceDesc = 'Identified standard resistance term in query';
        } else if (
          lower.includes('capacitor') ||
          lower.includes('uf') ||
          lower.includes('pf') ||
          lower.includes('nf')
        ) {
          matchedName = 'Capacitors';
          evidenceDesc = 'Identified capacitance unit in query';
        } else if (
          lower.includes('inductor') ||
          lower.includes('uh') ||
          lower.includes('nh')
        ) {
          matchedName = 'Inductors';
          evidenceDesc = 'Identified inductance specification in query';
        } else if (
          lower.includes('diode') ||
          lower.includes('schottky') ||
          lower.includes('1n5819')
        ) {
          matchedName = 'Diodes';
          evidenceDesc = 'Identified diode terminology in query';
        } else if (
          lower.includes('mosfet') ||
          lower.includes('transistor') ||
          lower.includes('bss138')
        ) {
          matchedName = 'Transistors';
          evidenceDesc = 'Identified transistor / MOSFET term in query';
        } else if (
          lower.includes('connector') ||
          lower.includes('header') ||
          lower.includes('jst')
        ) {
          matchedName = 'Connectors';
          evidenceDesc = 'Identified interconnect terminology in query';
        } else if (lower.includes('switch') || lower.includes('tact')) {
          matchedName = 'Switches';
          evidenceDesc = 'Identified switch terminology in query';
        }
      }

      const dbCat = allCategories.find(
        (c) => c.name.toLowerCase() === matchedName.toLowerCase(),
      );
      primaryCategory = {
        categoryId: dbCat?.id || null,
        categoryCode: dbCat?.code,
        categoryName: 'Electronic Components',
        subcategoryId: dbCat?.parentId ? dbCat.id : null,
        subcategoryCode: dbCat?.parentId ? dbCat.code : undefined,
        subcategoryName: matchedName,
        confidence: dpMatched ? 0.95 : 0.85,
        confidenceLevel: dpMatched ? 'HIGH' : 'MEDIUM',
        evidence: [
          {
            type: evidenceType,
            description: evidenceDesc,
            weight: dpMatched ? 0.9 : 0.7,
            source: dpMatched ? 'datapack:rule' : 'deterministic:fallback',
          },
        ],
      };
    }

    // 4. Manufacturer Resolution
    let manufacturerSuggestion: ManufacturerSuggestionDto | null = null;
    let mfgName = 'Generic';
    let mfgConf = 0.5;
    let mfgConfLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let mfgType = 'fallback';
    let mfgEvidence: EvidenceItemDto[] = [];

    if (mlResponse) {
      mfgName = mlResponse.manufacturer.manufacturer;
      mfgConf = mlResponse.manufacturer.confidence;
      mfgConfLevel =
        mlResponse.manufacturer.confidence_level ||
        (mfgConf >= 0.85 ? 'HIGH' : 'MEDIUM');
      mfgType = mlResponse.manufacturer.match_type;
      mfgEvidence = mlResponse.manufacturer.evidence || [];
    } else {
      // Deterministic Manufacturer Fallback with Data Pack Hints
      const upperPn = partNumber.toUpperCase();
      let matched = false;

      for (const hint of datapackHints) {
        if (hint.manufacturerHints) {
          for (const mfgHint of hint.manufacturerHints) {
            if (mfgHint.prefixPatterns) {
              for (const pat of mfgHint.prefixPatterns) {
                try {
                  if (new RegExp(pat, 'i').test(upperPn)) {
                    mfgName = mfgHint.name;
                    mfgConf = 0.99;
                    mfgConfLevel = 'HIGH';
                    mfgType = 'datapack';
                    mfgEvidence = [
                      {
                        type: 'data_pack_rule',
                        description: `Matched Data Pack manufacturer pattern '${pat}' for ${mfgHint.name}`,
                        weight: 0.95,
                        source: 'datapack:mfg',
                      },
                    ];
                    matched = true;
                    break;
                  }
                } catch {
                  // Ignore invalid regex pattern
                }
              }
            }
            if (matched) break;
          }
        }
        if (matched) break;
      }

      if (!matched) {
        for (const [prefix, name] of Object.entries(
          FALLBACK_MANUFACTURER_PREFIXES,
        )) {
          if (upperPn.startsWith(prefix)) {
            mfgName = name;
            mfgConf = 0.98;
            mfgConfLevel = 'HIGH';
            mfgType = 'pattern';
            mfgEvidence = [
              {
                type: 'mpn_pattern',
                description: `Matched established manufacturer prefix series '${prefix}'`,
                weight: 0.95,
                source: 'catalog:prefix',
              },
            ];
            break;
          }
        }
      }

      if (!mfgEvidence.length) {
        mfgEvidence = [
          {
            type: 'classifier',
            description:
              'No known manufacturer prefix matched; default Generic fallback assigned',
            weight: 0.3,
            source: 'resolver:fallback',
          },
        ];
      }
    }

    const dbMfg = allManufacturers.find(
      (m) =>
        m.name.toLowerCase() === mfgName.toLowerCase() ||
        m.code.toLowerCase() === mfgName.toLowerCase(),
    );

    manufacturerSuggestion = {
      manufacturerId: dbMfg?.id || null,
      manufacturerCode: dbMfg?.code,
      manufacturerName: mfgName,
      confidence: mfgConf,
      confidenceLevel: mfgConfLevel,
      matchType: mfgType,
      evidence: mfgEvidence,
    };

    // 5. Duplicate Detection & Physical Compatibility Precedence
    const duplicateWarnings: DuplicateWarningDto[] = [];
    const pnNorm = partNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // Check exact DB match
    for (const ec of existingComps) {
      const skuNorm = ec.sku.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (pnNorm && skuNorm === pnNorm) {
        duplicateWarnings.push({
          id: ec.id,
          sku: ec.sku,
          name: ec.name,
          similarity: 1.0,
          confidenceLevel: 'HIGH',
          matchType: 'exact_sku',
          reason: `Exact match with existing SKU '${ec.sku}'`,
          evidence: [
            {
              type: 'mpn_pattern',
              description: `Exact normalized part number match with '${ec.sku}'`,
              weight: 1.0,
              source: 'database:authoritative_sku',
            },
          ],
        });
      }
    }

    if (mlResponse && mlResponse.duplicates.matches.length > 0) {
      for (const m of mlResponse.duplicates.matches) {
        if (!duplicateWarnings.some((w) => w.id === m.id)) {
          const comp = existingComps.find((c) => c.id === m.id);
          duplicateWarnings.push({
            id: m.id,
            sku: m.sku,
            name: comp?.name,
            similarity: m.similarity,
            confidenceLevel: m.confidence_level || 'MEDIUM',
            matchType: m.match_type,
            reason: m.reason,
            evidence: m.evidence || [],
          });
        }
      }
    }

    // 6. Dynamic Attributes Resolution
    const resolvedAttributes: Record<string, ExtractedAttributeDto> = {};
    const rawAttrs: Record<string, RawExtractedAttribute> = mlResponse
      ? mlResponse.extracted_attributes
      : this.extractAttributesFallback(query);

    for (const [key, raw] of Object.entries(rawAttrs)) {
      const dbDef = allAttributes.find(
        (a) =>
          a.code.toLowerCase() === key.toLowerCase() ||
          a.name.toLowerCase() === key.toLowerCase(),
      );

      resolvedAttributes[key] = {
        code: key,
        attributeDefinitionId: dbDef?.id || null,
        value: raw.value,
        unit: raw.unit || null,
        formatted: raw.formatted,
        confidence: raw.confidence,
        confidenceLevel: raw.confidence_level || 'HIGH',
        evidence: raw.evidence || [
          {
            type: 'datasheet_param',
            description: `Extracted specification value ${raw.formatted}`,
            weight: 0.9,
            source: 'extractor:fallback',
          },
        ],
      };
    }

    // 7. Aggregate Overall Evidence and Combined Confidence Level
    const overallEvidence: EvidenceItemDto[] = [];
    if (primaryCategory?.evidence) {
      overallEvidence.push(...primaryCategory.evidence.slice(0, 2));
    }
    if (manufacturerSuggestion.evidence) {
      overallEvidence.push(...manufacturerSuggestion.evidence.slice(0, 1));
    }
    for (const attr of Object.values(resolvedAttributes).slice(0, 2)) {
      if (attr.evidence) {
        overallEvidence.push(...attr.evidence.slice(0, 1));
      }
    }

    let overallConfLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (
      primaryCategory?.confidenceLevel === 'HIGH' &&
      manufacturerSuggestion.confidenceLevel === 'HIGH'
    ) {
      overallConfLevel = 'HIGH';
    } else if (
      primaryCategory?.confidenceLevel === 'LOW' &&
      manufacturerSuggestion.confidenceLevel === 'LOW'
    ) {
      overallConfLevel = 'LOW';
    }

    const elapsed = performance.now() - t0;

    return {
      query,
      suggestedSku: partNumber,
      suggestedName: description !== query ? description : undefined,
      suggestedUnit: 'pcs',
      category: primaryCategory,
      alternativeCategories,
      manufacturer: manufacturerSuggestion,
      isDuplicate: duplicateWarnings.length > 0,
      duplicateWarnings,
      attributes: resolvedAttributes,
      confidenceLevel: overallConfLevel,
      overallEvidence,
      isMlActive,
      executionTimeMs: Math.round(elapsed * 100) / 100,
    };
  }

  async recordFeedback(
    dto: CreateMlFeedbackDto,
    user?: { id?: string; email?: string },
  ): Promise<{ success: boolean; recordedCount: number }> {
    if (!dto.items || dto.items.length === 0) {
      return { success: true, recordedCount: 0 };
    }

    const inserts = dto.items.map((item) => ({
      componentId: dto.componentId || null,
      creationContext: dto.creationContext || {},
      suggestionType: item.suggestionType,
      field: item.field,
      predictedValue: item.predictedValue || null,
      confidence: item.confidence ? String(item.confidence) : null,
      confidenceLevel: item.confidenceLevel || 'MEDIUM',
      evidence: item.evidence || [],
      modelVersion: item.modelVersion || '1.0.0',
      userAction: item.userAction,
      finalValue: item.finalValue || null,
      reviewerId: user?.id || null,
      reviewerEmail: user?.email || null,
    }));

    await db.insert(aiSuggestionFeedback).values(inserts);
    this.logger.log(
      `Recorded ${inserts.length} AI suggestion feedback telemetry events.`,
    );

    return {
      success: true,
      recordedCount: inserts.length,
    };
  }

  async exportFeedbackDataset(query: ExportFeedbackQueryDto): Promise<{
    dataset: Array<{
      id: string;
      suggestionType: string;
      field: string;
      creationContext: Record<string, unknown> | null;
      predictedValue: unknown;
      userAction: string;
      finalValue: unknown;
      evidence: unknown;
      createdAt: Date;
    }>;
    count: number;
  }> {
    const conditions = [];

    if (query.suggestionType) {
      conditions.push(
        eq(aiSuggestionFeedback.suggestionType, query.suggestionType),
      );
    }
    if (query.userAction) {
      conditions.push(eq(aiSuggestionFeedback.userAction, query.userAction));
    }
    if (query.startDate) {
      conditions.push(
        gte(aiSuggestionFeedback.createdAt, new Date(query.startDate)),
      );
    }
    if (query.endDate) {
      conditions.push(
        lte(aiSuggestionFeedback.createdAt, new Date(query.endDate)),
      );
    }

    const rows = await db
      .select({
        id: aiSuggestionFeedback.id,
        suggestionType: aiSuggestionFeedback.suggestionType,
        field: aiSuggestionFeedback.field,
        creationContext: aiSuggestionFeedback.creationContext,
        predictedValue: aiSuggestionFeedback.predictedValue,
        userAction: aiSuggestionFeedback.userAction,
        finalValue: aiSuggestionFeedback.finalValue,
        evidence: aiSuggestionFeedback.evidence,
        createdAt: aiSuggestionFeedback.createdAt,
      })
      .from(aiSuggestionFeedback)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(aiSuggestionFeedback.createdAt))
      .limit(1000);

    return {
      dataset: rows,
      count: rows.length,
    };
  }

  private extractAttributesFallback(
    text: string,
  ): Record<string, RawExtractedAttribute> {
    const attrs: Record<string, RawExtractedAttribute> = {};
    const t = text.replace('µ', 'u').replace('Ω', 'ohm');

    // Resistance
    const resM = t.match(/\b(\d+(?:\.\d+)?)\s*(kohm|mohm|ohm|k|m|r)\b/i);
    if (resM && resM[1] && resM[2]) {
      const val = parseFloat(resM[1]);
      const u = resM[2].toLowerCase();
      const mult =
        u === 'k' || u === 'kohm'
          ? 1000
          : u === 'm' || u === 'mohm'
            ? 1000000
            : 1;
      const formatted = `${resM[1]}${u === 'k' ? 'kΩ' : 'Ω'}`;
      attrs['resistance'] = {
        code: 'resistance',
        value: val * mult,
        unit: 'ohm',
        formatted,
        confidence: 0.95,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: `Extracted resistance ${formatted} from query`,
            weight: 0.95,
            source: 'regex:fallback',
          },
        ],
      };
    }

    // Capacitance
    const capM = t.match(/\b(\d+(?:\.\d+)?)\s*(uf|nf|pf|f)\b/i);
    if (capM && capM[1] && capM[2]) {
      const formatted = `${capM[1]}${capM[2]}`;
      attrs['capacitance'] = {
        code: 'capacitance',
        value: parseFloat(capM[1]),
        unit: capM[2].toLowerCase(),
        formatted,
        confidence: 0.95,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: `Extracted capacitance ${formatted} from query`,
            weight: 0.95,
            source: 'regex:fallback',
          },
        ],
      };
    }

    // Voltage
    const voltM = t.match(/\b(\d+(?:\.\d+)?)\s*(v|kv|mv)\b/i);
    if (voltM && voltM[1] && voltM[2]) {
      const formatted = `${voltM[1]}${voltM[2].toUpperCase()}`;
      attrs['voltage'] = {
        code: 'voltage',
        value: parseFloat(voltM[1]),
        unit: voltM[2].toUpperCase(),
        formatted,
        confidence: 0.92,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: `Extracted voltage ${formatted} from query`,
            weight: 0.92,
            source: 'regex:fallback',
          },
        ],
      };
    }

    // Footprint
    const pkgM = t.match(
      /\b(0402|0603|0805|1206|SOT-?23|SOD-?123|SC-?70|DIP-?8)\b/i,
    );
    if (pkgM && pkgM[1]) {
      const pkg = pkgM[1].toUpperCase();
      attrs['package'] = {
        code: 'package',
        value: pkg,
        formatted: pkg,
        confidence: 0.98,
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'datasheet_param',
            description: `Extracted package footprint ${pkg} from query`,
            weight: 0.98,
            source: 'regex:fallback',
          },
        ],
      };
    }

    return attrs;
  }

  getQuarantinedRecords(query?: QuarantineFilterQueryDto): {
    items: Array<{
      id: string;
      record: Record<string, unknown>;
      rejectionReasons: string[];
      quarantineType: string;
      status: string;
      reviewerNotes?: string;
    }>;
    total: number;
  } {
    const quarantinePath = path.resolve(
      process.cwd(),
      '../ml/data/quarantine.json',
    );
    if (!fs.existsSync(quarantinePath)) {
      return { items: [], total: 0 };
    }
    try {
      const content = fs.readFileSync(quarantinePath, 'utf-8');
      const raw = JSON.parse(content) as Array<{
        id?: string;
        record?: Record<string, unknown>;
        rejectionReasons?: string[];
        quarantineType?: string;
        status?: string;
        reviewerNotes?: string;
      }>;
      if (!Array.isArray(raw)) {
        return { items: [], total: 0 };
      }
      let items = raw.map((item, idx: number) => ({
        id: item.id || `quarantine-${idx + 1}`,
        record: item.record || {},
        rejectionReasons: item.rejectionReasons || [],
        quarantineType: item.quarantineType || 'UNKNOWN',
        status: item.status || 'NEEDS_REVIEW',
        reviewerNotes: item.reviewerNotes,
      }));

      if (query?.status) {
        items = items.filter((it) => it.status === query.status);
      }
      if (query?.quarantineType) {
        items = items.filter(
          (it) => it.quarantineType === query.quarantineType,
        );
      }

      return { items, total: items.length };
    } catch (e) {
      this.logger.warn(`Failed to read quarantine.json: ${String(e)}`);
      return { items: [], total: 0 };
    }
  }

  reviewQuarantinedRecord(
    id: string,
    dto: ReviewQuarantineRecordDto,
    user?: { id?: string; email?: string },
  ): { success: boolean; message: string } {
    const quarantinePath = path.resolve(
      process.cwd(),
      '../ml/data/quarantine.json',
    );
    if (!fs.existsSync(quarantinePath)) {
      return { success: false, message: 'Quarantine store not found' };
    }
    try {
      const content = fs.readFileSync(quarantinePath, 'utf-8');
      const items = JSON.parse(content) as Array<{
        id?: string;
        record: Record<string, unknown>;
        rejectionReasons: string[];
        quarantineType: string;
        status: string;
        reviewerNotes?: string;
        reviewedAt?: string;
        reviewerEmail?: string;
      }>;
      if (!Array.isArray(items)) {
        return { success: false, message: 'Invalid quarantine file' };
      }

      const itemIdx = items.findIndex(
        (it, idx: number) => (it.id || `quarantine-${idx + 1}`) === id,
      );
      if (itemIdx === -1) {
        return { success: false, message: `Quarantine record ${id} not found` };
      }

      const target = items[itemIdx];
      if (!target) {
        return { success: false, message: `Quarantine record ${id} not found` };
      }
      target.status = dto.status;
      target.reviewedAt = new Date().toISOString();
      target.reviewerEmail = user?.email || 'admin@ananya.internal';
      if (dto.reviewerNotes) target.reviewerNotes = dto.reviewerNotes;

      const rec = target.record;
      if (dto.resolvedCategory && rec) rec.category = dto.resolvedCategory;
      if (dto.resolvedManufacturer && rec)
        rec.manufacturer = dto.resolvedManufacturer;

      fs.writeFileSync(quarantinePath, JSON.stringify(items, null, 2));

      // If marked VERIFIED by human auditor, append to validated_records.json
      if (dto.status === 'VERIFIED') {
        const validatedPath = path.resolve(
          process.cwd(),
          '../ml/data/validated_records.json',
        );
        let validatedRecords: Record<string, unknown>[] = [];
        if (fs.existsSync(validatedPath)) {
          try {
            validatedRecords = JSON.parse(
              fs.readFileSync(validatedPath, 'utf-8'),
            ) as Record<string, unknown>[];
          } catch {
            validatedRecords = [];
          }
        }
        rec.provenance = {
          ...(rec.provenance || {}),
          verificationStatus: 'VERIFIED',
          verificationMethod: 'human_audit',
          reviewerEmail: user?.email,
          reviewedAt: new Date().toISOString(),
        };
        validatedRecords.push(rec);
        fs.writeFileSync(
          validatedPath,
          JSON.stringify(validatedRecords, null, 2),
        );
      }

      return { success: true, message: `Record ${id} marked as ${dto.status}` };
    } catch (e) {
      return {
        success: false,
        message: `Failed to review record: ${String(e)}`,
      };
    }
  }
}
