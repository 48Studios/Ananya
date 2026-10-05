/**
 * Spatial Demo dataset definitions.
 *
 * All identifiers follow the required prefix conventions:
 * - Spatial entities (locations, models, layouts, anchors): DEMO-SPATIAL-
 * - Components & inventory: DEMO-
 *
 * The dataset is deterministic: it is declared by code (never by generated
 * UUID) and every derived dimension is computed from the parametric storage
 * engine at seed time, so re-seeding produces the same physical geometry on a
 * fresh database.
 *
 * Layout geometry is intentionally compact but complete:
 * - SMD_DRAWER_CABINET : 3 rows x 4 cols (primary cabinet) and 2x3 / 2x2
 * - OPEN_BIN_MATRIX    : 3 tiers x 5 bins (dense grid)
 * - PALLET_RACK        : 3 levels x 2 bays (wide rack bays) and the
 *                        warehouse bay plan (2 levels x 3 bays)
 * - GRID_PARTS_TRAY    : 3 rows x 4 cols (small square cells, archived)
 *
 * Template cell grids are uniform by construction (the engine subdivides the
 * container evenly), so "visibly different slot widths/heights" is exercised
 * across templates: rack bays are ~6x wider and ~2x shorter than the SMD
 * drawers, and tray cells are ~14x smaller. Within the primary cabinet the
 * drawer bodies deliberately differ (deep row vs shallow row).
 */
import { SPATIAL_PREFIX, COMPONENT_PREFIX } from './lib.mjs';

const S = SPATIAL_PREFIX;

const drawer = (suffix, parentCode, extra = {}) => ({
  code: `${S}DRAWER-${suffix}`,
  name: `Demo Drawer ${suffix}`,
  kind: 'drawer',
  parentCode,
  ...extra,
});

const bin = (suffix, parentCode, extra = {}) => ({
  code: `${S}BIN-${suffix}`,
  name: `Demo Bin ${suffix}`,
  kind: 'bin',
  parentCode,
  ...extra,
});

const openBin = (code, parentCode) => ({
  code: `${S}BIN-OB-${code}`,
  name: `Demo Open Bin ${code}`,
  kind: 'bin',
  parentCode,
});

const rackBay = (code) => ({
  code: `${S}RACK-${code.replace('-', '')}`,
  name: `Demo Rack Level ${code}`,
  kind: 'shelf',
  parentCode: `${S}RACK`,
});

const trayCell = (code) => ({
  code: `${S}TRAY-${code}`,
  name: `Demo Tray Cell ${code}`,
  kind: 'bin',
  parentCode: `${S}TRAY`,
});

/**
 * Ordered list of demo locations. Parents MUST appear before their children.
 *
 * Mapping-state intent per container:
 * - CABINET-A   PARTIAL   (published layout, 8/12 slots mapped, 2 drawer sizes)
 * - CABINET-B   MAPPED    (published layout, 6/6 slots mapped)
 * - CABINET-C   UNMAPPED  (draft layout, zero mappings — parent-first workflow)
 * - OPEN-BINS   PARTIAL   (published dense grid, 10/15 slots mapped)
 * - RACK        MAPPED    (published layout, 6/6 slots mapped)
 * - TRAY        UNMAPPED  (archived layout, no current mapping)
 * - SHELF       UNMAPPED  (no layout at all — containerStatus NONE)
 * - WAREHOUSE   ROOT      (facility root, published bay plan for its children)
 */
