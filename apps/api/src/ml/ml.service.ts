import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { db } from '@ananya/database';
import {
  categories,
  manufacturers,
  components,
  attributeDefinitions,
  attributeOptions,
  categoryAttributes,
  componentAttributeValues,
  aiSuggestionFeedback,
} from '@ananya/database/schema';
import { and, asc, eq, desc, gte, lte, inArray } from '@ananya/database/query';
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
  SuggestAttributeBindingsDto,
  SuggestAttributeBindingsResponseDto,
  SuggestCategoryAttributesDto,
  SuggestCategoryAttributesResponseDto,
  SuggestAttributeConfigDto,
  SuggestAttributeConfigResponseDto,
  DetectAttributeDuplicatesDto,
  DetectAttributeDuplicatesResponseDto,
  SuggestEnumValuesDto,
  SuggestEnumValuesResponseDto,
  AuditAttributeLibraryResponseDto,
  ApplySuggestedBindingDto,
  AttributeBindingSuggestionDto,
  CategoryAttributeSuggestionDto,
  AttributeDuplicateMatchDto,
  EnumOptionSuggestionDto,
  AttributeAuditIssueDto,
  AttributeConfigSuggestionDto,
  AttributeSuggestionDto,
} from './dtos';
import { resolveCategorySuggestion } from './category-suggestion-resolution';
import {
  buildAttributeSuggestions,
  type MlAttributeSuggestion,
  type RelevanceBinding,
  type RelevanceDefinition,
  type RelevanceExtractedAttribute,
  type RelevancePackExpectation,
  type AttributeRelevanceEvidence,
} from './component-attribute-relevance';
import type { MlEvidenceItem } from './ml-client.service';
import {
  loadComponentAttributeDisplays,
  loadUnitCatalog,
} from './current-attribute-value';
import { normalizedTerm } from './attribute-resolution';

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

interface SimpleAttributeDef {
  id: string;
  code: string;
  name: string;
  dataType?: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  aliases?: string[] | null;
  groupName?: string | null;
  isActive?: boolean;
  validationRules?: unknown;
}

interface SimpleCategory {
  id: string;
  code: string;
  name: string;
}

interface SimpleBinding {
  id?: string;
  attributeDefinitionId: string;
  categoryId: string;
  isRequired?: boolean;
}

interface DataPackHint {
  categoryCode?: string;
  categoryName?: string;
  expectedAttributes?: string[];
  packagePatterns?: string[];
  attributeAliases?: Record<string, string[] | undefined>;
}

function buildCategoryPath(
  categoryId: string,
  categoryMap: Map<string, { name: string; parentId: string | null }>,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = categoryId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const current = categoryMap.get(currentId);
    if (!current) break;
    path.unshift(current.name);
    currentId = current.parentId;
  }
  return path;
}

export function extractManufacturerPartNumber(
  input: string,
  manufacturers: Array<{ name: string; code: string }> = [],
): string | undefined {
  const token = input.match(/\b[A-Z0-9][A-Z0-9._/-]{4,}\b/i)?.[0];
  if (!token || !/[A-Z]/i.test(token) || !/\d/.test(token)) return undefined;
  const manufacturerTerms = manufacturers
    .flatMap((manufacturer) => [manufacturer.name, manufacturer.code])
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const cleaned = manufacturerTerms
    ? token.replace(
        new RegExp(`(?:-|_)(?:${manufacturerTerms})(?:-|$).*`, 'i'),
        '',
      )
    : token;
  return cleaned
    .replace(/(?:-|_)(?:SMD|SMT|THT|THICK|FILM|RESISTOR|CAPACITOR).*$/i, '')
    .trim()
    .toUpperCase();
}

/**
 * The relevance vocabulary the ML service's evidence is reported in.
 *
 * The service describes *how* it knows something in its own words; this maps
 * that onto the closed set of source types the suggestion layer and the review
 * queue store, so one finding's evidence never has two shapes depending on which
 * producer contributed it.
 */
function toRelevanceEvidence(item: MlEvidenceItem): AttributeRelevanceEvidence {
  return {
    type: 'ml_attribute_knowledge',
    description: item.description,
    source: item.source ?? undefined,
    weight: typeof item.weight === 'number' ? item.weight : 0.5,
  };
}

export function normalizeExtractedUnit(
  code: string,
  unit?: string | null,
): string | null {
  if (!unit) return null;
  const normalized = unit.trim();
  if (code === 'power' || code === 'power_rating') {
    if (/^mw$/i.test(normalized)) return 'mW';
    if (/^kw$/i.test(normalized)) return 'kW';
    if (/^w$/i.test(normalized)) return 'W';
  }
  if (/^ohm$/i.test(normalized)) return 'ohm';
  if (/^%$/.test(normalized)) return '%';
  return normalized;
}

/**
 * How many stored components are offered to duplicate detection.
 *
 * The bound exists so one suggestion request cannot ship an unbounded payload to
 * the model service, but it was an unexplained `limit(100)` ordered by nothing in
 * particular: past 100 components the oldest records — the ones the ERP treats as
 * canonical — could silently drop out of duplicate detection altogether. The
 * query is now ordered oldest-first and the bound is named, so truncation is a
 * known ceiling rather than an accident of row order.
 */
const DUPLICATE_CANDIDATE_LIMIT = 2000;

/**
 * How confident a category candidate must be before its bindings condition
 * attribute relevance.
 *
 * A category the model is undecided about must not silently import its whole
 * specification profile into the suggestion list: an attribute bound to a
 * barely-considered alternative is a *possible* requirement, not a statement
 * about this part. The primary category is always considered because it is the
 * one the reviewer is shown.
 */
const CATEGORY_RELEVANCE_CONFIDENCE_THRESHOLD = 0.6;

const ATTRIBUTE_CODE_ALIASES: Record<string, string> = {
  power: 'power_rating',
  power_rating: 'power_rating',
  tolerance: 'tolerance',
  voltage: 'voltage_rating',
  voltage_rating: 'voltage_rating',
  current: 'forward_current',
  package: 'package',
  mfr_part_number: 'mfr_part_number',
};

export function resolveAttributeDefinition(
  key: string,
  definitions: SimpleAttributeDef[],
): SimpleAttributeDef | undefined {
  const normalizedKey = key.trim().toLowerCase();
  const canonicalCode = ATTRIBUTE_CODE_ALIASES[normalizedKey] || normalizedKey;
  return definitions.find((definition) => {
    const aliases = definition.aliases || [];
    return (
      definition.code.toLowerCase() === canonicalCode ||
      definition.code.toLowerCase() === normalizedKey ||
      definition.name.toLowerCase() === normalizedKey ||
      aliases.some((alias) => alias.toLowerCase() === normalizedKey)
    );
  });
}

export function composeComponentName(
  attributes: Record<string, ExtractedAttributeDto>,
  category: CategorySuggestionDto | null,
  sourceText: string,
): string | undefined {
  const categoryName = category?.subcategoryName || category?.categoryName;
  const resistance = attributes.resistance?.formatted;
  const capacitance = attributes.capacitance?.formatted;
  const pkg = attributes.package?.formatted;
  const value = resistance || capacitance;
  if (!value && !categoryName) return undefined;
  const lower = sourceText.toLowerCase();
  const type = categoryName?.replace(/s$/, '') || 'Component';
  const qualifiers = [
    /\bsmd\b|\bsmt\b/i.test(lower) ? 'SMD' : undefined,
    /thick\s+film/i.test(lower) ? 'Thick Film' : undefined,
  ];
  return [value, pkg, ...qualifiers, type].filter(Boolean).join(' ');
}

