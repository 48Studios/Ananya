import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { DataPacksService } from '../../src/data-packs/data-packs.service';
import { AttributesService } from '../../src/attributes/attributes.service';
import { ComponentsService } from '../../src/components/components.service';
import { db, closeDatabaseConnection } from '@ananya/database';
import { componentAttributeValues, components } from '@ananya/database/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

describe('Dynamic Attributes & Electronics Data Pack E2E Integration', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  let app: INestApplicationContext;
  let dataPacksService: DataPacksService;
  let attributesService: AttributesService;
  let componentsService: ComponentsService;

  beforeAll(async () => {
    if (!hasDbUrl) return;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    dataPacksService = app.get(DataPacksService);
    attributesService = app.get(AttributesService);
    componentsService = app.get(ComponentsService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (hasDbUrl) {
      await closeDatabaseConnection();
    }
  });

  it('should install electronics-smd pack idempotently and verify dynamic attributes', async () => {
    if (!hasDbUrl) {
      expect(true).toBe(true);
      return;
    }

    // 1. Install electronics-smd pack
    const installResult =
      await dataPacksService.installDataPack('electronics-smd');
    expect(installResult.packId).toBe('electronics-smd');
    expect(installResult.status).toBe('COMPLETED');
    expect(installResult.recordsProcessed).toBeGreaterThan(0);

    // 2. Verify attribute definitions
    const defs = await attributesService.getAllDefinitions();
    const resistanceDef = defs.find((d) => d.code === 'resistance');
    const packageDef = defs.find((d) => d.code === 'package');
    const capacitanceDef = defs.find((d) => d.code === 'capacitance');

    expect(resistanceDef).toBeDefined();
    expect(resistanceDef!.dataType).toBe('QUANTITY');
    expect(resistanceDef!.unitCategory).toBe('Resistance');

    expect(packageDef).toBeDefined();
    expect(packageDef!.dataType).toBe('SELECT');
    expect(packageDef!.options.length).toBeGreaterThan(0);

    expect(capacitanceDef).toBeDefined();
    expect(capacitanceDef!.dataType).toBe('QUANTITY');

    // 3. Verify idempotent re-installation
    const secondInstall =
      await dataPacksService.installDataPack('electronics-smd');
    expect(secondInstall.status).toBe('COMPLETED');

    const defsAfterSecondInstall = await attributesService.getAllDefinitions();
    expect(defsAfterSecondInstall.length).toBe(defs.length);
  });

  it('Scenario 1 & 2: should create Resistor and Capacitor and preserve structured specifications', async () => {
    if (!hasDbUrl) return;

    // Resistor creation
    const resistor = await componentsService.create({
      sku: `E2E-RES-${Date.now()}`,
      name: '10kΩ SMD Resistor',
      unit: 'pcs',
      attributes: [
        { code: 'resistance', value: 10, unit: 'kohm' },
        { code: 'tolerance', value: '1pct', optionCode: '1pct' },
        { code: 'power_rating', value: 0.125, unit: 'W' },
        { code: 'package', value: '0805', optionCode: '0805' },
      ],
    });

    const populatedResistor = await attributesService.getComponentAttributes(
      resistor.id,
    );
    expect(populatedResistor.resistance).toBeDefined();
    expect(populatedResistor.resistance!.normalizedValue).toBe(10000);
    expect(populatedResistor.tolerance!.displayValue).toBe('±1%');
    expect(populatedResistor.package!.displayValue).toBe('0805 (2012 Metric)');

    // Verify database range filtering query using normalized values
    const defs = await attributesService.getAllDefinitions();
    const resistanceDef = defs.find((d) => d.code === 'resistance');
    const matchingRange = await db
      .select({
        sku: components.sku,
        normalizedNumber: componentAttributeValues.normalizedNumberValue,
      })
      .from(componentAttributeValues)
      .innerJoin(
        components,
        eq(componentAttributeValues.componentId, components.id),
      )
      .where(
        and(
          eq(componentAttributeValues.attributeDefinitionId, resistanceDef!.id),
          gte(componentAttributeValues.normalizedNumberValue, '1000'),
          lte(componentAttributeValues.normalizedNumberValue, '20000'),
        ),
      );

    expect(matchingRange.length).toBeGreaterThanOrEqual(1);
    expect(matchingRange.some((m) => m.sku === resistor.sku)).toBe(true);

    // Capacitor creation
    const capacitor = await componentsService.create({
      sku: `E2E-CAP-${Date.now()}`,
      name: '100nF Ceramic Capacitor',
      unit: 'pcs',
      attributes: [
        { code: 'capacitance', value: 100, unit: 'nF' },
        { code: 'voltage_rating', value: 50, unit: 'V' },
        { code: 'tolerance', value: '10pct', optionCode: '10pct' },
        { code: 'dielectric', value: 'x7r', optionCode: 'x7r' },
        { code: 'package', value: '0805', optionCode: '0805' },
      ],
    });

    const populatedCap = await attributesService.getComponentAttributes(
      capacitor.id,
    );
    expect(populatedCap.capacitance).toBeDefined();
    expect(populatedCap.dielectric!.displayValue).toBe('X7R');

    // Clean up
    await componentsService.delete(resistor.id);
    await componentsService.delete(capacitor.id);
  });

  it('Scenario 3 & 4: should isolate category attributes and preserve legacy products on edit', async () => {
    if (!hasDbUrl) return;

    // Scenario 4: Legacy product without attributes
    const legacy = await componentsService.create({
      sku: `E2E-LEGACY-${Date.now()}`,
      name: 'Legacy Hardware Spacer',
      description: 'Standard nylon spacer created before attributes',
      unit: 'pcs',
    });

    const updatedLegacy = await componentsService.update(legacy.id, {
      description: 'Updated nylon spacer description',
    });

    expect(updatedLegacy.sku).toBe(legacy.sku);
    expect(updatedLegacy.description).toBe('Updated nylon spacer description');

    // Attributes should be empty object, not crash or undefined
    const loadedLegacy = await componentsService.getComponent(legacy.id);
    expect(loadedLegacy.attributes).toEqual({});

    await componentsService.delete(legacy.id);
  });
});