export const LOCATIONS_HIERARCHY = [
  // Root facility
  {
    code: `${S}WAREHOUSE`,
    name: 'Demo Spatial Logistics Warehouse',
    kind: 'warehouse',
    parentCode: null,
  },

  // Level 1: storage furniture under the warehouse
  {
    code: `${S}CABINET-A`,
    name: 'Demo Cabinet A (SMD Drawers, primary demo)',
    kind: 'cabinet',
    parentCode: `${S}WAREHOUSE`,
  },
  {
    code: `${S}CABINET-B`,
    name: 'Demo Cabinet B (Hardware & ICs)',
    kind: 'cabinet',
    parentCode: `${S}WAREHOUSE`,
  },
  {
    code: `${S}CABINET-C`,
    name: 'Demo Cabinet C (Draft layout)',
    kind: 'cabinet',
    parentCode: `${S}WAREHOUSE`,
  },
  {
    code: `${S}OPEN-BINS`,
    name: 'Demo Open Bin Wall',
    kind: 'cabinet',
    parentCode: `${S}WAREHOUSE`,
  },
  {
    code: `${S}RACK`,
    name: 'Demo Pallet Rack (Bulk Bays)',
    kind: 'rack',
    parentCode: `${S}WAREHOUSE`,
  },
  {
    code: `${S}TRAY`,
    name: 'Demo Parts Tray (Archived layout)',
    kind: 'tray',
    parentCode: `${S}WAREHOUSE`,
  },
  {
    code: `${S}SHELF`,
    name: 'Demo Shelf Unit (No layout)',
    kind: 'shelf',
    parentCode: `${S}WAREHOUSE`,
  },

  // Cabinet A: 3 rows x 4 columns = 12 drawers; row C is intentionally unmapped
  drawer('A01', `${S}CABINET-A`, {
    metadata: { capacity: 10000, capacityUnit: 'pcs' },
  }),
  drawer('A02', `${S}CABINET-A`, {
    metadata: { capacity: 5000, capacityUnit: 'pcs' },
  }),
  drawer('A03', `${S}CABINET-A`),
  drawer('A04', `${S}CABINET-A`),
  drawer('B01', `${S}CABINET-A`),
  drawer('B02', `${S}CABINET-A`),
  drawer('B03', `${S}CABINET-A`),
  drawer('B04', `${S}CABINET-A`),
  drawer('C01', `${S}CABINET-A`),
  drawer('C02', `${S}CABINET-A`),
  drawer('C03', `${S}CABINET-A`),
  drawer('C04', `${S}CABINET-A`),

  // Deep hierarchy under the primary drawer (mapped to drawer anchors)
  bin('A01-01', `${S}DRAWER-A01`, {
    metadata: { capacity: 8000, capacityUnit: 'pcs' },
  }),
  bin('A01-02', `${S}DRAWER-A01`),

  // Cabinet B: 2 rows x 3 columns = 6 drawers, all mapped
  drawer('D01', `${S}CABINET-B`),
  drawer('D02', `${S}CABINET-B`),
  drawer('D03', `${S}CABINET-B`),
  drawer('E01', `${S}CABINET-B`),
  drawer('E02', `${S}CABINET-B`),
  drawer('E03', `${S}CABINET-B`),

  // Cabinet C: draft layout, child slots initially unmapped
  drawer('F01', `${S}CABINET-C`),
  drawer('F02', `${S}CABINET-C`),
  drawer('G01', `${S}CABINET-C`),
  drawer('G02', `${S}CABINET-C`),

  // Open bin wall: 3 tiers x 5 bins = 15; tier A intentionally unmapped
  ...[
    'A01',
    'A02',
    'A03',
    'A04',
    'A05',
    'B01',
    'B02',
    'B03',
    'B04',
    'B05',
    'C01',
    'C02',
    'C03',
    'C04',
    'C05',
  ].map((code) => openBin(code, `${S}OPEN-BINS`)),

  // Pallet rack: 3 levels x 2 bays = 6, all mapped
  ...['L1-B1', 'L1-B2', 'L2-B1', 'L2-B2', 'L3-B1', 'L3-B2'].map((code) =>
    rackBay(code),
  ),

  // Parts tray: 3 rows x 4 columns = 12 cells (archived layout, unmapped now)
  ...[
    'A01',
    'A02',
    'A03',
    'A04',
    'B01',
    'B02',
    'B03',
    'B04',
    'C01',
    'C02',
    'C03',
    'C04',
  ].map((code) => trayCell(code)),

  // Shelf unit: no layout; levels carry stock to prove inventory independence
  {
    code: `${S}SHELF-L1`,
    name: 'Demo Shelf Level 1 (Top)',
    kind: 'shelf',
    parentCode: `${S}SHELF`,
  },
  {
    code: `${S}SHELF-L2`,
    name: 'Demo Shelf Level 2 (Middle)',
    kind: 'shelf',
    parentCode: `${S}SHELF`,
    metadata: { capacity: 2000, capacityUnit: 'pcs' },
  },
  {
    code: `${S}SHELF-L3`,
    name: 'Demo Shelf Level 3 (Bottom)',
    kind: 'shelf',
    parentCode: `${S}SHELF`,
  },
];