export function composeComponentDescription(
  attributes: Record<string, ExtractedAttributeDto>,
  category: CategorySuggestionDto | null,
  sourceText: string,
): string | undefined {
  const facts = [
    attributes.resistance?.formatted,
    attributes.tolerance?.formatted
      ? `±${attributes.tolerance.formatted.replace(/^±/, '')}`
      : undefined,
    attributes.power?.formatted || attributes.power_rating?.formatted,
    attributes.package?.formatted,
  ].filter(Boolean);
  if (facts.length === 0 && !category?.subcategoryName) return undefined;
  const categoryName = category?.subcategoryName || category?.categoryName;
  const lower = sourceText.toLowerCase();
  const qualifiers = [
    /thick\s+film/i.test(lower) ? 'thick-film' : undefined,
    /\bgeneral\s+purpose\b/i.test(lower)
      ? 'for general-purpose applications'
      : undefined,
  ].filter(Boolean);
  const type = categoryName?.replace(/s$/, '').toLowerCase();
  return `${facts.join(' ')}${qualifiers.length ? ` ${qualifiers.join(' ')}` : ''}${type ? ` ${type}` : ''}.`;
}

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
    const requestedPartNumber = dto.partNumber?.trim();
    let partNumber = (requestedPartNumber || query).trim();
    const description = (dto.description || query).trim();

    // 1. Fetch reference lookups from database and active Data Pack hints
    const [
      allCategories,
      allManufacturers,
      allAttributes,
      candidateComps,
      datapackHints,
    ] = await Promise.all([
      db.select().from(categories),
      db.select().from(manufacturers),
      db.select().from(attributeDefinitions),
      db
        .select({
          id: components.id,
          sku: components.sku,
          name: components.name,
          description: components.description,
          manufacturerPartNumber: components.manufacturerPartNumber,
        })
        .from(components)
        // Oldest first, so the records the ERP treats as canonical are always
        // inside the bound and the candidate set does not depend on row order.
        .orderBy(asc(components.createdAt), asc(components.id))
        .limit(DUPLICATE_CANDIDATE_LIMIT),
      this.dataPacksService
        ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
        : Promise.resolve([]),
    ]);

    /**
     * The stored components a duplicate can be found in.
     *
     * The component being edited is removed here, before either duplicate path
     * reads the list, so it can never be reported as a duplicate of itself. Both
     * the ERP-side SKU comparison and the outbound model call share this list.
     */
    const existingComps = candidateComps.filter(
      (candidate) => candidate.id !== dto.componentId,
    );

    const categoryMap = new Map(
      allCategories.map((category) => [category.id, category]),
    );

    /**
     * The categories the installed Data Packs declare for their part families.
     *
     * They are the tie-break of last resort when two ERP categories share a name
     * (the live library has two "Resistors" rows, only one of which carries
     * components), because a pack's declaration is deliberate while the row the
     * ML picked among identical names depends on the order it received them in.
     */
    const packCategoryDeclarations = datapackHints
      .map((hint) => ({
        categoryCode: hint.categoryCode ?? '',
        categoryName: hint.categoryName ?? '',
      }))
      .filter(
        (declaration) =>
          declaration.categoryCode.length > 0 &&
          declaration.categoryName.length > 0,
      );

    partNumber = (
      extractManufacturerPartNumber(
        requestedPartNumber || query,
        allManufacturers,
      ) ||
      requestedPartNumber ||
      query
    ).trim();

    // 2. Try ananya-ml microservice first with dynamic Data Pack hints
    let isMlActive = false;
    let mlResponse = null;

    if (this.mlClient.enabled) {
      mlResponse = await this.mlClient.suggest({
        query,
        part_number: partNumber,
        description,
        datasheet_text: dto.datasheetText,
        // Forwarded as supplied: the model service reads the PDF itself, so a
        // caller that only holds the file still gets extraction, classification
        // and manufacturer resolution from its contents.
        datasheet_pdf_base64: dto.datasheetPdfBase64,
        existing_components: existingComps.map((c) => ({
          id: c.id,
          sku: c.sku,
          name: c.name,
          description: c.description || undefined,
          // The part's real identity. Without it the detector can only compare
          // a searched part number against the ERP's own SKU, which never
          // matches, leaving every duplicate decision to fuzzy text overlap.
          manufacturer_part_number: c.manufacturerPartNumber || undefined,
        })),
        erp_manufacturers: allManufacturers.map((manufacturer) => ({
          id: manufacturer.id,
          name: manufacturer.name,
          code: manufacturer.code,
          aliases: [],
          normalized_name: manufacturer.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''),
          is_active: manufacturer.isActive,
        })),
        erp_categories: allCategories.map((category) => ({
          id: category.id,
          name: category.name,
          code: category.code,
          description: category.description,
          parent_id: category.parentId,
          parent_name: category.parentId
            ? categoryMap.get(category.parentId)?.name
            : null,
          path: buildCategoryPath(category.id, categoryMap),
          aliases: [],
          is_active: category.isActive,
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
        // The ML resolves the category against the same ERP list this service
        // just sent it, so its answer is resolved again here rather than
        // re-derived: matching the group name at the same priority as the
        // family name is what used to turn every capacitor, inductor and diode
        // suggestion into "Electronic Components".
        const resolved = resolveCategorySuggestion(
          {
            categoryName: pred.category,
            subcategoryName: pred.subcategory,
            categoryId: pred.category_id,
            categoryCode: pred.category_code,
            parentCategoryId: pred.parent_category_id,
          },
          allCategories,
          packCategoryDeclarations,
        );
        const matchedCat = resolved?.category ?? null;

        const item: CategorySuggestionDto = {
          resolution:
            pred.resolution || (matchedCat ? 'EXISTING' : 'NEW_CANDIDATE'),
          categoryId:
            matchedCat?.id ||
            (pred.resolution === 'EXISTING' ? pred.category_id || null : null),
          // The resolved row's own code wins: the resolver may deliberately have
          // kept a different row than the ML named (two categories can share a
          // name), and reporting the ML's code for a different row is what made
          // the payload self-contradictory. The ML's code is still the fallback
          // when nothing local matched, where it is a new-category hint.
          categoryCode: matchedCat?.code ?? pred.category_code ?? undefined,
          categoryName: pred.category,
          subcategoryId: matchedCat?.parentId
            ? matchedCat.id
            : matchedCat?.id ||
              (pred.resolution === 'EXISTING'
                ? pred.category_id || null
                : null),
          subcategoryCode: matchedCat?.parentId
            ? matchedCat.code
            : (pred.category_code ?? undefined),
          subcategoryName: pred.subcategory,
          // Same reasoning as the code above: a resolved row's path is derived
          // from the ERP hierarchy, while the ML's path describes the row IT
          // picked. Keeping the ML's path beside a different row made the
          // suggestion contradict itself (code RES, path "Resistors").
          categoryPath: matchedCat
            ? buildCategoryPath(matchedCat.id, categoryMap)
            : pred.category_path || [],
          // A resolved row's own parent is authoritative: the ML's recorded
          // parent describes ITS resolution, which may not be the row kept
          // above, and the two were previously OR'd together, so a category
          // could come back as its own parent.
          parentCategoryId: matchedCat
            ? matchedCat.parentId
            : pred.parent_category_id,
          parentCategoryCode: pred.parent_category_code,
          suggestedParent: pred.suggested_parent,
          proposedDescription: pred.proposed_description,
          confidence: pred.confidence,
          confidenceLevel:
            pred.confidence_level ||
            (pred.confidence >= 0.85
              ? 'HIGH'
              : pred.confidence >= 0.6
                ? 'MEDIUM'
                : 'LOW'),
          evidence: pred.evidence || [],
          candidates: pred.candidates?.map((candidate) => ({
            categoryId: candidate.category_id || null,
            categoryName: candidate.category_name,
            categoryCode: candidate.category_code || null,
            categoryPath: candidate.category_path || [],
            confidence: candidate.confidence,
            evidence: candidate.evidence || [],
          })),
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

      // The deterministic path resolves the same way the ML path does, so a name
      // shared by two rows lands on the pack's category here as well. Only the
      // name is known on this path, so that is all the resolver is given.
      const matchedEntry = resolveCategorySuggestion(
        { categoryName: matchedName },
        allCategories,
        packCategoryDeclarations,
      );
      const dbCat = matchedEntry?.category ?? null;
      primaryCategory = {
        resolution: dbCat ? 'EXISTING' : 'NEW_CANDIDATE',
        categoryId: dbCat?.id || null,
        categoryCode: dbCat?.code,
        categoryName: 'Electronic Components',
        subcategoryId: dbCat?.parentId ? dbCat.id : null,
        subcategoryCode: dbCat?.parentId ? dbCat.code : undefined,
        subcategoryName: matchedName,
        categoryPath: dbCat ? buildCategoryPath(dbCat.id, categoryMap) : [],
        parentCategoryId: dbCat?.parentId || null,
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
    let mfgName: string | null = null;
    let mfgResolution: 'EXISTING' | 'NEW_CANDIDATE' | 'UNKNOWN' = 'UNKNOWN';
    let mfgId: string | null = null;
    let mfgCode: string | undefined;
    let mfgConf = 0.5;
    let mfgConfLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let mfgType = 'fallback';
    let mfgEvidence: EvidenceItemDto[] = [];

    if (mlResponse) {
      mfgName = mlResponse.manufacturer.manufacturer || null;
      mfgResolution =
        mlResponse.manufacturer.resolution ||
        (mfgName ? 'NEW_CANDIDATE' : 'UNKNOWN');
      mfgId = mlResponse.manufacturer.manufacturer_id || null;
      mfgCode = mlResponse.manufacturer.code || undefined;
      mfgConf = mlResponse.manufacturer.confidence;
      mfgConfLevel =
        mlResponse.manufacturer.confidence_level ||
        (mfgConf >= 0.85 ? 'HIGH' : 'MEDIUM');
      mfgType = mlResponse.manufacturer.match_type;
      mfgEvidence = mlResponse.manufacturer.evidence || [];
    } else {
      // Deterministic fallback uses only current ERP records and Data Pack rules.
      const upperPn = partNumber.toUpperCase();
      const lowerInput = `${partNumber} ${description}`.toLowerCase();
      let matchedName: string | null = null;
      let matchedCode: string | undefined;

      for (const hint of datapackHints) {
        if (hint.manufacturerHints) {
          for (const mfgHint of hint.manufacturerHints) {
            if (mfgHint.prefixPatterns) {
              for (const pat of mfgHint.prefixPatterns) {
                try {
                  if (new RegExp(pat, 'i').test(upperPn)) {
                    matchedName = mfgHint.name;
                    matchedCode = mfgHint.code;
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
                    mfgResolution = 'NEW_CANDIDATE';
                    break;
                  }
                } catch {
                  // Ignore invalid regex pattern
                }
              }
            }
            if (matchedName) break;
          }
        }
        if (matchedName) break;
      }

      if (matchedName) {
        mfgName = matchedName;
        mfgCode = matchedCode;
        const exactDataPackManufacturer = allManufacturers.find(
          (manufacturer) =>
            manufacturer.name.toLowerCase() === matchedName?.toLowerCase() ||
            manufacturer.code.toLowerCase() === matchedCode?.toLowerCase(),
        );
        if (exactDataPackManufacturer) {
          mfgResolution = 'EXISTING';
          mfgId = exactDataPackManufacturer.id;
        }
      }

      if (!matchedName) {
        const exact = allManufacturers.find((manufacturer) =>
          [manufacturer.name, manufacturer.code].some((value) =>
            lowerInput.includes(value.toLowerCase()),
          ),
        );
        if (exact) {
          matchedName = exact.name;
          matchedCode = exact.code;
          mfgResolution = 'EXISTING';
          mfgId = exact.id;
          mfgConf = 0.95;
          mfgConfLevel = 'HIGH';
          mfgType = 'erp';
          mfgEvidence = [
            {
              type: 'exact_erp_match',
              description: `Matched active ERP manufacturer '${exact.name}' in supplied text`,
              weight: 0.95,
              source: 'erp:manufacturers',
            },
          ];
        }
      }

      if (!mfgEvidence.length) {
        mfgEvidence = [
          {
            type: 'classifier',
            description:
              'ML unavailable and no ERP or Data Pack manufacturer evidence matched',
            weight: 0.3,
            source: 'resolver:fallback',
          },
        ];
      }
    }

    const resolvedManufacturer =
      (mfgId &&
        allManufacturers.find((manufacturer) => manufacturer.id === mfgId)) ||
      allManufacturers.find(
        (manufacturer) =>
          Boolean(mfgName) &&
          (manufacturer.name.toLowerCase() === mfgName!.toLowerCase() ||
            manufacturer.code.toLowerCase() === mfgName!.toLowerCase()),
      );

    manufacturerSuggestion = {
      resolution: resolvedManufacturer ? 'EXISTING' : mfgResolution,
      manufacturerId: resolvedManufacturer?.id || null,
      manufacturerCode: resolvedManufacturer?.code || mfgCode,
      manufacturerName: resolvedManufacturer?.name || mfgName,
      confidence: mfgConf,
      confidenceLevel: mfgConfLevel,
      matchType: mfgType,
      evidence: mfgEvidence,
      candidates: mlResponse?.manufacturer.candidates?.map((candidate) => ({
        manufacturerId: candidate.manufacturer_id || null,
        name: candidate.name,
        manufacturerCode: candidate.code || null,
        confidence: candidate.confidence,
        evidence: candidate.evidence || [],
      })),
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
      const dbDef = resolveAttributeDefinition(key, allAttributes);
      const normalizedUnit = normalizeExtractedUnit(key, raw.unit);
      const numericValue =
        (key === 'power' || key === 'power_rating') &&
        typeof raw.value === 'string' &&
        /^\d+(?:\.\d+)?$/.test(raw.value)
          ? Number(raw.value)
          : raw.value;
      const formatted =
        key === 'power' && normalizedUnit
          ? `${numericValue}${normalizedUnit}`
          : raw.formatted;

      resolvedAttributes[key] = {
        code: key,
        attributeDefinitionId: dbDef?.id || null,
        value: numericValue,
        unit: normalizedUnit,
        formatted,
        resolution: dbDef ? 'RESOLVED' : 'UNRESOLVED',
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

    // 6b. Attribute relevance: the bindings of the resolved (or explicitly
    // selected) category, the Data Pack's expectations, the text the extractor
    // read, and what the component already records — with a value only where
    // the evidence supports one.
    const attributeSuggestions = await this.buildComponentAttributeSuggestions({
      dto,
      primaryCategory,
      alternativeCategories,
      allCategories,
      allAttributes,
      datapackHints,
      resolvedAttributes,
    });

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
    const suggestedName = composeComponentName(
      resolvedAttributes,
      primaryCategory,
      description,
    );
    const suggestedDescription = composeComponentDescription(
      resolvedAttributes,
      primaryCategory,
      description,
    );

    return {
      query,
      manufacturerPartNumber: partNumber || undefined,
      suggestedName,
      suggestedDescription,
      suggestedUnit: 'pcs',
      category: primaryCategory,
      alternativeCategories,
      manufacturer: manufacturerSuggestion,
      isDuplicate: duplicateWarnings.length > 0,
      duplicateWarnings,
      attributes: resolvedAttributes,
      attributeSuggestions,
      confidenceLevel: overallConfLevel,
      overallEvidence,
      isMlActive,
      executionTimeMs: Math.round(elapsed * 100) / 100,
    };
  }

  /**
   * Relevant attributes for the part, with a value only where evidence exists.
   *
   * The category's bindings are the strong prior — an explicit configuration
   * decision — but they are not the ceiling: an attribute can also be
   * established by a Data Pack expectation, by the query/description/datasheet
   * text naming it, by the extractor producing a value for it, or by the
   * component already recording one. Every candidate resolves to an existing
   * active attribute definition, and every suggested value is one the manual
   * editor could have picked — the relevance layer never invents either.
   *
   * A category the reviewer selected by hand conditions the relevance on its
   * own, because that is the list they asked to see; otherwise the predicted
   * category is used, together with any alternative still plausible enough to be
   * a real possibility.
   */
  private async buildComponentAttributeSuggestions(input: {
    dto: SuggestComponentDto;
    primaryCategory: CategorySuggestionDto | null;
    alternativeCategories: CategorySuggestionDto[];
    allCategories: Array<{
      id: string;
      code: string;
      name: string;
      parentId: string | null;
    }>;
    allAttributes: SimpleAttributeDef[];
    datapackHints: DataPackHint[];
    resolvedAttributes: Record<string, ExtractedAttributeDto>;
  }): Promise<AttributeSuggestionDto[]> {
    const categoryMap = new Map(
      input.allCategories.map((category) => [category.id, category]),
    );

    // 1. Which categories condition the relevance.
    const conditioning: Array<{
      category: {
        id: string;
        code: string;
        name: string;
        parentId: string | null;
      };
      confidence: number;
      confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      isPrimary: boolean;
    }> = [];

    if (input.dto.categoryId) {
      const selected = categoryMap.get(input.dto.categoryId);
      if (!selected) {
        throw new NotFoundException(
          `Category #${input.dto.categoryId} not found`,
        );
      }
      conditioning.push({
        category: selected,
        confidence: 1,
        confidenceLevel: 'HIGH',
        isPrimary: true,
      });
    } else {
      const considered = [
        input.primaryCategory,
        ...input.alternativeCategories,
      ].filter((category): category is CategorySuggestionDto =>
        Boolean(category?.categoryId),
      );
      for (const [index, suggestion] of considered.entries()) {
        if (
          index > 0 &&
          suggestion.confidence < CATEGORY_RELEVANCE_CONFIDENCE_THRESHOLD
        ) {
          continue;
        }
        const category = categoryMap.get(suggestion.categoryId!);
        if (!category) continue;
        conditioning.push({
          category,
          confidence: suggestion.confidence,
          confidenceLevel: suggestion.confidenceLevel,
          isPrimary: index === 0,
        });
      }
    }

    if (conditioning.length === 0) return [];

    // 2. Bindings (with parent inheritance), the option catalog and — when the
    // reviewer is editing — the values the component already records. Three
    // bounded reads for the whole suggestion, never one per attribute.
    const [bindings, optionRows, existingValues] = await Promise.all([
      Promise.all(
        conditioning.map(async (entry) => ({
          ...entry,
          bindings: await this.loadResolvedCategoryBindings(
            entry.category.id,
            categoryMap,
          ),
        })),
      ),
      db
        .select({
          definitionId: attributeOptions.attributeDefinitionId,
          code: attributeOptions.code,
          label: attributeOptions.label,
        })
        .from(attributeOptions)
        .where(eq(attributeOptions.isActive, true)),
      input.dto.componentId
        ? loadComponentAttributeDisplays(input.dto.componentId)
        : Promise.resolve(new Map<string, string>()),
    ]);

    const optionsByDefinition = new Map<
      string,
      Array<{ code: string; label: string }>
    >();
    for (const option of optionRows) {
      const list = optionsByDefinition.get(option.definitionId) ?? [];
      list.push({ code: option.code, label: option.label });
      optionsByDefinition.set(option.definitionId, list);
    }

    const definitions: RelevanceDefinition[] = input.allAttributes.map(
      (definition) => ({
        id: definition.id,
        code: definition.code,
        name: definition.name,
        dataType: definition.dataType ?? 'TEXT',
        unitCategory: definition.unitCategory ?? null,
        defaultUnit: definition.defaultUnit ?? null,
        aliases: definition.aliases ?? [],
        validationRules:
          definition.validationRules &&
          typeof definition.validationRules === 'object' &&
          !Array.isArray(definition.validationRules)
            ? (definition.validationRules as Record<string, unknown>)
            : null,
        isActive: definition.isActive ?? true,
        options: optionsByDefinition.get(definition.id) ?? [],
      }),
    );

    // 3. Data Pack expectations for the considered categories. The pack's own
    // codes (`voltage`, `current`, `power`) go through the existing alias map so
    // they land on the definitions they name (`voltage_rating`, ...).
    const packExpectations: RelevancePackExpectation[] = [];
    for (const entry of bindings) {
      for (const hint of input.datapackHints) {
        if (!this.hintMatchesCategory(hint, entry.category)) continue;
        for (const code of hint.expectedAttributes ?? []) {
          const definition = resolveAttributeDefinition(
            code,
            input.allAttributes,
          );
          if (!definition) continue;
          packExpectations.push({
            definitionId: definition.id,
            categoryId: entry.category.id,
            categoryName: entry.category.name,
            aliases: hint.attributeAliases?.[code] ?? [],
            reason: `Data Pack expects ${definition.name} for ${entry.category.name}`,
          });
        }
      }
    }

    // 4. What the extractor already produced, in definition terms. Attributes it
    // could not resolve to a definition stay in `attributes` (the reviewer still
    // sees the extracted value and the unresolved badge) rather than being
    // guessed onto one.
    const extracted: RelevanceExtractedAttribute[] = [];
    for (const attribute of Object.values(input.resolvedAttributes)) {
      if (!attribute.attributeDefinitionId) continue;
      extracted.push({
        definitionId: attribute.attributeDefinitionId,
        value: attribute.value,
        unit: attribute.unit ?? null,
        formatted: attribute.formatted,
        confidence: attribute.confidence,
        confidenceLevel: attribute.confidenceLevel,
        evidence: attribute.evidence,
      });
    }

    const packageDefinition = resolveAttributeDefinition(
      'package',
      input.allAttributes,
    );
    const mountingTypeDefinition = resolveAttributeDefinition(
      'mounting_type',
      input.allAttributes,
    );

    // 5. The model service's own judgement, as a corroborating source.
    //
    // Failure is not propagated: when the service is disabled or times out the
    // local evidence still produces the full list, which is what keeps Component
    // Intelligence working with the ML container down.
    const mlSuggestions = await this.loadMlAttributeSuggestions({
      dto: input.dto,
      conditioning,
      definitions,
      extracted,
      existingValues,
    });

    const suggestions = buildAttributeSuggestions({
      definitions,
      categories: bindings.map((entry) => ({
        categoryId: entry.category.id,
        categoryName: entry.category.name,
        confidence: entry.confidence,
        confidenceLevel: entry.confidenceLevel,
        isPrimary: entry.isPrimary,
        bindings: entry.bindings,
      })),
      packExpectations,
      extracted,
      text: [
        input.dto.query,
        input.dto.partNumber ?? '',
        input.dto.description ?? '',
        input.dto.datasheetText ?? '',
      ],
      existingValues,
      units: existingValues.size > 0 ? await loadUnitCatalog() : [],
      packageDefinitionId: packageDefinition?.id ?? null,
      mountingTypeDefinitionId: mountingTypeDefinition?.id ?? null,
      mlSuggestions,
    });

    return suggestions.map((suggestion) => ({
      attributeDefinitionId: suggestion.attributeDefinitionId,
      code: suggestion.code,
      name: suggestion.name,
      dataType: suggestion.dataType,
      unitCategory: suggestion.unitCategory,
      defaultUnit: suggestion.defaultUnit,
      isRequired: suggestion.isRequired,
      categoryIds: suggestion.categoryIds,
      consideredCategoryIds: suggestion.consideredCategoryIds,
      relevance: suggestion.relevance,
      valueEvidence: suggestion.valueEvidence,
      suggestedValue: suggestion.suggestedValue,
      confidence: suggestion.confidence,
      confidenceLevel: suggestion.confidenceLevel,
      existingDisplay: suggestion.existingDisplay,
      existingMatches: suggestion.existingMatches,
      conflict: suggestion.conflict,
    }));
  }

  /**
   * Asks the model service what it judges about this component's specifications.
   *
   * One batched call, never one per attribute. The catalog, the bindings and the
   * extraction are sent along so the service adds judgement rather than repeating
   * reads the API has already done — and a reply naming an attribute the catalog
   * does not hold is dropped, because a value must resolve to a real definition.
   *
   * Best-effort by design: `null` (the service being disabled, slow or
   * unreachable) leaves the locally derived suggestions exactly as they were.
   */
  private async loadMlAttributeSuggestions(input: {
    dto: SuggestComponentDto;
    conditioning: ReadonlyArray<{
      category: { id: string; code: string; name: string };
      confidence: number;
    }>;
    definitions: RelevanceDefinition[];
    extracted: RelevanceExtractedAttribute[];
    existingValues: ReadonlyMap<string, string>;
  }): Promise<MlAttributeSuggestion[]> {
    if (!this.mlClient.enabled || input.conditioning.length === 0) return [];

    const boundIds = await this.loadBindingIds(
      input.conditioning.map((entry) => entry.category.id),
    );

    const response = await this.mlClient.suggestComponentAttributes({
      query: input.dto.query,
      partNumber: input.dto.partNumber,
      description: input.dto.description,
      datasheetText: input.dto.datasheetText,
      categories: input.conditioning.map((entry) => ({
        categoryId: entry.category.id,
        categoryCode: entry.category.code,
        categoryName: entry.category.name,
        confidence: entry.confidence,
      })),
      attributes: input.definitions.map((definition) => ({
        id: definition.id,
        code: definition.code,
        name: definition.name,
        dataType: definition.dataType,
        unitCategory: definition.unitCategory ?? null,
        defaultUnit: definition.defaultUnit ?? null,
        aliases: [...(definition.aliases ?? [])],
        options: [...(definition.options ?? [])],
      })),
      boundAttributeIds: boundIds,
      existingValues: Object.fromEntries(
        input.definitions.flatMap((definition) => {
          const display = input.existingValues.get(definition.id);
          // Only recorded values are sent: an empty display is the absence of a
          // value, and sending it would claim the component specifies nothing.
          return display && display.length > 0
            ? [[definition.code, display] as const]
            : [];
        }),
      ),
      extractedAttributes: Object.fromEntries(
        input.extracted.map((attribute) => {
          const definition = input.definitions.find(
            (candidate) => candidate.id === attribute.definitionId,
          );
          return [
            definition?.code ?? attribute.definitionId,
            // The extractor's evidence is deliberately NOT sent: this service
            // already carries it on the same attribute, and passing it back so it
            // can be returned would list every source twice.
            {
              code: definition?.code ?? attribute.definitionId,
              value: attribute.value,
              unit: attribute.unit ?? null,
              formatted: attribute.formatted,
              confidence: attribute.confidence,
              confidence_level: attribute.confidenceLevel,
            },
          ];
        }),
      ),
    });

    if (!response) return [];

    // Only suggestions that name a definition this catalog actually holds, and
    // only definitions that are active: a reply cannot introduce an attribute.
    const known = new Set(
      input.definitions
        .filter((definition) => definition.isActive)
        .map((definition) => definition.id),
    );
    return response.flatMap((suggestion) =>
      suggestion.attributeDefinitionId &&
      known.has(suggestion.attributeDefinitionId)
        ? [
            {
              attributeDefinitionId: suggestion.attributeDefinitionId,
              code: suggestion.code,
              suggestedValue: suggestion.suggestedValue ?? null,
              formatted: suggestion.formatted ?? null,
              confidence: suggestion.confidence ?? null,
              confidenceLevel: suggestion.confidenceLevel ?? null,
              relevance: (suggestion.relevance ?? []).map((item) =>
                toRelevanceEvidence(item),
              ),
              valueEvidence: (suggestion.valueEvidence ?? []).map((item) =>
                toRelevanceEvidence(item),
              ),
            },
          ]
        : [],
    );
  }

  /**
   * The attribute definition ids bound to any of the conditioning categories.
   *
   * One query for all of them: the bindings condition relevance, and asking per
   * category would be the N+1 the intelligence pipeline is meant to avoid.
   */
  private async loadBindingIds(categoryIds: string[]): Promise<string[]> {
    const rows = await db
      .select({
        attributeDefinitionId: categoryAttributes.attributeDefinitionId,
      })
      .from(categoryAttributes)
      .where(inArray(categoryAttributes.categoryId, categoryIds));
    return [...new Set(rows.map((row) => row.attributeDefinitionId))];
  }

  /**
   * The bindings that apply to a category, inherited ones included.
   *   * Mirrors `GetCategoryAttributes`'s resolution — walk to the root, merge
   * root-to-leaf, let the nearest binding win — because the component form and
   * the Manage Attributes dialog both render the resolved list from that use
   * case, and a suggestion must never disagree with the editor about which
   * specifications a category has.
   */
  private async loadResolvedCategoryBindings(
    categoryId: string,
    categoryMap: Map<string, { id: string; parentId: string | null }>,
  ): Promise<RelevanceBinding[]> {
    const ancestryIds: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = categoryId;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      ancestryIds.push(currentId);
      currentId = categoryMap.get(currentId)?.parentId ?? null;
    }

    const rows = await db
      .select({
        attributeDefinitionId: categoryAttributes.attributeDefinitionId,
        categoryId: categoryAttributes.categoryId,
        isRequired: categoryAttributes.isRequired,
        sortOrder: categoryAttributes.sortOrder,
      })
      .from(categoryAttributes)
      .where(inArray(categoryAttributes.categoryId, ancestryIds));

    const merged = new Map<string, RelevanceBinding>();
    for (const ancestorId of [...ancestryIds].reverse()) {
      for (const row of rows) {
        if (row.categoryId !== ancestorId) continue;
        const existing = merged.get(row.attributeDefinitionId);
        merged.set(row.attributeDefinitionId, {
          attributeDefinitionId: row.attributeDefinitionId,
          isRequired: row.isRequired,
          sortOrder: row.sortOrder,
          // The category itself owns the binding; only an ancestor is reported
          // as the source of an inherited one.
          inheritedFromCategoryId:
            ancestorId === categoryId
              ? null
              : (existing?.inheritedFromCategoryId ?? ancestorId),
        });
      }
    }
    return [...merged.values()];
  }

  /**
   * Whether a Data Pack hint describes this category.
   *
   * Codes must match exactly (normalized); names may match by containment, which
   * is the rule the attribute-library suggestions already apply and is what lets
   * a pack's "Capacitors" reach a category named "Capacitors (MLCC)".
   */
  private hintMatchesCategory(
    hint: DataPackHint,
    category: { code: string; name: string },
  ): boolean {
    if (
      hint.categoryCode &&
      normalizedTerm(hint.categoryCode) === normalizedTerm(category.code)
    ) {
      return true;
    }
    const categoryName = normalizedTerm(category.name);
    if (!hint.categoryName || categoryName.length === 0) return false;
    const hintName = normalizedTerm(hint.categoryName);
    return (
      hintName === categoryName ||
      categoryName.includes(hintName) ||
      hintName.includes(categoryName)
    );
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
      attributeDefinitionId: dto.attributeDefinitionId || null,
      categoryId: dto.categoryId || null,
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

  /**
   * Writes a JSON document so a reader never observes a partial file.
   *
   * Pass 6. The training-state files were written with a bare
   * `fs.writeFileSync(path, json)`, which truncates the target and then writes it.
   * A crash, a kill or a full disk between those two steps leaves a truncated or
   * empty file — and the next read treats an unparseable file as "no records", so
   * the corruption is silent. That is the demonstrated risk this replaces.
   *
   * `writeFileSync` to a sibling temp file followed by `renameSync` is atomic on
   * POSIX within one filesystem: a reader sees either the old file or the new one,
   * never a half-written one. The temp file is a sibling rather than in `/tmp`
   * precisely because `rename` is only atomic within a filesystem.
   *
   * What this does NOT fix, stated so it is not mistaken for more than it is:
   *
   *  - **Lost updates.** Two concurrent reviews still read-modify-write the same
   *    array, and one update can overwrite the other. Fixing that needs real
   *    locking or real storage, which is out of scope for this pass.
   *  - **Multi-instance safety.** Nothing here coordinates two API replicas.
   *  - **Production reachability.** These paths resolve relative to the API
   *    process's working directory, and the production API image does not contain
   *    `apps/ml/data` at all, so both training routes are inert in a container. The
   *    exposure today is a developer running the API locally, where the resolved
   *    path is the git-tracked `apps/ml/data/*.json`.
   *
   * The durable fix — training state in PostgreSQL, or at minimum a configured
   * volume-backed directory — is recorded for a later pass rather than attempted
   * here.
   */
  private writeJsonAtomically(filePath: string, value: unknown): void {
    const directory = path.dirname(filePath);
    const tempPath = path.join(
      directory,
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      // Leaving a temp file behind would accumulate across failures, and a stale
      // `.tmp` next to a tracked JSON file is noise in every `git status`.
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // The temp file may never have been created; nothing to clean up.
      }
      throw error;
    }
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
        /**
         * Reviewer email, or `null` when no identity was supplied.
         *
         * `null` is representable because the honest record of "we do not know who
         * reviewed this" is an absent reviewer, not a fabricated one.
         */
        reviewerEmail?: string | null;
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
      // The reviewer is the authenticated principal. This previously fell back to
      // the literal string `admin@ananya.internal`, which fabricated a reviewer for
      // an anonymous caller — the route is now administrator-guarded, so an absent
      // identity means something is wrong with the guard wiring rather than a
      // legitimate anonymous review. Recording `null` is honest; inventing an
      // administrator is not.
      target.reviewerEmail = user?.email ?? null;
      if (dto.reviewerNotes) target.reviewerNotes = dto.reviewerNotes;

      const rec = target.record;
      if (dto.resolvedCategory && rec) rec.category = dto.resolvedCategory;
      if (dto.resolvedManufacturer && rec)
        rec.manufacturer = dto.resolvedManufacturer;

      this.writeJsonAtomically(quarantinePath, items);

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
        this.writeJsonAtomically(validatedPath, validatedRecords);
      }

      return { success: true, message: `Record ${id} marked as ${dto.status}` };
    } catch (e) {
      return {
        success: false,
        message: `Failed to review record: ${String(e)}`,
      };
    }
  }

  // =========================================================================
  // Attribute Intelligence (RFC-0059)
  // =========================================================================

  async suggestAttributeBindings(
    dto: SuggestAttributeBindingsDto,
  ): Promise<SuggestAttributeBindingsResponseDto> {
    const t0 = performance.now();
    const attrName = dto.attributeName.trim();
    const attrCode =
      dto.attributeCode?.trim() ||
      attrName.toLowerCase().replace(/[\s-]+/g, '_');

    // 1. Load active categories and Data Pack hints
    const [allCategories, datapackHints] = await Promise.all([
      db.select().from(categories).where(eq(categories.isActive, true)),
      this.dataPacksService
        ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
        : Promise.resolve([]),
    ]);

    // 2. Count component usage per category for this attribute if attributeId is provided
    const componentCounts: Record<string, number> = {};
    if (dto.attributeId) {
      const compAttrRows = await db
        .select({
          componentId: componentAttributeValues.componentId,
        })
        .from(componentAttributeValues)
        .where(
          eq(componentAttributeValues.attributeDefinitionId, dto.attributeId),
        )
        .limit(200);

      if (compAttrRows.length > 0) {
        const compIds = compAttrRows.map((r) => r.componentId);
        const comps = await db
          .select({
            categoryId: components.categoryId,
          })
          .from(components)
          .where(inArray(components.id, compIds));

        for (const c of comps) {
          if (c.categoryId) {
            componentCounts[c.categoryId] =
              (componentCounts[c.categoryId] || 0) + 1;
          }
        }
      }
    }

    // 3. Try ananya-ml microservice
    let isMlActive = false;
    if (this.mlClient.enabled) {
      const mlSuggestions = await this.mlClient.suggestAttributeBindings({
        attributeName: attrName,
        attributeCode: attrCode,
        description: dto.description,
        dataType: dto.dataType,
        unitCategory: dto.unitCategory,
        categories: allCategories.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
        })),
        datapack_hints: datapackHints,
        component_category_counts: componentCounts,
      });

      if (mlSuggestions) {
        isMlActive = true;
        const executionTimeMs = Number((performance.now() - t0).toFixed(2));
        return {
          suggestions: mlSuggestions,
          isMlActive,
          executionTimeMs,
        };
      }
    }

    // 4. In-process deterministic fallback
    const suggestions = this.suggestAttributeBindingsFallback(
      attrName,
      attrCode,
      allCategories,
      datapackHints,
      componentCounts,
    );

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      suggestions,
      isMlActive,
      executionTimeMs,
    };
  }

  async suggestCategoryAttributes(
    dto: SuggestCategoryAttributesDto,
  ): Promise<SuggestCategoryAttributesResponseDto> {
    const t0 = performance.now();
    const cat = await db
      .select()
      .from(categories)
      .where(eq(categories.id, dto.categoryId))
      .limit(1);

    const category = cat[0];
    if (!category) {
      return {
        categoryId: dto.categoryId,
        categoryName: 'Unknown',
        suggestions: [],
        isMlActive: false,
        executionTimeMs: 0,
      };
    }

    const [allDefs, boundAttrs, datapackHints] = await Promise.all([
      db
        .select()
        .from(attributeDefinitions)
        .where(eq(attributeDefinitions.isActive, true)),
      db
        .select()
        .from(categoryAttributes)
        .where(eq(categoryAttributes.categoryId, dto.categoryId)),
      this.dataPacksService
        ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
        : Promise.resolve([]),
    ]);

    const boundIds = boundAttrs.map((b) => b.attributeDefinitionId);

    let isMlActive = false;
    if (this.mlClient.enabled) {
      const mlSuggestions = await this.mlClient.suggestCategoryAttributes({
        categoryId: category.id,
        categoryCode: category.code,
        categoryName: category.name,
        existingAttributes: allDefs.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          dataType: d.dataType,
          unitCategory: d.unitCategory,
          defaultUnit: d.defaultUnit,
          groupName: d.groupName,
          aliases: (d.aliases as string[]) || [],
        })),
        boundAttributeIds: boundIds,
        datapack_hints: datapackHints,
      });

      if (mlSuggestions) {
        isMlActive = true;
        const executionTimeMs = Number((performance.now() - t0).toFixed(2));
        return {
          categoryId: category.id,
          categoryName: category.name,
          suggestions: mlSuggestions,
          isMlActive,
          executionTimeMs,
        };
      }
    }

    // In-process fallback
    const suggestions = this.suggestCategoryAttributesFallback(
      category,
      allDefs,
      boundIds,
      datapackHints,
    );

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      categoryId: category.id,
      categoryName: category.name,
      suggestions,
      isMlActive,
      executionTimeMs,
    };
  }

  async suggestAttributeConfig(
    dto: SuggestAttributeConfigDto,
  ): Promise<SuggestAttributeConfigResponseDto> {
    const t0 = performance.now();
    const cleanName = dto.name.trim();

    const [allDefs, datapackHints] = await Promise.all([
      db
        .select()
        .from(attributeDefinitions)
        .where(eq(attributeDefinitions.isActive, true)),
      this.dataPacksService
        ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
        : Promise.resolve([]),
    ]);

    let isMlActive = false;
    if (this.mlClient.enabled) {
      const mlRes = await this.mlClient.suggestAttributeConfig({
        name: cleanName,
        description: dto.description,
        existingAttributes: allDefs.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          dataType: d.dataType,
          unitCategory: d.unitCategory,
          defaultUnit: d.defaultUnit,
          groupName: d.groupName,
          aliases: (d.aliases as string[]) || [],
        })),
        datapack_hints: datapackHints,
      });

      if (mlRes) {
        isMlActive = true;
        const executionTimeMs = Number((performance.now() - t0).toFixed(2));
        return {
          suggestion: mlRes,
          isMlActive,
          executionTimeMs,
        };
      }
    }

    // Fallback
    const suggestion = this.suggestAttributeConfigFallback(
      cleanName,
      dto.description,
      allDefs,
    );

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      suggestion,
      isMlActive,
      executionTimeMs,
    };
  }

  async detectAttributeDuplicates(
    dto: DetectAttributeDuplicatesDto,
  ): Promise<DetectAttributeDuplicatesResponseDto> {
    const t0 = performance.now();
    const cleanName = dto.name.trim();

    const [allDefs, allBindings, datapackHints] = await Promise.all([
      db.select().from(attributeDefinitions),
      db.select().from(categoryAttributes),
      this.dataPacksService
        ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
        : Promise.resolve([]),
    ]);

    let isMlActive = false;
    if (this.mlClient.enabled) {
      const mlRes = await this.mlClient.detectAttributeDuplicates({
        name: cleanName,
        code: dto.code,
        existingAttributes: allDefs.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          dataType: d.dataType,
          unitCategory: d.unitCategory,
          defaultUnit: d.defaultUnit,
          groupName: d.groupName,
          aliases: (d.aliases as string[]) || [],
        })),
        existingBindings: allBindings.map((b) => ({
          categoryId: b.categoryId,
          attributeDefinitionId: b.attributeDefinitionId,
          isRequired: b.isRequired,
        })),
        threshold: dto.threshold,
        datapack_hints: datapackHints,
      });

      if (mlRes) {
        isMlActive = true;
        const executionTimeMs = Number((performance.now() - t0).toFixed(2));
        return {
          isDuplicate: mlRes.isDuplicate,
          matches: mlRes.matches,
          suggestedAliases: mlRes.suggestedAliases,
          isMlActive,
          executionTimeMs,
        };
      }
    }

    // In-process fallback
    const result = this.detectAttributeDuplicatesFallback(
      cleanName,
      dto.code,
      allDefs,
      allBindings,
      dto.threshold ?? 0.7,
    );

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      isDuplicate: result.isDuplicate,
      matches: result.matches,
      suggestedAliases: result.suggestedAliases,
      isMlActive,
      executionTimeMs,
    };
  }

  async suggestEnumValues(
    dto: SuggestEnumValuesDto,
  ): Promise<SuggestEnumValuesResponseDto> {
    const t0 = performance.now();
    const datapackHints = this.dataPacksService
      ? await this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
      : [];

    let isMlActive = false;
    if (this.mlClient.enabled) {
      const mlRes = await this.mlClient.suggestEnumValues({
        attributeCode: dto.attributeCode,
        attributeName: dto.attributeName,
        existingOptions: dto.existingOptions,
        datapack_hints: datapackHints,
      });

      if (mlRes) {
        isMlActive = true;
        const executionTimeMs = Number((performance.now() - t0).toFixed(2));
        return {
          suggestedOptions: mlRes,
          isMlActive,
          executionTimeMs,
        };
      }
    }

    // In-process fallback
    const suggested = this.suggestEnumValuesFallback(
      dto.attributeCode,
      dto.attributeName,
      dto.existingOptions || [],
      datapackHints,
    );

    // If attributeId is provided, also check historical values from componentAttributeValues
    if (dto.attributeId) {
      try {
        const existingSet = new Set([
          ...(dto.existingOptions || []).map((o) => o.toLowerCase()),
          ...suggested.map((s) => s.code.toLowerCase()),
          ...suggested.map((s) => s.label.toLowerCase()),
        ]);

        const compValues = await db
          .select({ value: componentAttributeValues.textValue })
          .from(componentAttributeValues)
          .where(
            eq(componentAttributeValues.attributeDefinitionId, dto.attributeId),
          )
          .limit(100);

        const freqMap = new Map<string, number>();
        for (const row of compValues) {
          if (row.value && typeof row.value === 'string' && row.value.trim()) {
            const val = row.value.trim();
            if (!existingSet.has(val.toLowerCase()) && val.length <= 40) {
              freqMap.set(val, (freqMap.get(val) || 0) + 1);
            }
          }
        }

        for (const [val, count] of freqMap.entries()) {
          const confidence = count >= 3 ? 0.92 : 0.85;
          suggested.push({
            code: val.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
            label: val,
            source: 'database:component_attribute_values',
            provenance: 'database:component_attribute_values',
            confidence,
            confidenceLevel: confidence >= 0.9 ? 'HIGH' : 'MEDIUM',
          });
        }
      } catch {
        // ignore DB query error
      }
    }

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      suggestedOptions: suggested,
      isMlActive,
      executionTimeMs,
    };
  }

  async auditAttributeLibrary(): Promise<AuditAttributeLibraryResponseDto> {
    const t0 = performance.now();
    const [allDefs, allCats, allBindings, allCompValues, datapackHints] =
      await Promise.all([
        db.select().from(attributeDefinitions),
        db.select().from(categories),
        db.select().from(categoryAttributes),
        db.select().from(componentAttributeValues).limit(500),
        this.dataPacksService
          ? this.dataPacksService.getActiveIntelligenceHints().catch(() => [])
          : Promise.resolve([]),
      ]);

    const compCountsByAttr: Record<string, number> = {};
    const compCountsByCatAttr: Record<string, number> = {};
    for (const cv of allCompValues) {
      compCountsByAttr[cv.attributeDefinitionId] =
        (compCountsByAttr[cv.attributeDefinitionId] || 0) + 1;
    }

    let isMlActive = false;
    if (this.mlClient.enabled) {
      const mlRes = await this.mlClient.auditAttributeLibrary({
        attributes: allDefs.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          dataType: d.dataType,
          unitCategory: d.unitCategory,
          defaultUnit: d.defaultUnit,
          groupName: d.groupName,
          aliases: (d.aliases as string[]) || [],
        })),
        categories: allCats.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
        })),
        bindings: allBindings.map((b) => {
          const cat = allCats.find((c) => c.id === b.categoryId);
          const def = allDefs.find((d) => d.id === b.attributeDefinitionId);
          return {
            categoryId: b.categoryId,
            categoryCode: cat?.code,
            categoryName: cat?.name,
            attributeDefinitionId: b.attributeDefinitionId,
            attributeCode: def?.code,
            isRequired: b.isRequired,
          };
        }),
        componentCountsByAttribute: compCountsByAttr,
        componentCountsByCategoryAttribute: compCountsByCatAttr,
        datapack_hints: datapackHints,
      });

      if (mlRes) {
        isMlActive = true;
        const executionTimeMs = Number((performance.now() - t0).toFixed(2));
        const enrichedIssues = mlRes.issues.map((issue) => {
          let attrId = issue.attributeId;
          let attrCode = issue.attributeCode;
          let attrName = issue.attributeName;
          let payload = issue.payload || {};

          if (!attrId) {
            const normCode = (attrCode || '')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
            const normName = (attrName || '')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
            const matched = allDefs.find((d) => {
              const dCode = d.code.toLowerCase().replace(/[^a-z0-9]/g, '');
              const dName = d.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const dAliases = ((d.aliases as string[]) || []).map((a) =>
                a.toLowerCase().replace(/[^a-z0-9]/g, ''),
              );
              return (
                (normCode &&
                  (dCode === normCode || dAliases.includes(normCode))) ||
                (normName &&
                  (dName === normName ||
                    dCode === normName ||
                    dAliases.includes(normName)))
              );
            });

            if (matched) {
              attrId = matched.id;
              attrCode = matched.code;
              attrName = matched.name;
              payload = {
                ...payload,
                isExisting: true,
                canonicalCode: matched.code,
                dataType: matched.dataType,
                unitCategory: matched.unitCategory,
                defaultUnit: matched.defaultUnit,
                group: matched.groupName,
              };
            } else {
              // Check CANONICAL_PARAM_FALLBACK
              for (const item of Object.values(CANONICAL_PARAM_FALLBACK)) {
                const pCode = item.code.toLowerCase().replace(/[^a-z0-9]/g, '');
                const pName = item.canonical
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '');
                if (normCode === pCode || normName === pName) {
                  payload = {
                    ...payload,
                    isExisting: false,
                    canonicalCode: item.code,
                    dataType: item.dataType,
                    unitCategory: item.unitCategory,
                    defaultUnit: item.defaultUnit,
                    group: item.group,
                    suggestedRequired: false,
                  };
                  if (!attrCode) attrCode = item.code;
                  if (!attrName) attrName = item.canonical;
                  break;
                }
              }
            }
          }

          return {
            ...issue,
            attributeId: attrId || null,
            attributeCode: attrCode || null,
            attributeName: attrName || null,
            payload: Object.keys(payload).length > 0 ? payload : undefined,
          };
        });

        return {
          summary: mlRes.summary,
          issues: enrichedIssues,
          isMlActive,
          executionTimeMs,
        };
      }
    }

    // In-process fallback
    const result = this.auditAttributeLibraryFallback(
      allDefs,
      allCats,
      allBindings,
      compCountsByAttr,
      compCountsByCatAttr,
    );

    const executionTimeMs = Number((performance.now() - t0).toFixed(2));
    return {
      summary: result.summary,
      issues: result.issues,
      isMlActive,
      executionTimeMs,
    };
  }

  async applySuggestedBindings(
    dto: ApplySuggestedBindingDto,
    user?: { id?: string; email?: string },
  ): Promise<{ success: boolean; appliedCount: number }> {
    const attr = await db
      .select()
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.id, dto.attributeId))
      .limit(1);

    if (attr.length === 0) {
      throw new Error(`Attribute definition '${dto.attributeId}' not found`);
    }

    const existingBindings = await db
      .select()
      .from(categoryAttributes)
      .where(eq(categoryAttributes.attributeDefinitionId, dto.attributeId));

    const existingCatIds = new Set(existingBindings.map((b) => b.categoryId));
    const toInsert = dto.categoryIds.filter(
      (catId) => !existingCatIds.has(catId),
    );

    if (toInsert.length > 0) {
      const inserts = toInsert.map((catId, idx) => ({
        categoryId: catId,
        attributeDefinitionId: dto.attributeId,
        isRequired: dto.isRequired ?? false,
        sortOrder: (existingBindings.length + idx + 1) * 10,
      }));
      await db.insert(categoryAttributes).values(inserts);

      // Record telemetry feedback
      const feedbackInserts = toInsert.map((catId) => ({
        attributeDefinitionId: dto.attributeId,
        categoryId: catId,
        suggestionType: 'ATTRIBUTE_BINDING',
        field: 'category_binding',
        predictedValue: { categoryId: catId },
        confidence: '0.95',
        confidenceLevel: 'HIGH',
        evidence: [
          {
            type: 'human_confirmation',
            description: 'User accepted and applied suggested category binding',
          },
        ],
        modelVersion: '1.0.0',
        userAction: 'ACCEPTED',
        finalValue: { categoryId: catId, isRequired: dto.isRequired ?? false },
        reviewerId: user?.id || null,
        reviewerEmail: user?.email || null,
      }));
      await db.insert(aiSuggestionFeedback).values(feedbackInserts);
    }

    return { success: true, appliedCount: toInsert.length };
  }

  // -------------------------------------------------------------------------
  // In-Process Deterministic Fallbacks for Attribute Intelligence
  // -------------------------------------------------------------------------

  private suggestAttributeBindingsFallback(
    attributeName: string,
    attributeCode: string,
    allCategories: SimpleCategory[],
    datapackHints: DataPackHint[],
    componentCategoryCounts: Record<string, number>,
  ): AttributeBindingSuggestionDto[] {
    const normName = attributeName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCode = attributeCode.toLowerCase().replace(/[^a-z0-9]/g, '');
    const suggestions: AttributeBindingSuggestionDto[] = [];

    // Check canonical knowledge
    const canonicalItem =
      Object.values(CANONICAL_PARAM_FALLBACK).find((item) => {
        const candidates = [
          item.canonical,
          item.code,
          ...(item.aliases || []),
        ].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
        return candidates.includes(normName) || candidates.includes(normCode);
      }) || null;

    // Check Data Pack expectedAttributes
    const dpExpectedCats = new Set<string>();
    if (datapackHints) {
      for (const hint of datapackHints) {
        const catName = hint.categoryName || hint.categoryCode || '';
        const expected = (hint.expectedAttributes as string[]) || [];
        for (const exp of expected) {
          const normExp = exp.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normName.includes(normExp) || normCode.includes(normExp)) {
            dpExpectedCats.add(catName.toLowerCase());
          }
        }
      }
    }

    for (const cat of allCategories) {
      const evidence: EvidenceItemDto[] = [];
      let score = 0;
      const catNorm = cat.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. Data Pack hint
      if (
        dpExpectedCats.has(cat.name.toLowerCase()) ||
        dpExpectedCats.has(cat.code.toLowerCase())
      ) {
        score += 0.95;
        evidence.push({
          type: 'data_pack_rule',
          description: `Active Data Pack specifies '${attributeName}' for category '${cat.name}'`,
          weight: 0.95,
          source: 'datapack:expected_attributes',
        });
      }

      // 2. Canonical taxonomy
      if (canonicalItem && score === 0) {
        for (const targetCat of canonicalItem.categories) {
          const tNorm = targetCat.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (catNorm.includes(tNorm) || tNorm.includes(catNorm)) {
            score += 0.88;
            evidence.push({
              type: 'taxonomy',
              description: `Standard electrical taxonomy associates '${canonicalItem.canonical}' with '${cat.name}'`,
              weight: 0.88,
              source: 'domain:electronics_standard',
            });
            break;
          }
        }
      }

      // 3. Inventory usage
      const compCount = componentCategoryCounts[cat.id] || 0;
      if (compCount > 0) {
        score = Math.min(1.0, score + 0.1);
        evidence.push({
          type: 'existing_data',
          description: `Used by ${compCount} verified components in '${cat.name}'`,
          weight: 0.85,
          source: 'inventory:verified_components',
        });
      }

      // 4. Lexical fallback
      if (score === 0) {
        const sim = this.computeStringSimilarityFallback(
          cat.name,
          attributeName,
        );
        if (sim > 0.4) {
          score = 0.55;
          evidence.push({
            type: 'classifier',
            description: `Lexical affinity between '${cat.name}' and '${attributeName}' (${Math.round(sim * 100)}%)`,
            weight: 0.55,
            source: 'ngram:similarity',
          });
        }
      }

      if (score > 0.4) {
        const confidence = Number(Math.min(score, 0.99).toFixed(2));
        const confidenceLevel =
          confidence >= 0.85 ? 'HIGH' : confidence >= 0.6 ? 'MEDIUM' : 'LOW';
        suggestions.push({
          categoryId: cat.id,
          categoryCode: cat.code,
          categoryName: cat.name,
          confidence,
          confidenceLevel,
          reason:
            evidence[0]?.description || `Suggested binding for ${cat.name}`,
          evidence,
          modelVersion: '1.0.0-deterministic-fallback',
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  private suggestCategoryAttributesFallback(
    category: SimpleCategory,
    allDefs: SimpleAttributeDef[],
    boundIds: string[],
    datapackHints: DataPackHint[],
  ): CategoryAttributeSuggestionDto[] {
    const normCat = category.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const boundSet = new Set(boundIds);
    const suggestions: CategoryAttributeSuggestionDto[] = [];

    // Collect expected from Data Packs
    const dpExpected = new Set<string>();
    if (datapackHints) {
      for (const hint of datapackHints) {
        const hName = (hint.categoryName || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (hName && (hName.includes(normCat) || normCat.includes(hName))) {
          for (const exp of (hint.expectedAttributes as string[]) || []) {
            dpExpected.add(exp.toLowerCase().replace(/[^a-z0-9]/g, ''));
          }
        }
      }
    }

    for (const def of allDefs) {
      const normDefCode = def.code.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normDefName = def.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      let score = 0;
      const evidence: EvidenceItemDto[] = [];

      if (dpExpected.has(normDefCode) || dpExpected.has(normDefName)) {
        score += 0.98;
        evidence.push({
          type: 'data_pack_rule',
          description: `Standard expected specification in active Data Pack for '${category.name}'`,
          weight: 0.98,
          source: 'datapack:expected_attributes',
        });
      }

      // Check canonical knowledge
      const canonMatch = Object.values(CANONICAL_PARAM_FALLBACK).find(
        (item) => {
          return (
            item.code.toLowerCase().replace(/[^a-z0-9]/g, '') === normDefCode ||
            item.canonical.toLowerCase().replace(/[^a-z0-9]/g, '') ===
              normDefName
          );
        },
      );
      if (canonMatch) {
        if (
          canonMatch.categories.some((tc: string) => {
            const tcNorm = tc.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normCat.includes(tcNorm) || tcNorm.includes(normCat);
          })
        ) {
          score = Math.max(score, 0.92);
          evidence.push({
            type: 'taxonomy',
            description: `Standard electronics engineering parameter for '${category.name}'`,
            weight: 0.92,
            source: 'domain:electronics_standard',
          });
        }
      }

      if (score > 0.5) {
        const confidence = Number(score.toFixed(2));
        const confidenceLevel = confidence >= 0.85 ? 'HIGH' : 'MEDIUM';
        suggestions.push({
          attributeDefinitionId: def.id,
          code: def.code,
          name: def.name,
          dataType: def.dataType || 'TEXT',
          unitCategory: def.unitCategory,
          defaultUnit: def.defaultUnit,
          groupName: def.groupName,
          confidence,
          confidenceLevel,
          isAlreadyBound: boundSet.has(def.id),
          reason:
            evidence[0]?.description ||
            `Recommended specification for ${category.name}`,
          evidence,
        });
      }
    }

    return suggestions.sort((a, b) => {
      if (a.isAlreadyBound !== b.isAlreadyBound) {
        return a.isAlreadyBound ? 1 : -1;
      }
      return b.confidence - a.confidence;
    });
  }

  private suggestAttributeConfigFallback(
    name: string,
    description: string | undefined,
    allDefs: SimpleAttributeDef[],
  ): AttributeConfigSuggestionDto {
    const cleanName = name.trim();

    // Check canonical knowledge
    let matchedItem: (typeof CANONICAL_PARAM_FALLBACK)[string] | null = null;
    let matchedScore = 0;
    for (const item of Object.values(CANONICAL_PARAM_FALLBACK)) {
      const candidates = [item.canonical, item.code, ...(item.aliases || [])];
      for (const c of candidates) {
        const sim = this.computeStringSimilarityFallback(cleanName, c);
        if (sim > matchedScore && sim >= 0.65) {
          matchedScore = sim;
          matchedItem = item;
        }
      }
    }

    // Check best existing match
    let bestMatch: SimpleAttributeDef | null = null;
    let bestSim = 0;
    for (const def of allDefs) {
      const sim = this.computeStringSimilarityFallback(cleanName, def.name);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = def;
      }
    }

    const evidence: EvidenceItemDto[] = [];
    if (matchedItem && matchedScore >= 0.7) {
      const item = matchedItem;
      const confidence = Number(Math.min(0.99, matchedScore).toFixed(2));
      const confidenceLevel = confidence >= 0.85 ? 'HIGH' : 'MEDIUM';
      evidence.push({
        type: 'domain_rule',
        description: `Matched known engineering parameter '${item.canonical}' (${Math.round(confidence * 100)}%)`,
        weight: 0.95,
        source: 'domain:electronics_standard',
      });

      return {
        suggestedCode: item.code,
        suggestedDataType: item.dataType,
        unitCategory: item.unitCategory,
        defaultUnit: item.defaultUnit,
        displayUnits: item.displayUnits || [],
        groupName: item.group,
        suggestedAliases: item.aliases || [],
        suggestedOptions: item.options || [],
        validationRules: item.validation || null,
        canonicalMatch:
          bestMatch && bestSim >= 0.75
            ? {
                id: bestMatch.id,
                name: bestMatch.name,
                code: bestMatch.code,
                similarity: Number(bestSim.toFixed(2)),
              }
            : null,
        confidence,
        confidenceLevel,
        reason: `Derived configuration from standard electrical parameter '${item.canonical}'`,
        evidence,
      };
    }

    // Heuristic fallback
    const lower = cleanName.toLowerCase();
    const suggestedCode = lower
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    let suggestedDataType = 'TEXT';
    let groupName = 'General';
    let unitCategory: string | null = null;
    let defaultUnit: string | null = null;
    let confidence = 0.5;

    if (
      ['type', 'package', 'style', 'color', 'grade', 'material'].some((k) =>
        lower.includes(k),
      )
    ) {
      suggestedDataType = 'SELECT';
      confidence = 0.65;
    } else if (
      ['is_', 'has_', 'flag', 'enable', 'active'].some((k) => lower.includes(k))
    ) {
      suggestedDataType = 'BOOLEAN';
      confidence = 0.75;
    } else if (
      ['count', 'number', 'quantity', 'pins'].some((k) => lower.includes(k))
    ) {
      suggestedDataType = 'INTEGER';
      unitCategory = 'Count';
      defaultUnit = 'pcs';
      groupName = 'Physical';
      confidence = 0.7;
    }

    evidence.push({
      type: 'classifier',
      description: `Inferred data type ${suggestedDataType} from keyword analysis`,
      weight: confidence,
      source: 'heuristic:pattern_matcher',
    });

    return {
      suggestedCode,
      suggestedDataType,
      unitCategory,
      defaultUnit,
      displayUnits: defaultUnit ? [defaultUnit] : [],
      groupName,
      suggestedAliases: [],
      suggestedOptions: [],
      validationRules: null,
      canonicalMatch:
        bestMatch && bestSim >= 0.75
          ? {
              id: bestMatch.id,
              name: bestMatch.name,
              code: bestMatch.code,
              similarity: Number(bestSim.toFixed(2)),
            }
          : null,
      confidence,
      confidenceLevel: confidence >= 0.85 ? 'HIGH' : 'MEDIUM',
      reason: `Heuristic configuration derived from name '${cleanName}'`,
      evidence,
    };
  }

  private detectAttributeDuplicatesFallback(
    name: string,
    code: string | undefined,
    allDefs: SimpleAttributeDef[],
    allBindings: SimpleBinding[],
    threshold: number,
  ): {
    isDuplicate: boolean;
    matches: AttributeDuplicateMatchDto[];
    suggestedAliases: string[];
  } {
    const cleanName = name.trim();
    const normName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normCode = (code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const matches: AttributeDuplicateMatchDto[] = [];
    const aliases = new Set<string>();

    const bindingsByAttr: Record<string, number> = {};
    for (const b of allBindings) {
      bindingsByAttr[b.attributeDefinitionId] =
        (bindingsByAttr[b.attributeDefinitionId] || 0) + 1;
    }

    for (const def of allDefs) {
      const defNormName = def.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const defNormCode = def.code.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (normCode && normCode === defNormCode) {
        matches.push({
          attributeId: def.id,
          code: def.code,
          name: def.name,
          similarity: 1.0,
          confidenceLevel: 'HIGH',
          matchType: 'exact_code',
          usageCount: bindingsByAttr[def.id] || 0,
          boundCategories: [],
          aliases: (def.aliases as string[]) || [],
          reason: `Exact matching attribute code '${def.code}' already exists`,
          evidence: [
            {
              type: 'exact_match',
              description: `Code '${def.code}' is identical`,
              weight: 1.0,
              source: 'database:attribute_definitions',
            },
          ],
        });
        continue;
      }

      if (normName === defNormName) {
        matches.push({
          attributeId: def.id,
          code: def.code,
          name: def.name,
          similarity: 1.0,
          confidenceLevel: 'HIGH',
          matchType: 'exact_name',
          usageCount: bindingsByAttr[def.id] || 0,
          boundCategories: [],
          aliases: (def.aliases as string[]) || [],
          reason: `Exact matching attribute name '${def.name}' already exists`,
          evidence: [
            {
              type: 'exact_match',
              description: `Name '${def.name}' is identical`,
              weight: 1.0,
              source: 'database:attribute_definitions',
            },
          ],
        });
        continue;
      }

      // Check aliases
      const defAliases = (def.aliases as string[]) || [];
      if (
        defAliases.some(
          (al) => al.toLowerCase().replace(/[^a-z0-9]/g, '') === normName,
        )
      ) {
        matches.push({
          attributeId: def.id,
          code: def.code,
          name: def.name,
          similarity: 0.98,
          confidenceLevel: 'HIGH',
          matchType: 'alias_match',
          usageCount: bindingsByAttr[def.id] || 0,
          boundCategories: [],
          aliases: defAliases,
          reason: `Matches declared alias of existing attribute '${def.name}'`,
          evidence: [
            {
              type: 'alias_match',
              description: `Matched known alias in attribute definitions`,
              weight: 0.98,
              source: 'attribute:aliases',
            },
          ],
        });
        continue;
      }

      const sim = this.computeStringSimilarityFallback(
        cleanName,
        def.name,
        defAliases,
      );
      if (sim >= threshold) {
        matches.push({
          attributeId: def.id,
          code: def.code,
          name: def.name,
          similarity: Number(sim.toFixed(2)),
          confidenceLevel: sim >= 0.85 ? 'HIGH' : 'MEDIUM',
          matchType: 'token_similarity',
          usageCount: bindingsByAttr[def.id] || 0,
          boundCategories: [],
          aliases: defAliases,
          reason: `High lexical similarity (${Math.round(sim * 100)}%) with '${def.name}'`,
          evidence: [
            {
              type: 'similarity',
              description: `Character and token similarity: ${Math.round(sim * 100)}%`,
              weight: sim,
              source: 'ngram:similarity',
            },
          ],
        });
        aliases.add(cleanName);
        aliases.add(def.name);
      }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return {
      isDuplicate: matches.length > 0,
      matches,
      suggestedAliases: Array.from(aliases),
    };
  }

  private suggestEnumValuesFallback(
    attributeCode: string,
    attributeName: string,
    existingOptions: string[],
    datapackHints: DataPackHint[],
  ): EnumOptionSuggestionDto[] {
    const normCode = attributeCode.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normName = attributeName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const existingSet = new Set(existingOptions.map((o) => o.toLowerCase()));
    const suggestions: EnumOptionSuggestionDto[] = [];

    // Package patterns from Data Packs
    if (
      normCode.includes('package') ||
      normName.includes('package') ||
      normName.includes('footprint')
    ) {
      if (datapackHints) {
        for (const hint of datapackHints) {
          for (const pkg of (hint.packagePatterns as string[]) || []) {
            if (!existingSet.has(pkg.toLowerCase())) {
              existingSet.add(pkg.toLowerCase());
              suggestions.push({
                code: pkg,
                label: pkg,
                source: `datapack:${hint.categoryCode || 'electronics-smd'}`,
                confidence: 0.98,
                confidenceLevel: 'HIGH',
              });
            }
          }
        }
      }
    }

    // Canonical params
    for (const item of Object.values(CANONICAL_PARAM_FALLBACK)) {
      const candidates = [
        item.code,
        item.canonical,
        ...(item.aliases || []),
      ].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));

      if (
        candidates.includes(normCode) ||
        candidates.includes(normName) ||
        candidates.some(
          (c) =>
            c.length >= 4 && (normCode.includes(c) || normName.includes(c)),
        )
      ) {
        for (const opt of item.options || []) {
          if (!existingSet.has(opt.toLowerCase())) {
            existingSet.add(opt.toLowerCase());
            suggestions.push({
              code: opt,
              label: opt,
              source: 'domain:electronics_standard',
              provenance: 'domain:electronics_standard',
              confidence: 0.95,
              confidenceLevel: 'HIGH',
            });
          }
        }
      }
    }

    return suggestions;
  }

  private auditAttributeLibraryFallback(
    allDefs: SimpleAttributeDef[],
    allCats: SimpleCategory[],
    allBindings: SimpleBinding[],
    compCountsByAttr: Record<string, number>,
    compCountsByCatAttr: Record<string, number>,
  ): {
    summary: {
      totalAttributes: number;
      possibleDuplicates: number;
      suspiciousBindings: number;
      missingExpectedAttributes: number;
      unusedAttributes: number;
      issuesCount?: number;
    };
    issues: AttributeAuditIssueDto[];
  } {
    const issues: AttributeAuditIssueDto[] = [];
    let counter = 1;

    // 1. Duplicates
    for (let i = 0; i < allDefs.length; i++) {
      for (let j = i + 1; j < allDefs.length; j++) {
        const d1 = allDefs[i];
        const d2 = allDefs[j];
        if (!d1 || !d2) continue;

        const sim = this.computeStringSimilarityFallback(
          d1.name,
          d2.name,
          (d2.aliases as string[] | undefined) || undefined,
        );
        if (sim >= 0.78) {
          issues.push({
            id: `audit-${counter++}`,
            type: 'DUPLICATE_ATTRIBUTE',
            severity: 'WARNING',
            title: `Possible Duplicate: "${d1.name}" & "${d2.name}"`,
            subtitle: `${Math.round(sim * 100)}% lexical similarity. Potential redundant attribute definition.`,
            attributeId: d1.id,
            attributeCode: d1.code,
            attributeName: d1.name,
            confidence: Number(sim.toFixed(2)),
            confidenceLevel: sim >= 0.85 ? 'HIGH' : 'MEDIUM',
            reason: `Possible duplicate attributes: '${d1.name}' and '${d2.name}' (${Math.round(sim * 100)}% similarity)`,
            payload: {
              targetAttributeId: d2.id,
              targetAttributeName: d2.name,
              targetAttributeCode: d2.code,
              similarity: sim,
            },
            evidence: [
              {
                type: 'similarity',
                description: `High lexical similarity between '${d1.name}' and '${d2.name}'`,
                weight: sim,
                source: 'audit:deduplication',
              },
            ],
          });
        }
      }
    }

    // 2. Suspicious Bindings
    for (const b of allBindings) {
      const def = allDefs.find((d) => d.id === b.attributeDefinitionId);
      const cat = allCats.find((c) => c.id === b.categoryId);
      if (!def || !cat) continue;

      const normCode = def.code.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normCat = cat.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (
        normCode.includes('resistance') &&
        (normCat.includes('capacitor') || normCat.includes('diode'))
      ) {
        const usage =
          compCountsByCatAttr[`${b.categoryId}_${b.attributeDefinitionId}`] ||
          0;
        issues.push({
          id: `audit-${counter++}`,
          type: 'SUSPICIOUS_BINDING',
          severity: 'WARNING',
          title: `Suspicious Binding: "${def.name}" on "${cat.name}"`,
          subtitle: `Attribute '${def.name}' bound to '${cat.name}', but only ${usage} components use it.`,
          attributeId: def.id,
          attributeCode: def.code,
          attributeName: def.name,
          categoryId: cat.id,
          categoryName: cat.name,
          confidence: 0.85,
          confidenceLevel: 'HIGH',
          reason: `Suspicious binding: '${def.name}' bound to '${cat.name}' (Only ${usage} components use this)`,
          payload: {
            usageCount: usage,
          },
          evidence: [
            {
              type: 'anomaly',
              description: `Attribute '${def.name}' is characteristic of Resistors, not '${cat.name}'`,
              weight: 0.85,
              source: 'audit:anomaly_detection',
            },
          ],
        });
      }
    }

    // 3. Missing Expected Attributes
    const bindingsByCat: Record<string, Set<string>> = {};
    for (const b of allBindings) {
      const def = allDefs.find((d) => d.id === b.attributeDefinitionId);
      if (def) {
        if (!bindingsByCat[b.categoryId]) {
          bindingsByCat[b.categoryId] = new Set();
        }
        bindingsByCat[b.categoryId]?.add(
          def.code.toLowerCase().replace(/[^a-z0-9]/g, ''),
        );
      }
    }

    for (const cat of allCats) {
      const bound = bindingsByCat[cat.id] || new Set();
      const catNorm = cat.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      for (const item of Object.values(CANONICAL_PARAM_FALLBACK)) {
        const pCode = item.code.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (
          item.categories.some((tc: string) => {
            const tcNorm = tc.toLowerCase().replace(/[^a-z0-9]/g, '');
            return catNorm.includes(tcNorm) || tcNorm.includes(catNorm);
          })
        ) {
          if (!bound.has(pCode)) {
            const existingDef = allDefs.find(
              (d) =>
                d.code.toLowerCase().replace(/[^a-z0-9]/g, '') === pCode ||
                d.name.toLowerCase().replace(/[^a-z0-9]/g, '') === pCode ||
                (d.aliases &&
                  d.aliases.some(
                    (a) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === pCode,
                  )),
            );

            issues.push({
              id: `audit-${counter++}`,
              type: 'MISSING_EXPECTED_ATTRIBUTE',
              severity: 'INFO',
              title: `Bind "${item.canonical}" to "${cat.name}"`,
              subtitle: `Standard specification attribute commonly expected for '${cat.name}'.`,
              attributeId: existingDef ? existingDef.id : null,
              attributeCode: existingDef ? existingDef.code : item.code,
              attributeName: existingDef ? existingDef.name : item.canonical,
              categoryId: cat.id,
              categoryName: cat.name,
              confidence: 0.9,
              confidenceLevel: 'HIGH',
              reason: `Standard attribute '${item.canonical}' is commonly expected for '${cat.name}' but not currently bound`,
              payload: {
                isExisting: Boolean(existingDef),
                canonicalCode: item.code,
                dataType: item.dataType,
                unitCategory: item.unitCategory,
                defaultUnit: item.defaultUnit,
                group: item.group,
                suggestedRequired: false,
              },
              evidence: [
                {
                  type: 'taxonomy',
                  description: `Industry standard specification for '${cat.name}'`,
                  weight: 0.9,
                  source: 'domain:electronics_standard',
                },
              ],
            });
            break;
          }
        }
      }
    }

    // 4. Unused Attributes
    for (const def of allDefs) {
      const usage = compCountsByAttr[def.id] || 0;
      const bindingCount = allBindings.filter(
        (b) => b.attributeDefinitionId === def.id,
      ).length;
      if (usage === 0 && bindingCount === 0) {
        issues.push({
          id: `audit-${counter++}`,
          type: 'UNUSED_ATTRIBUTE',
          severity: 'INFO',
          title: `Unused Attribute: "${def.name}"`,
          subtitle: `Attribute has 0 category bindings and 0 component values in the inventory ledger.`,
          attributeId: def.id,
          attributeCode: def.code,
          attributeName: def.name,
          confidence: 0.75,
          confidenceLevel: 'MEDIUM',
          reason: `Attribute '${def.name}' has 0 category bindings and 0 component values`,
          payload: {
            usageCount: 0,
            bindingCount: 0,
            dataType: def.dataType,
          },
          evidence: [
            {
              type: 'existing_data',
              description: 'Zero references in inventory ledger',
              weight: 0.75,
              source: 'database:component_attribute_values',
            },
          ],
        });
      }
    }

    return {
      summary: {
        totalAttributes: allDefs.length,
        possibleDuplicates: issues.filter(
          (i) => i.type === 'DUPLICATE_ATTRIBUTE',
        ).length,
        suspiciousBindings: issues.filter(
          (i) => i.type === 'SUSPICIOUS_BINDING',
        ).length,
        missingExpectedAttributes: issues.filter(
          (i) => i.type === 'MISSING_EXPECTED_ATTRIBUTE',
        ).length,
        unusedAttributes: issues.filter((i) => i.type === 'UNUSED_ATTRIBUTE')
          .length,
        issuesCount: issues.length,
      },
      issues,
    };
  }

  private computeStringSimilarityFallback(
    s1: string,
    s2: string,
    s2Aliases?: string[],
  ): number {
    const norm1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm1 || !norm2) return 0;
    if (norm1 === norm2) return 1.0;

    if (s2Aliases) {
      for (const al of s2Aliases) {
        if (al.toLowerCase().replace(/[^a-z0-9]/g, '') === norm1) {
          return 0.98;
        }
      }
    }

    // Canonical param check
    for (const item of Object.values(CANONICAL_PARAM_FALLBACK)) {
      const candidates = [
        item.canonical,
        item.code,
        ...(item.aliases || []),
      ].map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (candidates.includes(norm1) && candidates.includes(norm2)) {
        return 0.95;
      }
    }

    // Substring
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const shorter = Math.min(norm1.length, norm2.length);
      const longer = Math.max(norm1.length, norm2.length);
      return 0.75 + 0.2 * (shorter / longer);
    }

    // Token Jaccard
    const words1 = new Set(s1.toLowerCase().match(/[a-z0-9]+/g) || []);
    const words2 = new Set(s2.toLowerCase().match(/[a-z0-9]+/g) || []);
    let intersect = 0;
    for (const w of words1) {
      if (words2.has(w)) intersect++;
    }
    const union = words1.size + words2.size - intersect;
    const tokenSim = union > 0 ? intersect / union : 0;

    // Char 3-gram Dice
    const n = 3;
    if (norm1.length >= n && norm2.length >= n) {
      const g1 = new Set<string>();
      const g2 = new Set<string>();
      for (let i = 0; i <= norm1.length - n; i++) g1.add(norm1.slice(i, i + n));
      for (let i = 0; i <= norm2.length - n; i++) g2.add(norm2.slice(i, i + n));
      let gIntersect = 0;
      for (const g of g1) {
        if (g2.has(g)) gIntersect++;
      }
      const charSim = (2.0 * gIntersect) / (g1.size + g2.size);
      return Math.max(charSim, tokenSim * 0.85);
    }

    return tokenSim * 0.85;
  }
}

const CANONICAL_PARAM_FALLBACK: Record<
  string,
  {
    canonical: string;
    code: string;
    dataType: string;
    unitCategory: string | null;
    defaultUnit: string | null;
    displayUnits: string[];
    group: string;
    validation?: Record<string, unknown>;
    aliases: string[];
    options?: string[];
    categories: string[];
  }
> = {
  voltage: {
    canonical: 'Voltage Rating',
    code: 'voltage_rating',
    dataType: 'QUANTITY',
    unitCategory: 'Voltage',
    defaultUnit: 'V',
    displayUnits: ['mV', 'V', 'kV'],
    group: 'Electrical',
    validation: { min: 0, rule: '> 0' },
    aliases: ['Rated Voltage', 'Working Voltage', 'V_rated', 'Voltage'],
    categories: [
      'Capacitors',
      'MOSFET',
      'Transistors',
      'Diodes',
      'Voltage Regulators',
      'ICs & Semiconductors',
      'Electronic Components',
    ],
  },
  capacitance: {
    canonical: 'Capacitance',
    code: 'capacitance',
    dataType: 'QUANTITY',
    unitCategory: 'Capacitance',
    defaultUnit: 'uF',
    displayUnits: ['pF', 'nF', 'uF', 'mF', 'F'],
    group: 'Electrical',
    validation: { min: 0, rule: '> 0' },
    aliases: ['Cap Value', 'Nominal Capacitance', 'Capacitance Value'],
    categories: ['Capacitors'],
  },
  resistance: {
    canonical: 'Resistance',
    code: 'resistance',
    dataType: 'QUANTITY',
    unitCategory: 'Resistance',
    defaultUnit: 'ohm',
    displayUnits: ['ohm', 'kohm', 'Mohm'],
    group: 'Electrical',
    validation: { min: 0, rule: '> 0' },
    aliases: ['Resistance Value', 'Nominal Resistance', 'Ohmic Value'],
    categories: ['Resistors'],
  },
  tolerance: {
    canonical: 'Tolerance',
    code: 'tolerance',
    dataType: 'QUANTITY',
    unitCategory: 'Percentage',
    defaultUnit: '%',
    displayUnits: ['%'],
    group: 'Electrical',
    validation: { min: 0, max: 100, rule: '0 <= x <= 100' },
    aliases: ['Percentage Tolerance', 'Tol', 'Accuracy'],
    categories: ['Resistors', 'Capacitors', 'Inductors'],
  },
  power_rating: {
    canonical: 'Power Rating',
    code: 'power_rating',
    dataType: 'QUANTITY',
    unitCategory: 'Power',
    defaultUnit: 'W',
    displayUnits: ['mW', 'W', 'kW'],
    group: 'Electrical',
    validation: { min: 0, rule: '> 0' },
    aliases: ['Rated Power', 'Max Power', 'Wattage'],
    categories: ['Resistors', 'Diodes', 'Transistors', 'ICs & Semiconductors'],
  },
  current_rating: {
    canonical: 'Current Rating',
    code: 'current_rating',
    dataType: 'QUANTITY',
    unitCategory: 'Current',
    defaultUnit: 'A',
    displayUnits: ['uA', 'mA', 'A'],
    group: 'Electrical',
    validation: { min: 0, rule: '> 0' },
    aliases: ['Rated Current', 'Max Current', 'Operating Current'],
    categories: [
      'Diodes',
      'Transistors',
      'Inductors',
      'ICs & Semiconductors',
      'Connectors',
    ],
  },
  inductance: {
    canonical: 'Inductance',
    code: 'inductance',
    dataType: 'QUANTITY',
    unitCategory: 'Inductance',
    defaultUnit: 'uH',
    displayUnits: ['nH', 'uH', 'mH', 'H'],
    group: 'Electrical',
    validation: { min: 0, rule: '> 0' },
    aliases: ['Inductance Value', 'Nominal Inductance'],
    categories: ['Inductors'],
  },
  dielectric: {
    canonical: 'Dielectric',
    code: 'dielectric',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Electrical',
    options: ['C0G', 'NP0', 'X5R', 'X7R', 'Y5V', 'X6S'],
    categories: ['Capacitors'],
    aliases: ['Dielectric Material', 'Temperature Characteristic'],
  },
  package: {
    canonical: 'Package / Case',
    code: 'package',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Physical',
    options: [
      '0201',
      '0402',
      '0603',
      '0805',
      '1206',
      '1210',
      'SOD-123',
      'SOT-23',
      'SOIC-8',
      'DIP-8',
      'QFN-32',
    ],
    categories: [
      'Resistors',
      'Capacitors',
      'Inductors',
      'Diodes',
      'Transistors',
      'ICs & Semiconductors',
      'Electronic Components',
    ],
    aliases: ['Footprint', 'Package Footprint', 'Case Code'],
  },
  mounting_type: {
    canonical: 'Mounting Type',
    code: 'mounting_type',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Physical',
    options: ['SMD', 'Through Hole', 'Panel Mount'],
    categories: [
      'Resistors',
      'Capacitors',
      'Inductors',
      'Diodes',
      'Transistors',
      'ICs & Semiconductors',
      'Electronic Components',
    ],
    aliases: ['Mounting Technology', 'Termination Style'],
  },
  operating_temperature: {
    canonical: 'Operating Temperature',
    code: 'operating_temperature',
    dataType: 'QUANTITY',
    unitCategory: 'Temperature',
    defaultUnit: '°C',
    displayUnits: ['°C'],
    group: 'Environmental',
    categories: [
      'Resistors',
      'Capacitors',
      'Inductors',
      'Diodes',
      'Transistors',
      'ICs & Semiconductors',
    ],
    aliases: ['Temperature Range', 'Operating Temp Range'],
  },
  termination: {
    canonical: 'Termination Style',
    code: 'termination',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Physical',
    options: [
      'SMD / SMT',
      'Through Hole (Axial)',
      'Through Hole (Radial)',
      'Solder Lug',
      'Screw Terminal',
      'Lead Free',
      'RoHS Compliant',
    ],
    categories: ['Resistors', 'Capacitors', 'Inductors', 'Connectors'],
    aliases: ['Termination', 'Terminal Type', 'Lead Style'],
  },
  contact_plating: {
    canonical: 'Contact Plating',
    code: 'contact_plating',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Physical',
    options: ['Gold', 'Tin', 'Silver', 'Nickel', 'Selective Gold'],
    categories: ['Connectors', 'Relays', 'Switches'],
    aliases: ['Plating', 'Contact Finish', 'Terminal Plating'],
  },
  gender: {
    canonical: 'Gender',
    code: 'gender',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Physical',
    options: ['Male (Pin)', 'Female (Socket)', 'Reversible', 'Universal'],
    categories: ['Connectors'],
    aliases: ['Connector Gender', 'Plug / Socket'],
  },
  orientation: {
    canonical: 'Orientation',
    code: 'orientation',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Physical',
    options: ['Straight / Vertical', 'Right Angle', 'Horizontal'],
    categories: ['Connectors', 'Switches', 'LEDs'],
    aliases: ['Mounting Angle', 'Pin Orientation', 'Body Orientation'],
  },
  polarity: {
    canonical: 'Polarity',
    code: 'polarity',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    displayUnits: [],
    group: 'Electrical',
    options: [
      'Active High',
      'Active Low',
      'Unidirectional',
      'Bidirectional',
      'Polarized',
      'Non-Polarized',
    ],
    categories: ['Diodes', 'Capacitors', 'ICs & Semiconductors'],
    aliases: ['Polarity Type', 'Directionality'],
  },
};
