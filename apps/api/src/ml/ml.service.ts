import { Injectable, Logger } from '@nestjs/common';
import { db } from '@ananya/database';
import {
  categories,
  manufacturers,
  components,
  attributeDefinitions,
} from '@ananya/database/schema';
import { eq } from '@ananya/database/query';
import { MlClientService } from './ml-client.service';
import {
  SuggestComponentDto,
  ComponentSuggestionResponseDto,
  CategorySuggestionDto,
  ManufacturerSuggestionDto,
  DuplicateWarningDto,
  ExtractedAttributeDto,
} from './dtos';

interface RawExtractedAttribute {
  code: string;
  value: string | number | boolean | null;
  unit?: string | null;
  formatted: string;
  confidence: number;
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

  constructor(private readonly mlClient: MlClientService) {}

  async suggest(
    dto: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    const t0 = performance.now();
    const query = dto.query.trim();
    const partNumber = (dto.partNumber || query).trim();
    const description = (dto.description || query).trim();

    // 1. Fetch reference lookups from database
    const [allCategories, allManufacturers, allAttributes, existingComps] =
      await Promise.all([
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
      ]);

    // 2. Try ananya-ml microservice first
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
        };

        if (idx === 0) {
          primaryCategory = item;
        } else {
          alternativeCategories.push(item);
        }
      }
    } else {
      // Deterministic Category Fallback
      const lower = `${partNumber} ${description}`.toLowerCase();
      let matchedName = 'Electronic Components';

      if (
        lower.includes('resistor') ||
        lower.includes('ohm') ||
        lower.includes('rc0805')
      ) {
        matchedName = 'Resistors';
      } else if (
        lower.includes('capacitor') ||
        lower.includes('uf') ||
        lower.includes('pf') ||
        lower.includes('nf')
      ) {
        matchedName = 'Capacitors';
      } else if (
        lower.includes('inductor') ||
        lower.includes('uh') ||
        lower.includes('nh')
      ) {
        matchedName = 'Inductors';
      } else if (
        lower.includes('diode') ||
        lower.includes('schottky') ||
        lower.includes('1n5819')
      ) {
        matchedName = 'Diodes';
      } else if (
        lower.includes('mosfet') ||
        lower.includes('transistor') ||
        lower.includes('bss138')
      ) {
        matchedName = 'Transistors';
      } else if (
        lower.includes('connector') ||
        lower.includes('header') ||
        lower.includes('jst')
      ) {
        matchedName = 'Connectors';
      } else if (lower.includes('switch') || lower.includes('tact')) {
        matchedName = 'Switches';
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
        confidence: 0.85,
      };
    }

    // 4. Manufacturer Resolution
    let manufacturerSuggestion: ManufacturerSuggestionDto | null = null;
    let mfgName = 'Generic';
    let mfgConf = 0.5;
    let mfgType = 'fallback';

    if (mlResponse) {
      mfgName = mlResponse.manufacturer.manufacturer;
      mfgConf = mlResponse.manufacturer.confidence;
      mfgType = mlResponse.manufacturer.match_type;
    } else {
      // Deterministic Manufacturer Fallback
      const upperPn = partNumber.toUpperCase();
      for (const [prefix, name] of Object.entries(
        FALLBACK_MANUFACTURER_PREFIXES,
      )) {
        if (upperPn.startsWith(prefix)) {
          mfgName = name;
          mfgConf = 0.98;
          mfgType = 'pattern';
          break;
        }
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
      matchType: mfgType,
    };

    // 5. Duplicate Detection & Precedence
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
          matchType: 'exact_sku',
          reason: `Exact match with existing SKU '${ec.sku}'`,
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
            matchType: m.match_type,
            reason: m.reason,
          });
        }
      }
    }

    // 6. Dynamic Attributes Resolution
    const resolvedAttributes: Record<string, ExtractedAttributeDto> = {};
    const rawAttrs = mlResponse
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
      };
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
      isMlActive,
      executionTimeMs: Math.round(elapsed * 100) / 100,
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
      attrs['resistance'] = {
        code: 'resistance',
        value: val * mult,
        unit: 'ohm',
        formatted: `${resM[1]}${u === 'k' ? 'kΩ' : 'Ω'}`,
        confidence: 0.95,
      };
    }

    // Capacitance
    const capM = t.match(/\b(\d+(?:\.\d+)?)\s*(uf|nf|pf|f)\b/i);
    if (capM && capM[1] && capM[2]) {
      attrs['capacitance'] = {
        code: 'capacitance',
        value: parseFloat(capM[1]),
        unit: capM[2].toLowerCase(),
        formatted: `${capM[1]}${capM[2]}`,
        confidence: 0.95,
      };
    }

    // Voltage
    const voltM = t.match(/\b(\d+(?:\.\d+)?)\s*(v|kv|mv)\b/i);
    if (voltM && voltM[1] && voltM[2]) {
      attrs['voltage'] = {
        code: 'voltage',
        value: parseFloat(voltM[1]),
        unit: voltM[2].toUpperCase(),
        formatted: `${voltM[1]}${voltM[2].toUpperCase()}`,
        confidence: 0.92,
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
      };
    }

    return attrs;
  }
}