/**
 * Parametric layouts, created and published through the same REST endpoints the
 * Inventory Builder uses. `status` is the desired end state:
 * - PUBLISHED : create draft -> publish (reconciles builder-owned nodes)
 * - DRAFT     : create draft only (parent-first mapping workflow)
 * - ARCHIVED  : create draft -> publish -> archive (nodes pruned by archive)
 */
export const LAYOUTS = [
  {
    code: `${S}LAYOUT-WAREHOUSE`,
    name: 'Demo Warehouse Bay Plan',
    parentCode: `${S}WAREHOUSE`,
    templateType: 'PALLET_RACK',
    status: 'PUBLISHED',
    changeDescription: 'Demo seed: warehouse bay plan publication',
    config: {
      templateType: 'PALLET_RACK',
      dimensions: { widthMm: 2600, heightMm: 2400, depthMm: 900 },
      wallThicknessMm: 60,
      uprightPostWidthMm: 60,
      beamHeightMm: 80,
      levels: 2,
      baysPerLevel: 3,
      naming: { pattern: 'LEVEL_BAY_NUMERIC', rowOrder: 'bottom_to_top' },
    },
    mappings: [
      { slotCode: 'L1-B1', locationCode: `${S}CABINET-A` },
      { slotCode: 'L1-B2', locationCode: `${S}CABINET-B` },
      { slotCode: 'L1-B3', locationCode: `${S}OPEN-BINS` },
      { slotCode: 'L2-B1', locationCode: `${S}RACK` },
      // L2-B2 / L2-B3 intentionally vacant
    ],
  },
  {
    code: `${S}LAYOUT-CAB-A`,
    name: 'Demo Cabinet A Drawer Layout',
    parentCode: `${S}CABINET-A`,
    templateType: 'SMD_DRAWER_CABINET',
    status: 'PUBLISHED',
    changeDescription: 'Demo seed: primary cabinet publication',
    config: {
      templateType: 'SMD_DRAWER_CABINET',
      dimensions: { widthMm: 720, heightMm: 900, depthMm: 320 },
      wallThicknessMm: 12,
      dividerThicknessMm: 4,
      rows: 3,
      columns: 4,
      naming: {
        pattern: 'ROW_COL_ALPHA_NUM',
        padDigits: 2,
        rowOrder: 'top_to_bottom',
      },
    },
    // Rows A and B are mapped; row C is intentionally unmapped (PARTIAL).
    mappings: [
      { slotCode: 'A01', locationCode: `${S}DRAWER-A01` },
      { slotCode: 'A02', locationCode: `${S}DRAWER-A02` },
      { slotCode: 'A03', locationCode: `${S}DRAWER-A03` },
      { slotCode: 'A04', locationCode: `${S}DRAWER-A04` },
      { slotCode: 'B01', locationCode: `${S}DRAWER-B01` },
      { slotCode: 'B02', locationCode: `${S}DRAWER-B02` },
      { slotCode: 'B03', locationCode: `${S}DRAWER-B03` },
      { slotCode: 'B04', locationCode: `${S}DRAWER-B04` },
    ],
  },
  {
    code: `${S}LAYOUT-CAB-B`,
    name: 'Demo Cabinet B Drawer Layout',
    parentCode: `${S}CABINET-B`,
    templateType: 'SMD_DRAWER_CABINET',
    status: 'PUBLISHED',
    changeDescription: 'Demo seed: fully mapped cabinet publication',
    config: {
      templateType: 'SMD_DRAWER_CABINET',
      dimensions: { widthMm: 600, heightMm: 900, depthMm: 400 },
      wallThicknessMm: 12,
      dividerThicknessMm: 4,
      rows: 2,
      columns: 3,
      naming: {
        pattern: 'ROW_COL_ALPHA_NUM',
        padDigits: 2,
        rowOrder: 'top_to_bottom',
      },
    },
    mappings: [
      { slotCode: 'A01', locationCode: `${S}DRAWER-D01` },
      { slotCode: 'A02', locationCode: `${S}DRAWER-D02` },
      { slotCode: 'A03', locationCode: `${S}DRAWER-D03` },
      { slotCode: 'B01', locationCode: `${S}DRAWER-E01` },
      { slotCode: 'B02', locationCode: `${S}DRAWER-E02` },
      { slotCode: 'B03', locationCode: `${S}DRAWER-E03` },
    ],
  },
  {
    code: `${S}LAYOUT-CAB-C`,
    name: 'Demo Cabinet C Draft Layout',
    parentCode: `${S}CABINET-C`,
    templateType: 'SMD_DRAWER_CABINET',
    status: 'DRAFT',
    config: {
      templateType: 'SMD_DRAWER_CABINET',
      dimensions: { widthMm: 420, heightMm: 620, depthMm: 300 },
      wallThicknessMm: 12,
      dividerThicknessMm: 4,
      rows: 2,
      columns: 2,
      naming: {
        pattern: 'ROW_COL_ALPHA_NUM',
        padDigits: 2,
        rowOrder: 'top_to_bottom',
      },
    },
    // Deliberately zero mappings: parent-first workflow starts here.
    mappings: [],
  },
  {
    code: `${S}LAYOUT-OPEN-BINS`,
    name: 'Demo Open Bin Wall Layout',
    parentCode: `${S}OPEN-BINS`,
    templateType: 'OPEN_BIN_MATRIX',
    status: 'PUBLISHED',
    changeDescription: 'Demo seed: dense open bin grid publication',
    config: {
      templateType: 'OPEN_BIN_MATRIX',
      dimensions: { widthMm: 1000, heightMm: 600, depthMm: 220 },
      wallThicknessMm: 10,
      tiers: 3,
      binsPerTier: 5,
      tierSpacingMm: 12,
      binSpacingMm: 8,
      naming: {
        pattern: 'ROW_COL_ALPHA_NUM',
        padDigits: 2,
        rowOrder: 'top_to_bottom',
      },
    },
    // Tiers B and C are mapped; tier A is intentionally unmapped (PARTIAL).
    mappings: [
      { slotCode: 'B01', locationCode: `${S}BIN-OB-B01` },
      { slotCode: 'B02', locationCode: `${S}BIN-OB-B02` },
      { slotCode: 'B03', locationCode: `${S}BIN-OB-B03` },
      { slotCode: 'B04', locationCode: `${S}BIN-OB-B04` },
      { slotCode: 'B05', locationCode: `${S}BIN-OB-B05` },
      { slotCode: 'C01', locationCode: `${S}BIN-OB-C01` },
      { slotCode: 'C02', locationCode: `${S}BIN-OB-C02` },
      { slotCode: 'C03', locationCode: `${S}BIN-OB-C03` },
      { slotCode: 'C04', locationCode: `${S}BIN-OB-C04` },
      { slotCode: 'C05', locationCode: `${S}BIN-OB-C05` },
    ],
  },
  {
    code: `${S}LAYOUT-RACK`,
    name: 'Demo Pallet Rack Layout',
    parentCode: `${S}RACK`,
    templateType: 'PALLET_RACK',
    status: 'PUBLISHED',
    changeDescription: 'Demo seed: pallet rack publication',
    config: {
      templateType: 'PALLET_RACK',
      dimensions: { widthMm: 2200, heightMm: 2400, depthMm: 900 },
      wallThicknessMm: 60,
      uprightPostWidthMm: 60,
      beamHeightMm: 80,
      levels: 3,
      baysPerLevel: 2,
      naming: { pattern: 'LEVEL_BAY_NUMERIC', rowOrder: 'bottom_to_top' },
    },
    mappings: [
      { slotCode: 'L1-B1', locationCode: `${S}RACK-L1B1` },
      { slotCode: 'L1-B2', locationCode: `${S}RACK-L1B2` },
      { slotCode: 'L2-B1', locationCode: `${S}RACK-L2B1` },
      { slotCode: 'L2-B2', locationCode: `${S}RACK-L2B2` },
      { slotCode: 'L3-B1', locationCode: `${S}RACK-L3B1` },
      { slotCode: 'L3-B2', locationCode: `${S}RACK-L3B2` },
    ],
  },
  {
    code: `${S}LAYOUT-TRAY`,
    name: 'Demo Parts Tray Layout (Archived)',
    parentCode: `${S}TRAY`,
    templateType: 'GRID_PARTS_TRAY',
    status: 'ARCHIVED',
    changeDescription: 'Demo seed: tray layout archived after decommissioning',
    config: {
      templateType: 'GRID_PARTS_TRAY',
      dimensions: { widthMm: 300, heightMm: 200, depthMm: 60 },
      wallThicknessMm: 6,
      dividerThicknessMm: 2,
      rows: 3,
      columns: 4,
      naming: {
        pattern: 'ROW_COL_ALPHA_NUM',
        padDigits: 2,
        rowOrder: 'top_to_bottom',
      },
    },
    mappings: [
      { slotCode: 'A01', locationCode: `${S}TRAY-A01` },
      { slotCode: 'A02', locationCode: `${S}TRAY-A02` },
      { slotCode: 'A03', locationCode: `${S}TRAY-A03` },
      { slotCode: 'A04', locationCode: `${S}TRAY-A04` },
      { slotCode: 'B01', locationCode: `${S}TRAY-B01` },
      { slotCode: 'B02', locationCode: `${S}TRAY-B02` },
      { slotCode: 'B03', locationCode: `${S}TRAY-B03` },
      { slotCode: 'B04', locationCode: `${S}TRAY-B04` },
      { slotCode: 'C01', locationCode: `${S}TRAY-C01` },
      { slotCode: 'C02', locationCode: `${S}TRAY-C02` },
      { slotCode: 'C03', locationCode: `${S}TRAY-C03` },
      { slotCode: 'C04', locationCode: `${S}TRAY-C04` },
    ],
  },
];

