/**
 * AI-TEST dataset definition.
 *
 * Declarative only — `seed.mjs` performs the writes. Every identifier that
 * exists in the ERP (manufacturer, category, attribute definition) is
 * referenced by CODE and resolved to a real id at seed time; nothing here
 * invents a UUID.
 *
 * Naming convention: the `AI-TEST-` prefix is applied to component names so the
 * dataset is searchable and removable. The prefix token is deliberately chosen
 * so the MPN extractor skips it: `AI-TEST` carries no digit, and
 * `extractCandidateMpnFromText` requires a letter AND a digit, so the scanner
 * moves on to the real part number later in the text.
 *
 * Reference: docs + `packages/database/src/schema`, the electronics-smd Data
 * Pack (`apps/api/src/data-packs/packs/electronics-smd-pack.ts`).
 */
import { DOC_MARKER, TEST_PREFIX } from './lib.mjs';

// ---------------------------------------------------------------------------
// ERP master data (created only when the code is absent)
// ---------------------------------------------------------------------------

export const MANUFACTURERS = [
  { code: 'YAGEO', name: 'Yageo' },
  { code: 'MURATA', name: 'Murata' },
  { code: 'TDK', name: 'TDK' },
  { code: 'SAMSUNG', name: 'Samsung Electro-Mechanics' },
  { code: 'VISHAY', name: 'Vishay' },
  { code: 'PANASONIC', name: 'Panasonic' },
  { code: 'TI', name: 'Texas Instruments' },
  { code: 'ST', name: 'STMicroelectronics' },
  { code: 'INFINEON', name: 'Infineon' },
  { code: 'NEXPERIA', name: 'Nexperia' },
  { code: 'ADI', name: 'Analog Devices' },
  { code: 'MICROCHIP', name: 'Microchip Technology' },
  { code: 'RASPBERRYPI', name: 'Raspberry Pi' },
  { code: 'ADAFRUIT', name: 'Adafruit Industries' },
  { code: 'WAVESHARE', name: 'Waveshare' },
];

/**
 * Category names are NOT free-form: the deterministic and ML category
 * resolvers match a DB category by exact name, so the names must equal the
 * Data Pack `categoryName` values (Resistors, Capacitors, Inductors, Diodes,
 * Transistors, ICs & Semiconductors) or the Python classifier's LEGACY_PARENTS
 * vocabulary.
 */
export const CATEGORIES = [
  { code: 'ELEC', name: 'Electronic Components', parent: null },
  { code: 'RES', name: 'Resistors', parent: 'ELEC' },
  { code: 'CAP', name: 'Capacitors', parent: 'ELEC' },
  { code: 'IND', name: 'Inductors', parent: 'ELEC' },
  { code: 'DIO', name: 'Diodes', parent: 'ELEC' },
  { code: 'TRAN', name: 'Transistors', parent: 'ELEC' },
  { code: 'ICSEM', name: 'ICs & Semiconductors', parent: 'ELEC' },
  { code: 'CONN', name: 'Connectors', parent: 'ELEC' },
  { code: 'OPTO', name: 'Optoelectronics', parent: 'ELEC' },
  { code: 'SWITCH', name: 'Switches', parent: 'ELEC' },
  { code: 'PROTO', name: 'Prototyping', parent: 'ELEC' },
  // Second ROOT, deliberately outside the electronic-components hierarchy so a
  // mis-filed component produces a real CATEGORY_CONFLICT (re-parenting within
  // one hierarchy is a refinement, not a conflict).
  { code: 'MECH', name: 'Mechanical Parts', parent: null },
];

/**
 * Category → attribute-definition bindings (real `category_attributes` rows).
 * These are what make the Attribute Review Queue's ADD_BINDING findings
 * actionable and what surface the "unused attribute" / "suspicious binding"
 * families.
 */
export const CATEGORY_BINDINGS = {
  RES: ['resistance', 'tolerance', 'power_rating', 'package', 'mounting_type'],
  CAP: [
    'capacitance',
    'voltage_rating',
    'tolerance',
    'dielectric',
    'package',
    'mounting_type',
  ],
  IND: ['package', 'mounting_type'],
  DIO: ['package', 'mounting_type', 'voltage_rating'],
  TRAN: ['package', 'mounting_type'],
  ICSEM: ['package', 'mounting_type', 'voltage_rating'],
  CONN: ['package', 'mounting_type', 'pin_count', 'pitch', 'connector_type'],
  PROTO: ['package', 'mounting_type'],
};

/**
 * DELIBERATE test fixture.
 *
 * The attribute audit's only SUSPICIOUS_BINDING producer rule is
 * `"resistance" in attributeCode AND ("capacitor" in category OR "diode" in
 * category)` (apps/ml/app/services/attribute_intelligence.py). No other input
 * reaches that rule, so exercising the SUSPICIOUS tab requires one binding of
 * that exact shape. It is removed by `cleanup.mjs` like every other dataset row.
 */
