/**
 * Spatial Demo dataset definitions.
 *
 * All identifiers follow the required prefix conventions:
 * - Spatial entities (locations, models, anchors): DEMO-SPATIAL-
 * - Components & inventory: DEMO-
 */
import { SPATIAL_PREFIX, COMPONENT_PREFIX } from './lib.mjs';

export const MODELS = [
  {
    code: `${SPATIAL_PREFIX}CABINET-6`,
    name: 'Demo 6 Drawer Cabinet',
    format: 'PROCEDURAL',
    widthMm: 600,
    heightMm: 900,
    depthMm: 400,
    anchors: [
      {
        code: 'A01',
        name: 'Drawer Slot A01',
        anchorType: 'DRAWER',
        localPositionX: 100,
        localPositionY: 675,
        localPositionZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 400,
        boundingDepthMm: 380,
      },
      {
        code: 'A02',
        name: 'Drawer Slot A02',
        anchorType: 'DRAWER',
        localPositionX: 300,
        localPositionY: 675,
        localPositionZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 400,
        boundingDepthMm: 380,
      },
      {
        code: 'A03',
        name: 'Drawer Slot A03',
        anchorType: 'DRAWER',
        localPositionX: 500,
        localPositionY: 675,
        localPositionZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 400,
        boundingDepthMm: 380,
      },
      {
        code: 'A04',
        name: 'Drawer Slot A04',
        anchorType: 'DRAWER',
        localPositionX: 100,
        localPositionY: 225,
        localPositionZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 400,
        boundingDepthMm: 380,
      },
      {
        code: 'A05',
        name: 'Drawer Slot A05',
        anchorType: 'DRAWER',
        localPositionX: 300,
        localPositionY: 225,
        localPositionZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 400,
        boundingDepthMm: 380,
      },
      {
        code: 'A06',
        name: 'Drawer Slot A06',
        anchorType: 'DRAWER',
        localPositionX: 500,
        localPositionY: 225,
        localPositionZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 400,
        boundingDepthMm: 380,
      },
    ],
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER`,
    name: 'Demo Drawer',
    format: 'PROCEDURAL',
    widthMm: 180,
    heightMm: 70,
    depthMm: 350,
    anchors: [
      {
        code: 'BIN01',
        name: 'Bin Compartment 01',
        anchorType: 'BIN',
        localPositionX: 45,
        localPositionY: 35,
        localPositionZ: 0,
        boundingWidthMm: 80,
        boundingHeightMm: 60,
        boundingDepthMm: 320,
      },
      {
        code: 'BIN02',
        name: 'Bin Compartment 02',
        anchorType: 'BIN',
        localPositionX: 135,
        localPositionY: 35,
        localPositionZ: 0,
        boundingWidthMm: 80,
        boundingHeightMm: 60,
        boundingDepthMm: 320,
      },
    ],
  },
  {
    code: `${SPATIAL_PREFIX}SHELF`,
    name: 'Demo Shelf',
    format: 'PROCEDURAL',
    widthMm: 1000,
    heightMm: 1500,
    depthMm: 350,
    anchors: [
      {
        code: 'S01',
        name: 'Shelf Level 01 (Top)',
        anchorType: 'SHELF',
        localPositionX: 500,
        localPositionY: 1250,
        localPositionZ: 0,
        boundingWidthMm: 950,
        boundingHeightMm: 450,
        boundingDepthMm: 330,
      },
      {
        code: 'S02',
        name: 'Shelf Level 02 (Middle)',
        anchorType: 'SHELF',
        localPositionX: 500,
        localPositionY: 750,
        localPositionZ: 0,
        boundingWidthMm: 950,
        boundingHeightMm: 450,
        boundingDepthMm: 330,
      },
      {
        code: 'S03',
        name: 'Shelf Level 03 (Bottom)',
        anchorType: 'SHELF',
        localPositionX: 500,
        localPositionY: 250,
        localPositionZ: 0,
        boundingWidthMm: 950,
        boundingHeightMm: 450,
        boundingDepthMm: 330,
      },
    ],
  },
];

/**
 * Ordered list of demo locations. Parents MUST appear before their children.
 */
export const LOCATIONS_HIERARCHY = [
  // Root facility
  {
    code: `${SPATIAL_PREFIX}WAREHOUSE`,
    name: 'Demo Spatial Logistics Warehouse',
    kind: 'warehouse',
    parentCode: null,
  },

  // Level 1: Under Warehouse
  {
    code: `${SPATIAL_PREFIX}CABINET-A`,
    name: 'Demo Cabinet A (SMD Storage)',
    kind: 'cabinet',
    parentCode: `${SPATIAL_PREFIX}WAREHOUSE`,
  },
  {
    code: `${SPATIAL_PREFIX}CABINET-B`,
    name: 'Demo Cabinet B (Hardware & ICs)',
    kind: 'cabinet',
    parentCode: `${SPATIAL_PREFIX}WAREHOUSE`,
  },
  {
    code: `${SPATIAL_PREFIX}SHELF-C`,
    name: 'Demo Shelf Unit C (Bulk Stock)',
    kind: 'shelf',
    parentCode: `${SPATIAL_PREFIX}WAREHOUSE`,
  },

  // Level 2: Under Cabinet A
  {
    code: `${SPATIAL_PREFIX}DRAWER-A01`,
    name: 'Demo Drawer A01',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-A`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-A02`,
    name: 'Demo Drawer A02',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-A`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-A03`,
    name: 'Demo Drawer A03',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-A`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-A04`,
    name: 'Demo Drawer A04',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-A`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-A05`,
    name: 'Demo Drawer A05',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-A`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-A06`,
    name: 'Demo Drawer A06 (Unmapped Slot)',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-A`,
  },

  // Level 3: Under Drawer A01
  {
    code: `${SPATIAL_PREFIX}BIN-A01-01`,
    name: 'Demo Bin A01-01',
    kind: 'bin',
    parentCode: `${SPATIAL_PREFIX}DRAWER-A01`,
  },
  {
    code: `${SPATIAL_PREFIX}BIN-A01-02`,
    name: 'Demo Bin A01-02',
    kind: 'bin',
    parentCode: `${SPATIAL_PREFIX}DRAWER-A01`,
  },

  // Level 3: Under Drawer A02
  {
    code: `${SPATIAL_PREFIX}BIN-A02-01`,
    name: 'Demo Bin A02-01',
    kind: 'bin',
    parentCode: `${SPATIAL_PREFIX}DRAWER-A02`,
  },
  {
    code: `${SPATIAL_PREFIX}BIN-A02-02`,
    name: 'Demo Bin A02-02',
    kind: 'bin',
    parentCode: `${SPATIAL_PREFIX}DRAWER-A02`,
  },

  // Level 3: Under Drawer A03 (Deliberately left unmapped)
  {
    code: `${SPATIAL_PREFIX}BIN-A03-01`,
    name: 'Demo Bin A03-01 (Unmapped)',
    kind: 'bin',
    parentCode: `${SPATIAL_PREFIX}DRAWER-A03`,
  },
  {
    code: `${SPATIAL_PREFIX}BIN-A03-02`,
    name: 'Demo Bin A03-02 (Unmapped)',
    kind: 'bin',
    parentCode: `${SPATIAL_PREFIX}DRAWER-A03`,
  },

  // Level 2: Under Cabinet B
  {
    code: `${SPATIAL_PREFIX}DRAWER-B01`,
    name: 'Demo Drawer B01',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-B`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-B02`,
    name: 'Demo Drawer B02',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-B`,
  },
  {
    code: `${SPATIAL_PREFIX}DRAWER-B03`,
    name: 'Demo Drawer B03 (Unmapped Slot)',
    kind: 'drawer',
    parentCode: `${SPATIAL_PREFIX}CABINET-B`,
  },

  // Level 2: Under Shelf C
  {
    code: `${SPATIAL_PREFIX}SHELF-C01`,
    name: 'Demo Shelf Level C01',
    kind: 'shelf',
    parentCode: `${SPATIAL_PREFIX}SHELF-C`,
  },
  {
    code: `${SPATIAL_PREFIX}SHELF-C02`,
    name: 'Demo Shelf Level C02',
    kind: 'shelf',
    parentCode: `${SPATIAL_PREFIX}SHELF-C`,
  },
  {
    code: `${SPATIAL_PREFIX}SHELF-C03`,
    name: 'Demo Shelf Level C03 (Unmapped Level)',
    kind: 'shelf',
    parentCode: `${SPATIAL_PREFIX}SHELF-C`,
  },
];

/**
 * Spatial Node mappings specification.
 *
 * Rules:
 * - Cabinet A mapped to DEMO-SPATIAL-CABINET-6
 * - Drawers A01..A05 mapped to anchors A01..A05 (A06 left unmapped)
 * - Drawers A01 & A02 assigned DEMO-SPATIAL-DRAWER model, with bins mapped to BIN01, BIN02
 * - Drawer A03 mapped to anchor A03, but bins BIN-A03-01 & BIN-A03-02 left unmapped
 * - Cabinet B mapped to DEMO-SPATIAL-CABINET-6, with B01->A01, B02->A02 (B03 unmapped)
 * - Shelf C mapped to DEMO-SPATIAL-SHELF, with C01->S01, C02->S02 (C03 unmapped)
 * - Warehouse remains unmapped root container
 */
export const SPATIAL_MAPPINGS = [
  // 1. Cabinet A container
  {
    locationCode: `${SPATIAL_PREFIX}CABINET-A`,
    modelCode: `${SPATIAL_PREFIX}CABINET-6`,
    parentLocationCode: null,
    anchorCode: null,
  },
  // Drawers under Cabinet A
  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-A01`,
    modelCode: `${SPATIAL_PREFIX}DRAWER`,
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-A`,
    anchorCode: 'A01',
  },
  {
    locationCode: `${SPATIAL_PREFIX}BIN-A01-01`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}DRAWER-A01`,
    anchorCode: 'BIN01',
  },
  {
    locationCode: `${SPATIAL_PREFIX}BIN-A01-02`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}DRAWER-A01`,
    anchorCode: 'BIN02',
  },

  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-A02`,
    modelCode: `${SPATIAL_PREFIX}DRAWER`,
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-A`,
    anchorCode: 'A02',
  },
  {
    locationCode: `${SPATIAL_PREFIX}BIN-A02-01`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}DRAWER-A02`,
    anchorCode: 'BIN01',
  },
  {
    locationCode: `${SPATIAL_PREFIX}BIN-A02-02`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}DRAWER-A02`,
    anchorCode: 'BIN02',
  },

  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-A03`,
    modelCode: null, // No drawer model; its bins remain unmapped
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-A`,
    anchorCode: 'A03',
  },
  // Note: BIN-A03-01 and BIN-A03-02 are intentionally omitted (unmapped test case)

  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-A04`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-A`,
    anchorCode: 'A04',
  },
  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-A05`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-A`,
    anchorCode: 'A05',
  },
  // Note: DRAWER-A06 is intentionally omitted (unmapped slot test case)

  // 2. Cabinet B container
  {
    locationCode: `${SPATIAL_PREFIX}CABINET-B`,
    modelCode: `${SPATIAL_PREFIX}CABINET-6`,
    parentLocationCode: null,
    anchorCode: null,
  },
  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-B01`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-B`,
    anchorCode: 'A01',
  },
  {
    locationCode: `${SPATIAL_PREFIX}DRAWER-B02`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}CABINET-B`,
    anchorCode: 'A02',
  },
  // Note: DRAWER-B03 is intentionally omitted (unmapped slot test case)

  // 3. Shelf C container
  {
    locationCode: `${SPATIAL_PREFIX}SHELF-C`,
    modelCode: `${SPATIAL_PREFIX}SHELF`,
    parentLocationCode: null,
    anchorCode: null,
  },
  {
    locationCode: `${SPATIAL_PREFIX}SHELF-C01`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}SHELF-C`,
    anchorCode: 'S01',
  },
  {
    locationCode: `${SPATIAL_PREFIX}SHELF-C02`,
    modelCode: null,
    parentLocationCode: `${SPATIAL_PREFIX}SHELF-C`,
    anchorCode: 'S02',
  },
  // Note: SHELF-C03 is intentionally omitted (unmapped shelf level test case)
];

export const COMPONENTS = [
  {
    sku: `${COMPONENT_PREFIX}R-10K-0805`,
    name: '10k Ohm 0805 SMD Resistor',
    description: '10 kOhm 1% 1/8W 0805 surface mount thick film resistor',
    manufacturerPartNumber: 'RC0805FR-0710KL',
    unit: 'pcs',
  },
  {
    sku: `${COMPONENT_PREFIX}C-100N-0805`,
    name: '100nF 50V 0805 MLCC Capacitor',
    description: '100 nF 50V X7R 0805 surface mount ceramic capacitor',
    manufacturerPartNumber: 'CC0805KRX7R9BB104',
    unit: 'pcs',
  },
  {
    sku: `${COMPONENT_PREFIX}R-100K-0603`,
    name: '100k Ohm 0603 SMD Resistor',
    description: '100 kOhm 1% 1/10W 0603 surface mount thick film resistor',
    manufacturerPartNumber: 'RC0603FR-07100KL',
    unit: 'pcs',
  },
  {
    sku: `${COMPONENT_PREFIX}LED-GREEN-0805`,
    name: 'Green 0805 SMD Indicator LED',
    description: '0805 standard intensity green LED 20mA 570nm',
    manufacturerPartNumber: 'LTST-C170KGKT',
    unit: 'pcs',
  },
  {
    sku: `${COMPONENT_PREFIX}IC-ATTINY`,
    name: 'ATtiny85 8-bit AVR Microcontroller',
    description: '8-bit AVR Microcontroller 20MHz 8KB Flash SOIC-8',
    manufacturerPartNumber: 'ATTINY85-20SU',
    unit: 'pcs',
  },
  {
    sku: `${COMPONENT_PREFIX}CONN-JST`,
    name: 'JST-XH 4-Pin 2.50mm Header',
    description: 'Through-hole vertical shrouded connector header 4-pin 2.5mm',
    manufacturerPartNumber: 'B4B-XH-A',
    unit: 'pcs',
  },
];

export const INVENTORY_TRANSACTIONS = [
  {
    componentSku: `${COMPONENT_PREFIX}R-10K-0805`,
    locationCode: `${SPATIAL_PREFIX}BIN-A01-01`,
    quantity: 5000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-001',
    reason: 'Spatial demo baseline stock for 10k resistor',
  },
  {
    componentSku: `${COMPONENT_PREFIX}C-100N-0805`,
    locationCode: `${SPATIAL_PREFIX}BIN-A01-02`,
    quantity: 3000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-002',
    reason: 'Spatial demo baseline stock for 100nF capacitor',
  },
  {
    componentSku: `${COMPONENT_PREFIX}R-100K-0603`,
    locationCode: `${SPATIAL_PREFIX}BIN-A02-01`,
    quantity: 2500,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-003',
    reason: 'Spatial demo baseline stock for 100k resistor',
  },
  {
    componentSku: `${COMPONENT_PREFIX}LED-GREEN-0805`,
    locationCode: `${SPATIAL_PREFIX}BIN-A02-02`,
    quantity: 1000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-004',
    reason: 'Spatial demo baseline stock for green LED',
  },
  {
    // Multiple physical stock locations test case
    componentSku: `${COMPONENT_PREFIX}R-10K-0805`,
    locationCode: `${SPATIAL_PREFIX}DRAWER-B01`,
    quantity: 2000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-005',
    reason: 'Secondary physical stock location for locate chooser test',
  },
  {
    // Deep hierarchy unmapped bin test case
    componentSku: `${COMPONENT_PREFIX}IC-ATTINY`,
    locationCode: `${SPATIAL_PREFIX}BIN-A03-01`,
    quantity: 50,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-006',
    reason: 'Deep hierarchy unmapped bin stock for ancestor resolution test',
  },
  {
    // Shelf stock test case
    componentSku: `${COMPONENT_PREFIX}CONN-JST`,
    locationCode: `${SPATIAL_PREFIX}SHELF-C01`,
    quantity: 500,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-007',
    reason: 'Shelf unit stock for connector headers',
  },
];