/**
 * Spatial models. `from` derives millimetre dimensions from generated layout
 * geometry so the operational 2D/3D viewers render exactly the slot the
 * builder authored:
 * - use: 'container' -> the layout's configured container dimensions
 * - use: 'slot'      -> a generated compartment's outer envelope, scaled by
 *                       the optional width/height/depth ratios
 * Anchors are declared as ratios of the model dimensions.
 */
export const MODEL_SPECS = [
  {
    code: `${S}MODEL-CABINET-A`,
    name: 'Demo Cabinet A carcass',
    from: { layoutCode: `${S}LAYOUT-CAB-A`, use: 'container' },
    anchors: [],
  },
  {
    code: `${S}MODEL-CABINET-B`,
    name: 'Demo Cabinet B carcass',
    from: { layoutCode: `${S}LAYOUT-CAB-B`, use: 'container' },
    anchors: [],
  },
  {
    code: `${S}MODEL-OPEN-BINS`,
    name: 'Demo Open Bin Wall carcass',
    from: { layoutCode: `${S}LAYOUT-OPEN-BINS`, use: 'container' },
    anchors: [],
  },
  {
    code: `${S}MODEL-RACK`,
    name: 'Demo Pallet Rack carcass',
    from: { layoutCode: `${S}LAYOUT-RACK`, use: 'container' },
    anchors: [],
  },
  {
    code: `${S}MODEL-DRAWER-DEEP`,
    name: 'Demo Deep Drawer (Cabinet A row A)',
    from: { layoutCode: `${S}LAYOUT-CAB-A`, use: 'slot' },
    anchors: [
      {
        code: 'BIN01',
        name: 'Bin Compartment 01',
        anchorType: 'BIN',
        xRatio: 0.25,
        yRatio: 0.5,
        zMm: 0,
        boundingWidthRatio: 0.4,
        boundingHeightRatio: 0.8,
        boundingDepthRatio: 0.9,
      },
      {
        code: 'BIN02',
        name: 'Bin Compartment 02',
        anchorType: 'BIN',
        xRatio: 0.75,
        yRatio: 0.5,
        zMm: 0,
        boundingWidthRatio: 0.4,
        boundingHeightRatio: 0.8,
        boundingDepthRatio: 0.9,
      },
    ],
  },
  {
    code: `${S}MODEL-DRAWER-SHALLOW`,
    name: 'Demo Shallow Drawer (Cabinet A row B)',
    from: { layoutCode: `${S}LAYOUT-CAB-A`, use: 'slot', heightRatio: 0.5 },
    anchors: [],
  },
  {
    code: `${S}MODEL-DRAWER-B`,
    name: 'Demo Drawer (Cabinet B)',
    from: { layoutCode: `${S}LAYOUT-CAB-B`, use: 'slot' },
    anchors: [],
  },
  {
    code: `${S}MODEL-OPEN-BIN`,
    name: 'Demo Open Bin',
    from: { layoutCode: `${S}LAYOUT-OPEN-BINS`, use: 'slot' },
    anchors: [],
  },
  {
    code: `${S}MODEL-RACK-BAY`,
    name: 'Demo Rack Bay',
    from: { layoutCode: `${S}LAYOUT-RACK`, use: 'slot' },
    anchors: [],
  },
];