export const SUSPICIOUS_BINDINGS = [
  { attributeCode: 'resistance', categoryCode: 'CAP' },
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * `group` records the test intent from the seeding brief so the UI walkthrough
 * and the cleanup report can be read without cross-referencing code.
 *
 * Attribute payloads use the real domain contract:
 *   QUANTITY -> { code, value, unit }
 *   NUMBER   -> { code, value }
 *   INTEGER  -> { code, value }
 *   SELECT   -> { code, optionCode }
 */
export const COMPONENTS = [
  // -- Group A: already well classified (baseline "good records") -----------
  {
    key: 'A1',
    group: 'A',
    name: `${TEST_PREFIX}YAGEO-10K-0603`,
    description:
      'Yageo RC series thick film chip resistor, 10 kOhm, 1%, 1/10 W, 0603 (1608 metric) SMD.',
    mpn: 'RC0603FR-0710KL',
    manufacturer: 'YAGEO',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 10000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'power_rating', value: 0.1, unit: 'W' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'A2',
    group: 'A',
    name: `${TEST_PREFIX}YAGEO-1K-0603`,
    description:
      'Yageo RC series thick film chip resistor, 1 kOhm, 1%, 1/10 W, 0603 (1608 metric) SMD.',
    mpn: 'RC0603FR-071KL',
    manufacturer: 'YAGEO',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 1000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'power_rating', value: 0.1, unit: 'W' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'A3',
    group: 'A',
    name: `${TEST_PREFIX}VISHAY-4K7-0805`,
    description:
      'Vishay CRCW series thick film chip resistor, 4.7 kOhm, 1%, 1/8 W, 0805 (2012 metric) SMD.',
    mpn: 'CRCW08054K70FKEA',
    manufacturer: 'VISHAY',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 4700, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'power_rating', value: 0.125, unit: 'W' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'A4',
    group: 'A',
    name: `${TEST_PREFIX}MURATA-100NF-0603`,
    description:
      'Murata GRM series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 10%, 0603 (1608 metric) SMD.',
    mpn: 'GRM188R71H104KA93D',
    manufacturer: 'MURATA',
    category: 'CAP',
    unit: 'pcs',
    attributes: [
      { code: 'capacitance', value: 0.1, unit: 'uF' },
      { code: 'voltage_rating', value: 50, unit: 'V' },
      { code: 'tolerance', value: 10, unit: '%' },
      { code: 'dielectric', optionCode: 'X7R' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'A5',
    group: 'A',
    name: `${TEST_PREFIX}SAMSUNG-1UF-0805`,
    description:
      'Samsung Electro-Mechanics CL series multilayer ceramic capacitor, 1 uF, 25 V, X5R, 10%, 0805 (2012 metric) SMD.',
    mpn: 'CL21A105KBFNNNE',
    manufacturer: 'SAMSUNG',
    category: 'CAP',
    unit: 'pcs',
    attributes: [
      { code: 'capacitance', value: 1, unit: 'uF' },
      { code: 'voltage_rating', value: 25, unit: 'V' },
      { code: 'tolerance', value: 10, unit: '%' },
      { code: 'dielectric', optionCode: 'X5R' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'A6',
    group: 'A',
    name: `${TEST_PREFIX}TDK-10UF-0805`,
    description:
      'TDK C series multilayer ceramic capacitor, 10 uF, 10 V, X5R, 20%, 0805 (2012 metric) SMD.',
    mpn: 'C2012X5R1A106M125AB',
    manufacturer: 'TDK',
    category: 'CAP',
    unit: 'pcs',
    attributes: [
      { code: 'capacitance', value: 10, unit: 'uF' },
      { code: 'voltage_rating', value: 10, unit: 'V' },
      { code: 'tolerance', value: 20, unit: '%' },
      { code: 'dielectric', optionCode: 'X5R' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'A7',
    group: 'A',
    name: `${TEST_PREFIX}TI-LM358`,
    description:
      'Texas Instruments LM358 dual operational amplifier, SOIC-8, SMD, -40 to +85 C.',
    mpn: 'LM358DR',
    manufacturer: 'TI',
    category: 'ICSEM',
    unit: 'pcs',
    attributes: [
      { code: 'package', optionCode: 'SOIC-8' },
      { code: 'mounting_type', optionCode: 'SMD' },
      { code: 'operating_temp_min', value: -40, unit: '°C' },
      { code: 'operating_temp_max', value: 85, unit: '°C' },
    ],
  },
  {
    key: 'A8',
    group: 'A',
    name: `${TEST_PREFIX}ST-AMS1117-33`,
    description:
      'STMicroelectronics AMS1117-3.3 low dropout linear regulator, 3.3 V fixed output, SOT-223, SMD.',
    mpn: 'AMS1117-3.3',
    manufacturer: 'ST',
    category: 'ICSEM',
    unit: 'pcs',
    attributes: [
      { code: 'package', optionCode: 'SOT-223' },
      { code: 'mounting_type', optionCode: 'SMD' },
      { code: 'operating_temp_min', value: -40, unit: '°C' },
      { code: 'operating_temp_max', value: 125, unit: '°C' },
    ],
  },

  // -- Group B: deliberately incomplete classification ----------------------
  // Only legitimately optional fields are omitted (manufacturer and category
  // are both nullable in `components`).
  {
    key: 'B9',
    group: 'B',
    name: `${TEST_PREFIX}B-NO-MFR-MURATA-CAP`,
    description:
      'Murata GRM series multilayer ceramic capacitor, 10 uF, 16 V, X5R, 10%, 1206 (3216 metric) SMD. Manufacturer not recorded.',
    mpn: 'GRM31CR61C106KA88L',
    manufacturer: null,
    category: 'CAP',
    unit: 'pcs',
    attributes: [],
  },
  {
    key: 'B10',
    group: 'B',
    name: `${TEST_PREFIX}B-NO-CAT-VISHAY-RES`,
    description:
      'Vishay CRCW series thick film chip resistor, 220 Ohm, 1%, 1/8 W, 0805 (2012 metric) SMD. Category not recorded.',
    mpn: 'CRCW0805220RFKEA',
    manufacturer: 'VISHAY',
    category: null,
    unit: 'pcs',
    attributes: [{ code: 'resistance', value: 220, unit: 'ohm' }],
  },
  {
    key: 'B11',
    group: 'B',
    name: `${TEST_PREFIX}B-NO-CAT-NEXPERIA-LOGIC`,
    description:
      'Nexperia 74HC595 8-bit serial-in parallel-out shift register with output latches, TSSOP-16, SMD. Category not recorded.',
    mpn: '74HC595PW',
    manufacturer: 'NEXPERIA',
    category: null,
    unit: 'pcs',
    attributes: [],
  },
  {
    key: 'B12',
    group: 'B',
    name: `${TEST_PREFIX}B-NO-MFR-PANASONIC-RES`,
    description:
      'Panasonic ERJ series thick film chip resistor, 10 kOhm, 1%, 1/8 W, 0805 (2012 metric) SMD. Manufacturer not recorded.',
    mpn: 'ERJ8ENF1002V',
    manufacturer: null,
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 10000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'B13',
    group: 'B',
    name: `${TEST_PREFIX}B-NO-MFR-NO-CAT-INFINEON-IRF540N`,
    description:
      'Infineon HEXFET power MOSFET, 100 V, 33 A, N-channel, TO-220 through hole. Manufacturer and category not recorded.',
    mpn: 'IRF540NPBF',
    manufacturer: null,
    category: null,
    unit: 'pcs',
    attributes: [],
  },

  // -- Group C: MPN / identity extraction ----------------------------------
  // No MPN persisted. The marker carries no digit so the extractor skips it and
  // the real part number is only discoverable from the attached datasheet.
  {
    key: 'C14',
    group: 'C',
    name: `${TEST_PREFIX}MPN-NOISY-ALPHA`,
    description:
      'Yageo RC series thick film chip resistor, 10 kOhm, 1%, 0402 (1005 metric) SMD. Manufacturer part number stated in the attached datasheet only.',
    mpn: null,
    manufacturer: 'YAGEO',
    category: 'RES',
    unit: 'pcs',
    attributes: [],
  },
  {
    key: 'C15',
    group: 'C',
    name: `${TEST_PREFIX}MPN-NOISY-BETA`,
    description:
      'Murata GRM series multilayer ceramic capacitor, 100 nF, 16 V, X7R, 0402 (1005 metric) SMD. Manufacturer part number stated in the attached datasheet only.',
    mpn: null,
    manufacturer: 'MURATA',
    category: 'CAP',
    unit: 'pcs',
    attributes: [],
  },
  {
    key: 'C16',
    group: 'C',
    name: `${TEST_PREFIX}MPN-NOISY-GAMMA`,
    description:
      'TDK C series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD. Manufacturer part number stated in the attached datasheet only.',
    mpn: null,
    manufacturer: 'TDK',
    category: 'CAP',
    unit: 'pcs',
    attributes: [],
  },
  {
    key: 'C17',
    group: 'C',
    // The recorded MPN contradicts the part number printed in the name: the
    // MPN_CONFLICT rule exists to surface exactly this operator error.
    // The manufacturer name must be present so the extractor strips the
    // `AI-TEST-` marker (leaving a digit-free token) and reaches the real part
    // number that follows it.
    name: `${TEST_PREFIX}YAGEO-MPN-CONFLICT-RC0603FR-0733KL`,
    description:
      'Yageo RC series thick film chip resistor. The part number printed on the component name is RC0603FR-0733KL (33 kOhm), but the recorded manufacturer part number is RC0603FR-0722KL (22 kOhm).',
    mpn: 'RC0603FR-0722KL',
    manufacturer: 'YAGEO',
    category: 'RES',
    unit: 'pcs',
    attributes: [{ code: 'resistance', value: 22000, unit: 'ohm' }],
    // Documents the deliberate divergence so the extraction pre-flight check
    // accepts it instead of treating it as a regression.
    expectedExtractedMpn: 'RC0603FR-0733KL',
  },

  // -- Group D: duplicate / near-duplicate pairs ---------------------------
  // Pair 1 — identical MPN after normalization (separator formatting differs).
  {
    key: 'D18',
    group: 'D1-exact',
    name: `${TEST_PREFIX}DUP-EXACT-YAGEO-33K-A`,
    description:
      'Yageo RC series thick film chip resistor, 33 kOhm, 1%, 1/8 W, 0805 (2012 metric) SMD.',
    mpn: 'RC0805FR-0733KL',
    manufacturer: 'YAGEO',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 33000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'power_rating', value: 0.125, unit: 'W' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'D19',
    group: 'D1-exact',
    name: `${TEST_PREFIX}DUP-EXACT-YAGEO-33K-B`,
    description:
      'Yageo RC series thick film chip resistor, 33 kOhm, 1%, 1/8 W, 0805 (2012 metric) SMD, reel packaging.',
    mpn: 'RC0805FR0733KL',
    manufacturer: 'YAGEO',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 33000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'power_rating', value: 0.125, unit: 'W' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  // Pair 2 — packaging variant (`TR` is in PACKAGING_SUFFIXES).
  {
    key: 'D20',
    group: 'D2-packaging',
    name: `${TEST_PREFIX}DUP-PACKAGING-MURATA-LQH32-A`,
    description:
      'Murata LQH series wire wound power inductor, 1210 (3225 metric) SMD, tape and reel.',
    mpn: 'LQH32CN100K23L',
    manufacturer: 'MURATA',
    category: 'IND',
    unit: 'pcs',
    attributes: [
      { code: 'package', optionCode: '1210' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'D21',
    group: 'D2-packaging',
    name: `${TEST_PREFIX}DUP-PACKAGING-MURATA-LQH32-B`,
    description:
      'Murata LQH series wire wound power inductor, 1210 (3225 metric) SMD, carrier tape.',
    mpn: 'LQH32CN100K23LTR',
    manufacturer: 'MURATA',
    category: 'IND',
    unit: 'pcs',
    attributes: [
      { code: 'package', optionCode: '1210' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  // Pair 3 — semantic name similarity (different tolerance grade MPNs).
  {
    key: 'D22',
    group: 'D3-semantic',
    name: `${TEST_PREFIX}DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-A`,
    description:
      'Murata GRM series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD, +/-5% tolerance grade.',
    mpn: 'GRM188R71H104JA93D',
    manufacturer: 'MURATA',
    category: 'CAP',
    unit: 'pcs',
    attributes: [
      { code: 'capacitance', value: 0.1, unit: 'uF' },
      { code: 'voltage_rating', value: 50, unit: 'V' },
      { code: 'dielectric', optionCode: 'X7R' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'D23',
    group: 'D3-semantic',
    name: `${TEST_PREFIX}DUP-SEMANTIC-MURATA-100NF-50V-X7R-0603-B`,
    description:
      'Murata GRM series multilayer ceramic capacitor, 100 nF, 50 V, X7R, 0603 (1608 metric) SMD, +/-20% tolerance grade.',
    mpn: 'GRM188R71H104MA93D',
    manufacturer: 'MURATA',
    category: 'CAP',
    unit: 'pcs',
    attributes: [
      { code: 'capacitance', value: 0.1, unit: 'uF' },
      { code: 'voltage_rating', value: 50, unit: 'V' },
      { code: 'dielectric', optionCode: 'X7R' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  // Pair 4 — identical MPN under conflicting manufacturers (never EXACT).
  {
    key: 'D24',
    group: 'D4-mfr-conflict',
    name: `${TEST_PREFIX}DUP-MFRCONFLICT-VISHAY-CRCW0603`,
    description:
      'Vishay CRCW series thick film chip resistor, 10 kOhm, 1%, 0603 (1608 metric) SMD.',
    mpn: 'CRCW060310K0FKEA',
    manufacturer: 'VISHAY',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 10000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'D25',
    group: 'D4-mfr-conflict',
    name: `${TEST_PREFIX}DUP-MFRCONFLICT-PANASONIC-CRCW0603`,
    description:
      'Panasonic thick film chip resistor, 10 kOhm, 1%, 0603 (1608 metric) SMD, cross-referenced to the Vishay CRCW0603 series.',
    mpn: 'CRCW060310K0FKEA',
    manufacturer: 'PANASONIC',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 10000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'package', optionCode: '0603' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },

  // -- Group E: interconnect, discretes, modules ---------------------------
  {
    key: 'E26',
    group: 'E',
    // Digit-free after the prefix: any digit-bearing token in the name would be
    // read as a manufacturer part number by the extractor.
    name: `${TEST_PREFIX}JST-XH-SERIES-HEADER`,
    description:
      'JST XH series 4 position 2.50 mm pitch shrouded header, through hole, tin plated contacts.',
    mpn: 'B4B-XH-A',
    manufacturer: null,
    category: 'CONN',
    unit: 'pcs',
    attributes: [
      { code: 'connector_type', optionCode: 'JST-XH' },
      { code: 'pin_count', value: 4 },
      { code: 'pitch', value: 2.5, unit: 'mm' },
      { code: 'mounting_type', optionCode: 'Through Hole' },
    ],
  },
  {
    key: 'E27',
    group: 'E',
    name: `${TEST_PREFIX}NEXPERIA-BSS138`,
    description:
      'Nexperia BSS138 N-channel logic level MOSFET, 50 V, 200 mA, SOT-23, SMD.',
    mpn: 'BSS138',
    manufacturer: 'NEXPERIA',
    category: 'TRAN',
    unit: 'pcs',
    attributes: [
      { code: 'package', optionCode: 'SOT-23' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'E28',
    group: 'E',
    name: `${TEST_PREFIX}ESP32-WROOM-32E`,
    description:
      'Espressif ESP32-WROOM-32E WiFi and Bluetooth module, 4 MB flash, SMD module.',
    mpn: 'ESP32-WROOM-32E',
    manufacturer: null,
    category: 'ICSEM',
    unit: 'pcs',
    attributes: [{ code: 'mounting_type', optionCode: 'SMD' }],
  },
  {
    key: 'E29',
    group: 'E',
    name: `${TEST_PREFIX}RPI-PICO`,
    description:
      'Raspberry Pi Pico microcontroller development board, castellated module.',
    mpn: 'SC0915',
    manufacturer: 'RASPBERRYPI',
    category: 'PROTO',
    unit: 'pcs',
    attributes: [],
  },
  {
    key: 'E30',
    group: 'E',
    name: `${TEST_PREFIX}ADAFRUIT-BME280`,
    description:
      'Adafruit BME280 breakout board, temperature humidity and pressure sensor, I2C and SPI.',
    // The Bosch sensor part number is the identity we key on; "2652" is the
    // vendor catalogue id and would otherwise read as a conflicting part number.
    mpn: 'BME280',
    manufacturer: 'ADAFRUIT',
    category: 'PROTO',
    unit: 'pcs',
    attributes: [],
  },

  // -- Group H: deliberate identity conflicts ---------------------------------
  // The recorded value is wrong; the domain text resolves the correct one, so
  // the existing MANUFACTURER_CONFLICT / CATEGORY_CONFLICT rules have data to
  // fire on. Neither name nor description carries an extractable part-number
  // token, which keeps these findings single-dimension.
  {
    key: 'H31',
    group: 'H-conflict',
    // The description must NOT name the recorded manufacturer: naming both
    // makes the resolver report the manufacturer as ambiguous, which is
    // correct behaviour but produces no finding.
    name: `${TEST_PREFIX}CONFLICT-MFR-IS-YAGEO-RES`,
    description:
      'Yageo RC series thick film chip resistor, 10 kOhm, 1%, 1/4 W, 1206 (3216 metric) SMD. The manufacturer assigned to this record does not match the part number series.',
    mpn: 'RC1206FR-0710KL',
    manufacturer: 'MURATA',
    category: 'RES',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 10000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'power_rating', value: 0.25, unit: 'W' },
      { code: 'package', optionCode: '1206' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
  {
    key: 'H32',
    group: 'H-conflict',
    name: `${TEST_PREFIX}CONFLICT-CAT-MECHANICAL-RES`,
    description:
      'Yageo RC series thick film chip resistor, 10 kOhm, 1%, 1/8 W, 0805 SMD. The recorded category is Mechanical Parts; the part number and description clearly describe an electronic component.',
    mpn: 'RC0805FR-0710KL',
    manufacturer: 'YAGEO',
    category: 'MECH',
    unit: 'pcs',
    attributes: [
      { code: 'resistance', value: 10000, unit: 'ohm' },
      { code: 'tolerance', value: 1, unit: '%' },
      { code: 'package', optionCode: '0805' },
      { code: 'mounting_type', optionCode: 'SMD' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Generated documents
// ---------------------------------------------------------------------------

function page(lines) {
  return lines.join('\n');
}

/**
 * Builds the standard four page test document.
 *
 * Sections use the exact headings the extractor recognises
 * (ELECTRICAL CHARACTERISTICS / MECHANICAL DATA / ORDERING INFORMATION), and
 * page breaks let page-aware evidence be verified. Page 1 carries the identity
 * block because the analysis pipeline only scans the first 2000 characters for
 * a part number.
 */
export function datasheetPages({
  subject,
  manufacturer,
  partNumber,
  ordering = [],
  electrical = [],
  mechanical = [],
  operating = [],
}) {
  return [
    page([
      DOC_MARKER,
      '',
      subject,
      '',
      'ORDERING INFORMATION',
      '',
      `Manufacturer: ${manufacturer}`,
      `Part Number: ${partNumber}`,
      ...ordering,
      '',
      'This document is synthetic test data. It is not a manufacturer publication',
      'and must not be distributed or used as a specification.',
    ]),
    page(['ELECTRICAL CHARACTERISTICS', '', ...electrical]),
    page(['MECHANICAL DATA', '', ...mechanical]),
    page(['OPERATING CONDITIONS', '', ...operating]),
  ];
}

/**
 * `componentKey` links the document to a seeded component. `analyze` marks the
 * documents that are expected to be accepted by
 * `POST /ml/documents/:id/analyze` (analyzable document type + PDF).
 */
export const DOCUMENTS = [
  {
    key: 'doc-a1',
    componentKey: 'A1',
    fileName: 'AI-TEST-DOC-YAGEO-RC0603.pdf',
    title: 'AI TEST DOCUMENT - Yageo RC0603 thick film chip resistor',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'Yageo RC Series Thick Film Chip Resistor - AI TEST DATASHEET',
        manufacturer: 'Yageo',
        partNumber: 'RC0603FR-0710KL',
        electrical: [
          'Resistance: 10 kOhm',
          'Tolerance: 1%',
          'Power Rating: 0.1 W',
          'Temperature Coefficient: 100 ppm/C',
          'Maximum Working Voltage: 50 V',
        ],
        mechanical: [
          'Package: 0603 (1608 Metric)',
          'Mounting Type: SMD',
          'Length: 1.6 mm',
          'Width: 0.8 mm',
          'Height: 0.45 mm',
        ],
        operating: [
          'Operating Temperature: -55 C to +155 C',
          'Storage Temperature: -55 C to +155 C',
          'Rated Ambient Temperature: 70 C',
        ],
      }),
  },
  {
    key: 'doc-a4',
    componentKey: 'A4',
    fileName: 'AI-TEST-DOC-MURATA-GRM188R71H104KA93D.pdf',
    title: 'AI TEST DOCUMENT - Murata GRM188 MLCC',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'Murata GRM Series Multilayer Ceramic Capacitor - AI TEST DATASHEET',
        manufacturer: 'Murata',
        partNumber: 'GRM188R71H104KA93D',
        electrical: [
          'Capacitance: 100 nF',
          'Voltage Rating: 50 V',
          'Tolerance: 10%',
          'Dielectric: X7R',
          'Insulation Resistance: 1000 Mohm',
        ],
        mechanical: [
          'Package: 0603 (1608 Metric)',
          'Mounting Type: SMD',
          'Length: 1.6 mm',
          'Width: 0.8 mm',
          'Termination: Nickel barrier with tin plating',
        ],
        operating: [
          'Operating Temperature: -55 C to +125 C',
          'Rated Voltage Category: 50 V DC',
          'Temperature Characteristic: X7R',
        ],
      }),
  },
  {
    key: 'doc-a6',
    componentKey: 'A6',
    fileName: 'AI-TEST-DOC-TDK-C2012X5R1A106M125AB.pdf',
    title: 'AI TEST DOCUMENT - TDK C2012 multilayer ceramic capacitor',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'TDK C Series Multilayer Ceramic Capacitor - AI TEST DATASHEET',
        manufacturer: 'TDK',
        partNumber: 'C2012X5R1A106M125AB',
        electrical: [
          'Capacitance: 10 uF',
          'Voltage Rating: 10 V',
          'Tolerance: 20%',
          'Dielectric: X5R',
          'Leakage Current: 100 uA',
        ],
        mechanical: [
          'Package: 0805 (2012 Metric)',
          'Mounting Type: SMD',
          'Length: 2.0 mm',
          'Width: 1.25 mm',
        ],
        operating: [
          'Operating Temperature: -55 C to +85 C',
          'Storage Temperature: -55 C to +85 C',
        ],
      }),
  },
  {
    key: 'doc-a7',
    componentKey: 'A7',
    fileName: 'AI-TEST-DOC-TI-LM358DR.pdf',
    title: 'AI TEST DOCUMENT - Texas Instruments LM358 operational amplifier',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        // The subject must carry the FULL orderable part number first: the
        // document identity rule compares normalized part numbers for exact
        // equality, so a shortened family name would read as a conflict.
        subject:
          'LM358DR Dual Operational Amplifier - AI TEST DATASHEET',
        manufacturer: 'Texas Instruments',
        partNumber: 'LM358DR',
        electrical: [
          'Supply Voltage: 32 V',
          'Supply Current: 700 uA',
          'Slew Rate: 1.1 V per microsecond',
          'Input Offset Voltage: 3 mV',
          'Bandwidth: 1.1 MHz',
        ],
        mechanical: [
          'Package: SOIC-8',
          'Mounting Type: SMD',
          'Pin Count: 8',
          'Lead Finish: Nickel palladium gold',
        ],
        operating: [
          'Operating Temperature: -40 C to +85 C',
          'Storage Temperature: -65 C to +150 C',
        ],
      }),
  },
  {
    key: 'doc-a8',
    componentKey: 'A8',
    fileName: 'AI-TEST-DOC-ST-AMS1117-33.pdf',
    title: 'AI TEST DOCUMENT - STMicroelectronics AMS1117 LDO regulator',
    documentType: 'TECHNICAL_MANUAL',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'STMicroelectronics AMS1117-3.3 Low Dropout Regulator - AI TEST TECHNICAL MANUAL',
        manufacturer: 'STMicroelectronics',
        partNumber: 'AMS1117-3.3',
        electrical: [
          'Output Voltage: 3.3 V',
          'Input Voltage Range: 4.75 V to 15 V',
          'Output Current: 1000 mA',
          'Dropout Voltage: 1.3 V',
          'Line Regulation: 0.2%',
        ],
        mechanical: [
          'Package: SOT-223',
          'Mounting Type: SMD',
          'Pin Count: 4',
        ],
        operating: [
          'Operating Temperature: -40 C to +125 C',
          'Junction Temperature Maximum: 125 C',
        ],
      }),
  },
  // Group B component: the component records resistance only, so the datasheet
  // supplies tolerance / package / power as ATTRIBUTE_VALUE_SUGGESTIONs.
  {
    key: 'doc-b10',
    componentKey: 'B10',
    fileName: 'AI-TEST-DOC-VISHAY-CRCW0805220RFKEA.pdf',
    title: 'AI TEST DOCUMENT - Vishay CRCW0805 220R chip resistor',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'Vishay CRCW Series Thick Film Chip Resistor - AI TEST DATASHEET',
        manufacturer: 'Vishay',
        partNumber: 'CRCW0805220RFKEA',
        electrical: [
          'Resistance: 220 Ohm',
          'Tolerance: 1%',
          'Power Rating: 0.125 W',
          'Temperature Coefficient: 100 ppm/C',
        ],
        mechanical: [
          'Package: 0805 (2012 Metric)',
          'Mounting Type: SMD',
          'Length: 2.0 mm',
          'Width: 1.25 mm',
        ],
        operating: [
          'Operating Temperature: -55 C to +155 C',
          'Maximum Overload Voltage: 150 V',
        ],
      }),
  },
  {
    key: 'doc-b11',
    componentKey: 'B11',
    fileName: 'AI-TEST-DOC-NEXPERIA-74HC595PW.pdf',
    title: 'AI TEST DOCUMENT - Nexperia 74HC595 shift register',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: '74HC595PW 8-Bit Shift Register - AI TEST DATASHEET',
        manufacturer: 'Nexperia',
        partNumber: '74HC595PW',
        electrical: [
          'Supply Voltage: 5 V',
          'Supply Current: 80 uA',
          'Output Current: 35 mA',
          'Propagation Delay: 20 ns',
        ],
        mechanical: [
          'Package: TSSOP-16',
          'Mounting Type: SMD',
          'Pin Count: 16',
        ],
        operating: [
          'Operating Temperature: -40 C to +125 C',
          'Storage Temperature: -65 C to +150 C',
        ],
      }),
  },
  {
    key: 'doc-b13',
    componentKey: 'B13',
    fileName: 'AI-TEST-DOC-INFINEON-IRF540NPBF.pdf',
    title: 'AI TEST DOCUMENT - Infineon IRF540N power MOSFET',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'Infineon HEXFET Power MOSFET - AI TEST DATASHEET',
        manufacturer: 'Infineon',
        partNumber: 'IRF540NPBF',
        electrical: [
          'Drain Source Voltage: 100 V',
          'Drain Current: 33 A',
          'Gate Threshold Voltage: 4 V',
          'RDS(on): 0.044 ohm',
        ],
        mechanical: [
          'Package: TO-220',
          'Mounting Type: Through Hole',
          'Pin Count: 3',
        ],
        operating: [
          'Operating Temperature: -55 C to +175 C',
          'Power Dissipation: 130 W',
        ],
      }),
  },
  // Group C: the part number appears ONLY here — the component itself has none.
  {
    key: 'doc-c14',
    componentKey: 'C14',
    fileName: 'AI-TEST-DOC-C14-YAGEO-RC0402.pdf',
    title: 'AI TEST DOCUMENT - Yageo RC0402 chip resistor',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'Yageo RC Series Thick Film Chip Resistor - AI TEST DATASHEET',
        manufacturer: 'Yageo',
        partNumber: 'RC0402FR-0710KL',
        electrical: ['Resistance: 10 kOhm', 'Tolerance: 1%'],
        mechanical: ['Package: 0402 (1005 Metric)', 'Mounting Type: SMD'],
        operating: ['Operating Temperature: -55 C to +155 C'],
      }),
  },
  {
    key: 'doc-c15',
    componentKey: 'C15',
    fileName: 'AI-TEST-DOC-C15-MURATA-GRM155.pdf',
    title: 'AI TEST DOCUMENT - Murata GRM155 MLCC',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'Murata GRM Series Multilayer Ceramic Capacitor - AI TEST DATASHEET',
        manufacturer: 'Murata',
        partNumber: 'GRM155R71C104KA88D',
        electrical: [
          'Capacitance: 100 nF',
          'Voltage Rating: 16 V',
          'Dielectric: X7R',
        ],
        mechanical: ['Package: 0402 (1005 Metric)', 'Mounting Type: SMD'],
        operating: ['Operating Temperature: -55 C to +125 C'],
      }),
  },
  {
    key: 'doc-c16',
    componentKey: 'C16',
    fileName: 'AI-TEST-DOC-C16-TDK-C1608.pdf',
    title: 'AI TEST DOCUMENT - TDK C1608 multilayer ceramic capacitor',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'TDK C Series Multilayer Ceramic Capacitor - AI TEST DATASHEET',
        manufacturer: 'TDK',
        partNumber: 'C1608X7R1H104K080AA',
        electrical: [
          'Capacitance: 100 nF',
          'Voltage Rating: 50 V',
          'Dielectric: X7R',
        ],
        mechanical: ['Package: 0603 (1608 Metric)', 'Mounting Type: SMD'],
        operating: ['Operating Temperature: -55 C to +125 C'],
      }),
  },
  // Group D2 inductor: inductance has NO attribute definition, so this is the
  // Documentation-Intelligence path to CREATE_DEFINITION.
  {
    key: 'doc-d20',
    componentKey: 'D20',
    fileName: 'AI-TEST-DOC-MURATA-LQH32CN100K23L.pdf',
    title: 'AI TEST DOCUMENT - Murata LQH32 power inductor',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'Murata LQH Series Wire Wound Power Inductor - AI TEST DATASHEET',
        manufacturer: 'Murata',
        partNumber: 'LQH32CN100K23L',
        electrical: [
          'Inductance: 10 uH',
          'Current Rating: 450 mA',
          'DC Resistance: 0.4 ohm',
          'Self Resonant Frequency: 30 MHz',
        ],
        mechanical: [
          'Package: 1210 (3225 Metric)',
          'Mounting Type: SMD',
          'Length: 3.2 mm',
          'Width: 2.5 mm',
        ],
        operating: [
          'Operating Temperature: -40 C to +85 C',
          'Storage Temperature: -40 C to +85 C',
        ],
      }),
  },
  // Documentation conflict: identical apart from the voltage rating.
  {
    key: 'doc-conflict-a',
    componentKey: 'B9',
    fileName: 'AI-TEST-DOC-CONFLICT-A-VOLTAGE-25V.pdf',
    title: 'AI TEST DOCUMENT - conflict source A voltage 25 V',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'Ceramic Capacitor Product Specification (conflict source A) - AI TEST DATASHEET',
        manufacturer: 'Murata',
        partNumber: 'GRM31CR61C106KA88L',
        electrical: [
          'Capacitance: 10 uF',
          'Voltage Rating: 25 V',
          'Tolerance: 10%',
          'Dielectric: X5R',
        ],
        mechanical: [
          'Package: 1206 (3216 Metric)',
          'Mounting Type: SMD',
          'Length: 3.2 mm',
          'Width: 1.6 mm',
        ],
        operating: [
          'Operating Temperature: -55 C to +85 C',
          'Storage Temperature: -55 C to +85 C',
        ],
      }),
  },
  {
    key: 'doc-conflict-b',
    componentKey: 'B9',
    fileName: 'AI-TEST-DOC-CONFLICT-B-VOLTAGE-50V.pdf',
    title: 'AI TEST DOCUMENT - conflict source B voltage 50 V',
    documentType: 'DATASHEET',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'Ceramic Capacitor Product Specification (conflict source B) - AI TEST DATASHEET',
        manufacturer: 'Murata',
        partNumber: 'GRM31CR61C106KA88L',
        electrical: [
          'Capacitance: 10 uF',
          'Voltage Rating: 50 V',
          'Tolerance: 10%',
          'Dielectric: X5R',
        ],
        mechanical: [
          'Package: 1206 (3216 Metric)',
          'Mounting Type: SMD',
          'Length: 3.2 mm',
          'Width: 1.6 mm',
        ],
        operating: [
          'Operating Temperature: -55 C to +85 C',
          'Storage Temperature: -55 C to +85 C',
        ],
      }),
  },
  // Remaining document-vocabulary coverage.
  {
    key: 'doc-e27-an',
    componentKey: 'E27',
    fileName: 'AI-TEST-DOC-BSS138-APPLICATION-NOTE.pdf',
    title: 'AI TEST DOCUMENT - BSS138 logic level MOSFET application note',
    documentType: 'APPLICATION_NOTE',
    analyze: true,
    build: () =>
      datasheetPages({
        subject:
          'Logic Level MOSFET Level Shifting Application Note - AI TEST DOCUMENT',
        manufacturer: 'Nexperia',
        partNumber: 'BSS138',
        electrical: [
          'Drain Source Voltage: 50 V',
          'Drain Current: 200 mA',
          'Gate Threshold Voltage: 1.5 V',
        ],
        mechanical: ['Package: SOT-23', 'Mounting Type: SMD', 'Pin Count: 3'],
        operating: ['Operating Temperature: -55 C to +150 C'],
      }),
  },
  {
    key: 'doc-e28-manual',
    componentKey: 'E28',
    fileName: 'AI-TEST-DOC-ESP32-WROOM-32E-MANUAL.pdf',
    title: 'AI TEST DOCUMENT - ESP32-WROOM-32E module technical manual',
    documentType: 'TECHNICAL_MANUAL',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'ESP32-WROOM-32E Module Technical Manual - AI TEST DOCUMENT',
        manufacturer: 'Espressif',
        partNumber: 'ESP32-WROOM-32E',
        electrical: [
          'Supply Voltage: 3.3 V',
          'Supply Current: 500 mA',
          'Transmit Power: 20 dBm',
        ],
        mechanical: [
          'Package: SMD Module',
          'Mounting Type: SMD',
          'Length: 18 mm',
          'Width: 25.5 mm',
        ],
        operating: [
          'Operating Temperature: -40 C to +85 C',
          'Storage Temperature: -40 C to +125 C',
        ],
      }),
  },
  {
    key: 'doc-e29-product',
    componentKey: 'E29',
    fileName: 'AI-TEST-DOC-RPI-PICO-PRODUCT-PAGE.pdf',
    title: 'AI TEST DOCUMENT - Raspberry Pi Pico product page',
    documentType: 'PRODUCT_PAGE',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'Raspberry Pi Pico Product Page - AI TEST DOCUMENT',
        manufacturer: 'Raspberry Pi',
        partNumber: 'SC0915',
        electrical: ['Supply Voltage: 5 V', 'Supply Current: 100 mA'],
        mechanical: [
          'Package: SMD Module',
          'Mounting Type: SMD',
          'Pin Count: 40',
        ],
        operating: ['Operating Temperature: -20 C to +85 C'],
      }),
  },
  {
    key: 'doc-e30-ref',
    componentKey: 'E30',
    fileName: 'AI-TEST-DOC-ADAFRUIT-BME280-REFERENCE-DESIGN.pdf',
    title: 'AI TEST DOCUMENT - Adafruit BME280 reference design',
    documentType: 'REFERENCE_DESIGN',
    analyze: true,
    build: () =>
      datasheetPages({
        subject: 'BME280 Environmental Sensor Breakout Reference Design',
        manufacturer: 'Adafruit Industries',
        partNumber: 'BME280',
        electrical: ['Supply Voltage: 3.3 V', 'Supply Current: 0.7 mA'],
        mechanical: [
          'Mounting Type: SMD',
          'Length: 20 mm',
          'Width: 20 mm',
        ],
        operating: ['Operating Temperature: -40 C to +85 C'],
      }),
  },
  // Non-analyzable coverage (CAD drawing): proves the refusal path.
  {
    key: 'doc-a1-footprint',
    componentKey: 'A1',
    fileName: 'AI-TEST-DOC-RESISTOR-0603-FOOTPRINT.dxf',
    title: 'AI TEST DOCUMENT - 0603 resistor footprint drawing',
    documentType: 'CAD_DRAWING',
    analyze: false,
    build: () => [
      '0',
      'SECTION',
      '2',
      'HEADER',
      '9',
      '$ACADVER',
      '1',
      'AC1015',
      '0',
      'ENDSEC',
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '999',
      DOC_MARKER,
      '999',
      '0603 SMD resistor land pattern - generated test data',
      '0',
      'ENDSEC',
      '0',
      'EOF',
      '',
    ],
    textFile: true,
  },
  {
    key: 'doc-a1-symbol',
    componentKey: 'A1',
    fileName: 'AI-TEST-DOC-RESISTOR-SYMBOL.txt',
    title: 'AI TEST DOCUMENT - resistor schematic symbol',
    documentType: 'SYMBOL',
    analyze: false,
    build: () => [
      DOC_MARKER,
      '',
      'Generic thick film resistor schematic symbol',
      'Pins: 2',
      'Reference designator prefix: R',
      '',
    ],
    textFile: true,
  },
];