/**
 * Attaches a model to the builder-owned node of an already published location.
 * This keeps builder ownership metadata intact while giving the operational
 * viewer the same physical dimensions the builder authored.
 */
export const NODE_MODEL_ASSIGNMENTS = [
  { locationCode: `${S}CABINET-A`, modelCode: `${S}MODEL-CABINET-A` },
  { locationCode: `${S}CABINET-B`, modelCode: `${S}MODEL-CABINET-B` },
  { locationCode: `${S}OPEN-BINS`, modelCode: `${S}MODEL-OPEN-BINS` },
  { locationCode: `${S}RACK`, modelCode: `${S}MODEL-RACK` },
  { locationCode: `${S}DRAWER-A01`, modelCode: `${S}MODEL-DRAWER-DEEP` },
  { locationCode: `${S}DRAWER-A02`, modelCode: `${S}MODEL-DRAWER-DEEP` },
  { locationCode: `${S}DRAWER-A03`, modelCode: `${S}MODEL-DRAWER-DEEP` },
  { locationCode: `${S}DRAWER-A04`, modelCode: `${S}MODEL-DRAWER-DEEP` },
  { locationCode: `${S}DRAWER-B01`, modelCode: `${S}MODEL-DRAWER-SHALLOW` },
  { locationCode: `${S}DRAWER-B02`, modelCode: `${S}MODEL-DRAWER-SHALLOW` },
  { locationCode: `${S}DRAWER-B03`, modelCode: `${S}MODEL-DRAWER-SHALLOW` },
  { locationCode: `${S}DRAWER-B04`, modelCode: `${S}MODEL-DRAWER-SHALLOW` },
  { locationCode: `${S}DRAWER-D01`, modelCode: `${S}MODEL-DRAWER-B` },
  { locationCode: `${S}DRAWER-D02`, modelCode: `${S}MODEL-DRAWER-B` },
  { locationCode: `${S}DRAWER-D03`, modelCode: `${S}MODEL-DRAWER-B` },
  { locationCode: `${S}DRAWER-E01`, modelCode: `${S}MODEL-DRAWER-B` },
  { locationCode: `${S}DRAWER-E02`, modelCode: `${S}MODEL-DRAWER-B` },
  { locationCode: `${S}DRAWER-E03`, modelCode: `${S}MODEL-DRAWER-B` },
  ...[
    'B01',
    'B02',
    'B03',
    'B04',
    'B05',
    'C01',
    'C02',
    'C03',
    'C04',
    'C05',
  ].map((code) => ({
    locationCode: `${S}BIN-OB-${code}`,
    modelCode: `${S}MODEL-OPEN-BIN`,
  })),
  ...['L1-B1', 'L1-B2', 'L2-B1', 'L2-B2', 'L3-B1', 'L3-B2'].map((code) => ({
    locationCode: `${S}RACK-${code.replace('-', '')}`,
    modelCode: `${S}MODEL-RACK-BAY`,
  })),
];

/**
 * Deep-hierarchy nodes that are placed against an anchor of their parent's
 * model (the mapping dialog's child-anchor flow), not against a layout slot.
 */
export const NESTED_NODE_MAPPINGS = [
  {
    locationCode: `${S}BIN-A01-01`,
    parentLocationCode: `${S}DRAWER-A01`,
    anchorCode: 'BIN01',
  },
  {
    locationCode: `${S}BIN-A01-02`,
    parentLocationCode: `${S}DRAWER-A01`,
    anchorCode: 'BIN02',
  },
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
  {
    sku: `${COMPONENT_PREFIX}FAST-M3`,
    name: 'M3 x 8mm Stainless Fastener',
    description: 'M3 x 8mm A2 stainless steel pan head machine screw',
    manufacturerPartNumber: 'DIN-7985-M3X8-A2',
    unit: 'pcs',
  },
];

/**
 * Demo stock. Deliberately spread across:
 * - mapped layout slots (deep bin, drawer, open bin, rack bay)
 * - an intentionally unmapped child (DRAWER-C01, row C of the partial cabinet)
 * - a container with no layout at all (SHELF-L2)
 * - a second physical location for the 10k resistor (locate chooser test)
 */
export const INVENTORY_TRANSACTIONS = [
  {
    componentSku: `${COMPONENT_PREFIX}R-10K-0805`,
    locationCode: `${S}BIN-A01-01`,
    quantity: 5000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-001',
    reason: 'Spatial demo baseline stock: 10k resistor in mapped deep bin',
  },
  {
    componentSku: `${COMPONENT_PREFIX}C-100N-0805`,
    locationCode: `${S}BIN-A01-02`,
    quantity: 3000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-002',
    reason: 'Spatial demo baseline stock: 100nF capacitor in mapped deep bin',
  },
  {
    componentSku: `${COMPONENT_PREFIX}R-100K-0603`,
    locationCode: `${S}DRAWER-A02`,
    quantity: 2500,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-003',
    reason: 'Spatial demo baseline stock: 100k resistor in mapped drawer',
  },
  {
    componentSku: `${COMPONENT_PREFIX}LED-GREEN-0805`,
    locationCode: `${S}DRAWER-B01`,
    quantity: 1000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-004',
    reason: 'Spatial demo baseline stock: green LED in shallow drawer',
  },
  {
    componentSku: `${COMPONENT_PREFIX}IC-ATTINY`,
    locationCode: `${S}DRAWER-C01`,
    quantity: 50,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-005',
    reason:
      'Spatial demo baseline stock: unmapped drawer (inventory independent of mapping)',
  },
  {
    componentSku: `${COMPONENT_PREFIX}CONN-JST`,
    locationCode: `${S}RACK-L1B1`,
    quantity: 500,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-006',
    reason: 'Spatial demo baseline stock: connector headers in mapped rack bay',
  },
  {
    componentSku: `${COMPONENT_PREFIX}FAST-M3`,
    locationCode: `${S}SHELF-L2`,
    quantity: 1200,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-007',
    reason:
      'Spatial demo baseline stock: fasteners on a container with no layout',
  },
  {
    componentSku: `${COMPONENT_PREFIX}R-10K-0805`,
    locationCode: `${S}DRAWER-D01`,
    quantity: 2000,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-008',
    reason: 'Spatial demo secondary stock location: multi-location locate chooser',
  },
  {
    componentSku: `${COMPONENT_PREFIX}C-100N-0805`,
    locationCode: `${S}BIN-OB-B01`,
    quantity: 800,
    unitOfMeasure: 'pcs',
    transactionType: 'Receipt',
    reference: 'DEMO-TX-INIT-009',
    reason: 'Spatial demo baseline stock: capacitor in mapped open bin',
  },
];
