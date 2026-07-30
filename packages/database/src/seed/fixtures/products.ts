export type StockProfile =
  | "resistor"
  | "mlcc"
  | "mosfet"
  | "connector"
  | "devboard"
  | "sensor"
  | "tool"
  | "led"
  | "ic"
  | "default";

export interface ProductDefinition {
  key: string;
  sku: string;
  name: string;
  description: string;
  manufacturerCode: string;
  categoryCode: string;
  supplierCode: string;
  unit: string;
  package: string;
  mpn: string;
  vendorPartNumber: string;
  unitCostInr: number;
  stockProfile: StockProfile;
  reorderPoint: number;
  preferredStock: number;
  /** Optional override; when omitted the seed assigns a bin deterministically. */
  locationKey?: string;
  /** Optional stock override for demo scenarios (out of stock, low, overstock). */
  stockOverride?: number;
}

const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82] as const;
const RESISTOR_PACKAGES = ["0402", "0603", "0805"] as const;
const MLCC_PACKAGES = ["0402", "0603", "0805", "1206"] as const;
const MLCC_VALUES = [
  { value: "100nF", code: "104", cost: 0.8 },
  { value: "1uF", code: "105", cost: 1.2 },
  { value: "4.7uF", code: "475", cost: 2.5 },
  { value: "10uF", code: "106", cost: 3.5 },
  { value: "22uF", code: "226", cost: 5.0 },
  { value: "47uF", code: "476", cost: 6.5 },
] as const;

function resistorValueLabel(ohms: number): string {
  if (ohms >= 1_000_000) return `${ohms / 1_000_000}M`;
  if (ohms >= 1_000) return `${ohms / 1_000}k`;
  return `${ohms}`;
}

function buildResistors(): ProductDefinition[] {
  const products: ProductDefinition[] = [];
  const multipliers = [1, 10, 100, 1_000, 10_000, 100_000];

  for (const multiplier of multipliers) {
    for (const base of E12) {
      const ohms = base * multiplier;
      if (ohms > 1_000_000) continue;

      for (const pkg of RESISTOR_PACKAGES) {
        const label = resistorValueLabel(ohms);
        const key = `res-${ohms}ohm-${pkg}`;
        products.push({
          key,
          sku: `res-${label.toLowerCase()}-${pkg}`,
          name: `Yageo RC${pkg} ${label} 1% Resistor`,
          description: `Thick film chip resistor ${label} 1% ${pkg}. MPN: RC${pkg}FR-${label.replace(".", "")}RL. Reorder: 500 | Preferred: 5000`,
          manufacturerCode: "yageo",
          categoryCode: "resistors",
          supplierCode: "lcsc",
          unit: "pcs",
          package: pkg,
          mpn: `RC${pkg}FR-${label.replace(".", "")}RL`,
          vendorPartNumber: `C${100000 + products.length}`,
          unitCostInr: Number((0.2 + (multiplier > 100 ? 0.15 : 0)).toFixed(2)),
          stockProfile: "resistor",
          reorderPoint: 500,
          preferredStock: 5000,
        });
      }
    }
  }

  return products.slice(0, 72);
}

function buildMlccs(): ProductDefinition[] {
  const products: ProductDefinition[] = [];

  for (const cap of MLCC_VALUES) {
    for (const pkg of MLCC_PACKAGES) {
      const key = `mlcc-${cap.code}-${pkg}`;
      products.push({
        key,
        sku: `cap-${cap.code}-${pkg}`,
        name: `Murata GRM${pkg} ${cap.value} X7R MLCC`,
        description: `${cap.value} ±10% X7R MLCC in ${pkg}. MPN: GRM${pkg}${cap.code}KA101. Reorder: 300 | Preferred: 3000`,
        manufacturerCode: "murata",
        categoryCode: "capacitors",
        supplierCode: "lcsc",
        unit: "pcs",
        package: pkg,
        mpn: `GRM${pkg}${cap.code}KA101`,
        vendorPartNumber: `C${200000 + products.length}`,
        unitCostInr: cap.cost,
        stockProfile: "mlcc",
        reorderPoint: 300,
        preferredStock: 3000,
      });
    }
  }

  return products;
}

const CORE_PRODUCTS: ProductDefinition[] = [
  {
    key: "bss138-n",
    sku: "mos-bss138-sot23",
    name: "Slkor BSS138 N-Channel MOSFET",
    description: "30V logic-level N-MOSFET SOT-23. MPN: BSS138. Reorder: 50 | Preferred: 300",
    manufacturerCode: "slkor",
    categoryCode: "mosfets",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "SOT-23",
    mpn: "BSS138",
    vendorPartNumber: "C8545",
    unitCostInr: 3.5,
    stockProfile: "mosfet",
    reorderPoint: 50,
    preferredStock: 300,
  },
  {
    key: "ao3400-n",
    sku: "mos-ao3400-sot23",
    name: "Slkor AO3400 N-Channel MOSFET",
    description: "30V 5.8A N-MOSFET SOT-23. MPN: AO3400A. Reorder: 50 | Preferred: 250",
    manufacturerCode: "slkor",
    categoryCode: "mosfets",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "SOT-23",
    mpn: "AO3400A",
    vendorPartNumber: "C20917",
    unitCostInr: 4.2,
    stockProfile: "mosfet",
    reorderPoint: 50,
    preferredStock: 250,
  },
  {
    key: "si2302-n",
    sku: "mos-si2302-sot23",
    name: "Vishay SI2302 N-Channel MOSFET",
    description: "20V logic-level N-MOSFET. MPN: SI2302CDS-T1-GE3. Reorder: 50 | Preferred: 200",
    manufacturerCode: "vishay",
    categoryCode: "mosfets",
    supplierCode: "digikey",
    unit: "pcs",
    package: "SOT-23",
    mpn: "SI2302CDS-T1-GE3",
    vendorPartNumber: "SI2302CDS-T1-GE3CT-ND",
    unitCostInr: 8.5,
    stockProfile: "mosfet",
    reorderPoint: 50,
    preferredStock: 200,
  },
  {
    key: "1n4148",
    sku: "dio-1n4148-sod123",
    name: "Multicomp 1N4148 Switching Diode",
    description: "75V 150mA switching diode SOD-123. Reorder: 100 | Preferred: 1000",
    manufacturerCode: "multicomp",
    categoryCode: "diodes",
    supplierCode: "mouser",
    unit: "pcs",
    package: "SOD-123",
    mpn: "1N4148WS",
    vendorPartNumber: "771-1N4148WS",
    unitCostInr: 0.6,
    stockProfile: "default",
    reorderPoint: 100,
    preferredStock: 1000,
  },
  {
    key: "ss34",
    sku: "dio-ss34-sma",
    name: "Slkor SS34 Schottky Diode",
    description: "40V 3A Schottky SMA. MPN: SS34. Reorder: 50 | Preferred: 400",
    manufacturerCode: "slkor",
    categoryCode: "diodes",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "SMA",
    mpn: "SS34",
    vendorPartNumber: "C8678",
    unitCostInr: 2.8,
    stockProfile: "default",
    reorderPoint: 50,
    preferredStock: 400,
  },
  {
    key: "ws2812b",
    sku: "led-ws2812b-5050",
    name: "Xinglight WS2812B RGB LED",
    description: "Addressable RGB LED 5050 with integrated controller. Reorder: 50 | Preferred: 500",
    manufacturerCode: "xinglight",
    categoryCode: "leds",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "5050",
    mpn: "WS2812B",
    vendorPartNumber: "C2718488",
    unitCostInr: 6.5,
    stockProfile: "led",
    reorderPoint: 50,
    preferredStock: 500,
  },
  {
    key: "led-0805-red",
    sku: "led-red-0805",
    name: "Xinglight Red LED 0805",
    description: "Red indicator LED 0805 20mA. Reorder: 200 | Preferred: 2000",
    manufacturerCode: "xinglight",
    categoryCode: "leds",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "0805",
    mpn: "XL-1608SURC",
    vendorPartNumber: "C84256",
    unitCostInr: 0.4,
    stockProfile: "led",
    reorderPoint: 200,
    preferredStock: 2000,
  },
  {
    key: "jst-ph-2",
    sku: "con-jst-ph-2p",
    name: "JST PH 2-Pin Header",
    description: "2-position PH series 2.0mm pitch header. MPN: B2B-PH-K-S. Reorder: 20 | Preferred: 150",
    manufacturerCode: "jst",
    categoryCode: "connectors",
    supplierCode: "digikey",
    unit: "pcs",
    package: "TH",
    mpn: "B2B-PH-K-S(LF)(SN)",
    vendorPartNumber: "455-1728-ND",
    unitCostInr: 12.0,
    stockProfile: "connector",
    reorderPoint: 20,
    preferredStock: 150,
  },
  {
    key: "jst-xh-3",
    sku: "con-jst-xh-3p",
    name: "JST XH 3-Pin Connector",
    description: "3-position XH series 2.5mm pitch wafer. MPN: B3B-XH-A. Reorder: 20 | Preferred: 120",
    manufacturerCode: "jst",
    categoryCode: "connectors",
    supplierCode: "mouser",
    unit: "pcs",
    package: "TH",
    mpn: "B3B-XH-A(LF)(SN)",
    vendorPartNumber: "855-R03XH3M",
    unitCostInr: 15.0,
    stockProfile: "connector",
    reorderPoint: 20,
    preferredStock: 120,
  },
  {
    key: "usb-c-16p",
    sku: "con-usbc-16p",
    name: "TE USB-C 16P Receptacle",
    description: "USB Type-C 16-pin mid-mount receptacle. Reorder: 10 | Preferred: 80",
    manufacturerCode: "te",
    categoryCode: "connectors",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "SMD",
    mpn: "USB4110-GF-A",
    vendorPartNumber: "C165948",
    unitCostInr: 28.0,
    stockProfile: "connector",
    reorderPoint: 10,
    preferredStock: 80,
  },
  {
    key: "esp32-wroom",
    sku: "dev-esp32-wroom32e",
    name: "Espressif ESP32-WROOM-32E Module",
    description: "Wi-Fi/BT module 4MB flash. MPN: ESP32-WROOM-32E-N4. Reorder: 5 | Preferred: 30",
    manufacturerCode: "espressif",
    categoryCode: "dev-boards",
    supplierCode: "digikey",
    unit: "pcs",
    package: "Module",
    mpn: "ESP32-WROOM-32E-N4",
    vendorPartNumber: "ESP32-WROOM-32E-N4",
    unitCostInr: 420.0,
    stockProfile: "devboard",
    reorderPoint: 5,
    preferredStock: 30,
  },
  {
    key: "esp32-s3-devkit",
    sku: "dev-esp32-s3-devkitc",
    name: "Espressif ESP32-S3-DevKitC-1",
    description: "ESP32-S3 development board with USB-CDC. Reorder: 3 | Preferred: 15",
    manufacturerCode: "espressif",
    categoryCode: "dev-boards",
    supplierCode: "robu",
    unit: "pcs",
    package: "Board",
    mpn: "ESP32-S3-DevKitC-1-N8",
    vendorPartNumber: "ESP32-S3-DEVKITC-1",
    unitCostInr: 680.0,
    stockProfile: "devboard",
    reorderPoint: 3,
    preferredStock: 15,
  },
  {
    key: "stm32f103c8",
    sku: "dev-stm32f103-bluepill",
    name: "ST STM32F103C8T6 Blue Pill",
    description: "STM32F103 minimum development board. Reorder: 5 | Preferred: 25",
    manufacturerCode: "st",
    categoryCode: "dev-boards",
    supplierCode: "robu",
    unit: "pcs",
    package: "Board",
    mpn: "STM32F103C8T6",
    vendorPartNumber: "STM32-BLUEPILL",
    unitCostInr: 320.0,
    stockProfile: "devboard",
    reorderPoint: 5,
    preferredStock: 25,
  },
  {
    key: "bme280",
    sku: "sns-bme280-module",
    name: "BME280 Temperature/Humidity/Pressure Sensor Module",
    description: "Boson-compatible BME280 breakout I2C/SPI. Reorder: 3 | Preferred: 20",
    manufacturerCode: "multicomp",
    categoryCode: "sensors",
    supplierCode: "robu",
    unit: "pcs",
    package: "Module",
    mpn: "BME280",
    vendorPartNumber: "BME280-MOD",
    unitCostInr: 280.0,
    stockProfile: "sensor",
    reorderPoint: 3,
    preferredStock: 20,
  },
  {
    key: "mpu6050",
    sku: "sns-mpu6050-module",
    name: "MPU6050 IMU Module",
    description: "6-axis accelerometer + gyroscope I2C module. Reorder: 3 | Preferred: 15",
    manufacturerCode: "multicomp",
    categoryCode: "sensors",
    supplierCode: "sunrom",
    unit: "pcs",
    package: "Module",
    mpn: "MPU-6050",
    vendorPartNumber: "MPU6050",
    unitCostInr: 180.0,
    stockProfile: "sensor",
    reorderPoint: 3,
    preferredStock: 15,
  },
  {
    key: "ams1117-3v3",
    sku: "ic-ams1117-3v3-sot223",
    name: "AMS1117-3.3 LDO Regulator",
    description: "1A 3.3V LDO SOT-223. Reorder: 30 | Preferred: 200",
    manufacturerCode: "multicomp",
    categoryCode: "ics",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "SOT-223",
    mpn: "AMS1117-3.3",
    vendorPartNumber: "C6186",
    unitCostInr: 8.0,
    stockProfile: "ic",
    reorderPoint: 30,
    preferredStock: 200,
  },
  {
    key: "lm358",
    sku: "ic-lm358-sop8",
    name: "TI LM358 Dual Op-Amp",
    description: "Dual operational amplifier SOIC-8. Reorder: 20 | Preferred: 150",
    manufacturerCode: "ti",
    categoryCode: "ics",
    supplierCode: "mouser",
    unit: "pcs",
    package: "SOIC-8",
    mpn: "LM358DR",
    vendorPartNumber: "595-LM358DR",
    unitCostInr: 12.0,
    stockProfile: "ic",
    reorderPoint: 20,
    preferredStock: 150,
  },
  {
    key: "ch340g",
    sku: "ic-ch340g-sop16",
    name: "WCH CH340G USB-UART",
    description: "USB to serial converter SOIC-16. Reorder: 15 | Preferred: 100",
    manufacturerCode: "multicomp",
    categoryCode: "ics",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "SOIC-16",
    mpn: "CH340G",
    vendorPartNumber: "C84681",
    unitCostInr: 18.0,
    stockProfile: "ic",
    reorderPoint: 15,
    preferredStock: 100,
  },
  {
    key: "tact-6x6",
    sku: "sw-tact-6x6-5mm",
    name: "Omron Tactile Switch 6x6mm",
    description: "SPST momentary tactile switch 160gf. Reorder: 20 | Preferred: 200",
    manufacturerCode: "omron",
    categoryCode: "switches",
    supplierCode: "digikey",
    unit: "pcs",
    package: "TH",
    mpn: "B3F-1000",
    vendorPartNumber: "SW400-ND",
    unitCostInr: 6.0,
    stockProfile: "default",
    reorderPoint: 20,
    preferredStock: 200,
  },
  {
    key: "ind-10uH-0805",
    sku: "ind-10uh-0805",
    name: "Sunlord 10uH Power Inductor 0805",
    description: "Shielded 10uH inductor for DC-DC. Reorder: 50 | Preferred: 400",
    manufacturerCode: "sunlord",
    categoryCode: "inductors",
    supplierCode: "lcsc",
    unit: "pcs",
    package: "0805",
    mpn: "SWPA8045S100MT",
    vendorPartNumber: "C167441",
    unitCostInr: 4.5,
    stockProfile: "default",
    reorderPoint: 50,
    preferredStock: 400,
  },
  {
    key: "sold-wire-63",
    sku: "con-solder-wire-63-37",
    name: "Multicomp Solder Wire 63/37 0.8mm",
    description: "500g no-clean solder wire spool. Reorder: 1 | Preferred: 4",
    manufacturerCode: "multicomp",
    categoryCode: "consumables",
    supplierCode: "amazon",
    unit: "roll",
    package: "Spool",
    mpn: "SOLDER-063-08",
    vendorPartNumber: "B08SOLDER063",
    unitCostInr: 850.0,
    stockProfile: "tool",
    reorderPoint: 1,
    preferredStock: 4,
  },
  {
    key: "fluke-multimeter",
    sku: "tool-fluke-15b+",
    name: "Fluke 15B+ Digital Multimeter",
    description: "Bench/lab digital multimeter. Reorder: 1 | Preferred: 2",
    manufacturerCode: "multicomp",
    categoryCode: "tools",
    supplierCode: "amazon",
    unit: "pcs",
    package: "Tool",
    mpn: "FLUKE-15B+",
    vendorPartNumber: "FLUKE15BPLUS",
    unitCostInr: 8500.0,
    stockProfile: "tool",
    reorderPoint: 1,
    preferredStock: 2,
  },
  {
    key: "m3-standoff-10",
    sku: "mech-m3-standoff-10mm",
    name: "M3 Brass Standoff 10mm F-F",
    description: "M3×10mm female-female hex standoff. Reorder: 20 | Preferred: 200",
    manufacturerCode: "multicomp",
    categoryCode: "mechanical",
    supplierCode: "local-vendor",
    unit: "pcs",
    package: "Hardware",
    mpn: "M3-FF-10",
    vendorPartNumber: "M3-FF-10-BR",
    unitCostInr: 3.0,
    stockProfile: "default",
    reorderPoint: 20,
    preferredStock: 200,
  },
];

function buildExtendedCatalog(): ProductDefinition[] {
  const extras: ProductDefinition[] = [];
  const nxpParts = [
    { mpn: "PN5321A3HN", name: "PN532 NFC Controller", cost: 320 },
    { mpn: "MPX5700AP", name: "MPX5700 Pressure Sensor", cost: 450 },
  ];
  const tiParts = [
    { mpn: "TPS62130RGTR", name: "TPS62130 Buck Converter", cost: 85 },
    { mpn: "TLV9062IDR", name: "TLV9062 Dual Op-Amp", cost: 35 },
    { mpn: "ADS1115IDGSR", name: "ADS1115 16-bit ADC", cost: 180 },
  ];
  const stParts = [
    { mpn: "STM32G031K8T6", name: "STM32G031K8 MCU", cost: 95 },
    { mpn: "LIS3DHTR", name: "LIS3DH Accelerometer", cost: 120 },
    { mpn: "VL53L0X", name: "VL53L0X ToF Sensor", cost: 250 },
  ];
  const microchipParts = [
    { mpn: "ATMEGA328P-AU", name: "ATmega328P MCU", cost: 180 },
    { mpn: "MCP2515-I/SO", name: "MCP2515 CAN Controller", cost: 95 },
  ];

  let idx = 0;
  for (const part of [...nxpParts, ...tiParts, ...stParts, ...microchipParts]) {
    idx += 1;
    extras.push({
      key: `ic-${part.mpn.toLowerCase()}`,
      sku: `ic-${part.mpn.toLowerCase()}`,
      name: part.name,
      description: `${part.name}. MPN: ${part.mpn}. Reorder: 10 | Preferred: 60`,
      manufacturerCode: part.mpn.startsWith("STM") || part.mpn.startsWith("LIS") || part.mpn.startsWith("VL") ? "st" : part.mpn.startsWith("AT") || part.mpn.startsWith("MCP") ? "microchip" : part.mpn.startsWith("PN") || part.mpn.startsWith("MPX") ? "nxp" : "ti",
      categoryCode: part.name.includes("Sensor") ? "sensors" : "ics",
      supplierCode: idx % 2 === 0 ? "mouser" : "digikey",
      unit: "pcs",
      package: "QFN/SOIC",
      mpn: part.mpn,
      vendorPartNumber: part.mpn,
      unitCostInr: part.cost,
      stockProfile: part.name.includes("Sensor") ? "sensor" : "ic",
      reorderPoint: 10,
      preferredStock: 60,
    });
  }

  const connectorVariants = [
    "GH1.25 2P", "GH1.25 3P", "GH1.25 4P", "JST SM 2P", "Barrel Jack 5.5x2.1",
    "SMA Female Edge", "Pin Header 1x40", "Pin Header 2x20", "FFC 24P 0.5mm",
    "Terminal Block 2P 5.08mm", "Terminal Block 3P 5.08mm", "RJ45 MagJack",
  ];
  connectorVariants.forEach((label, i) => {
    extras.push({
      key: `con-var-${i}`,
      sku: `con-${label.toLowerCase().replace(/\s+/g, "-")}`,
      name: `${label} Connector`,
      description: `${label} connector for harness and PCB assembly. Reorder: 15 | Preferred: 100`,
      manufacturerCode: i % 2 === 0 ? "jst" : "te",
      categoryCode: "connectors",
      supplierCode: i % 3 === 0 ? "lcsc" : "robu",
      unit: "pcs",
      package: "Mixed",
      mpn: `CON-${1000 + i}`,
      vendorPartNumber: `CON${1000 + i}`,
      unitCostInr: 8 + i * 2,
      stockProfile: "connector",
      reorderPoint: 15,
      preferredStock: 100,
    });
  });

  const devBoards = [
    "Raspberry Pi Pico W", "Arduino Nano Every", "nRF52840 DK", "RP2040 Zero",
    "ESP8266-12F Module", "LoRa SX1278 Module", "SIM800L GSM Module",
  ];
  devBoards.forEach((label, i) => {
    extras.push({
      key: `dev-var-${i}`,
      sku: `dev-${label.toLowerCase().replace(/\s+/g, "-")}`,
      name: label,
      description: `${label} for prototyping and firmware development. Reorder: 2 | Preferred: 12`,
      manufacturerCode: label.includes("ESP") ? "espressif" : label.includes("nRF") ? "nxp" : "multicomp",
      categoryCode: "dev-boards",
      supplierCode: i % 2 === 0 ? "robu" : "sunrom",
      unit: "pcs",
      package: "Board",
      mpn: label.replace(/\s+/g, "-").toUpperCase(),
      vendorPartNumber: `DEV${2000 + i}`,
      unitCostInr: 250 + i * 80,
      stockProfile: "devboard",
      reorderPoint: 2,
      preferredStock: 12,
    });
  });

  const tools = [
    "Hakko FX-888D Soldering Station", "Hot Air Rework Station 858D",
    "ESD Mat 60×90cm", "Precision Screwdriver Set", "Helping Hands Stand",
    "Digital Caliper 150mm", "Wire Stripper 20-30 AWG", "Flush Cutters",
  ];
  tools.forEach((label, i) => {
    extras.push({
      key: `tool-var-${i}`,
      sku: `tool-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: label,
      description: `${label} for electronics assembly and rework. Reorder: 1 | Preferred: 3`,
      manufacturerCode: "multicomp",
      categoryCode: "tools",
      supplierCode: i % 2 === 0 ? "amazon" : "local-vendor",
      unit: "pcs",
      package: "Tool",
      mpn: `TOOL-${3000 + i}`,
      vendorPartNumber: `TOOL${3000 + i}`,
      unitCostInr: 350 + i * 450,
      stockProfile: "tool",
      reorderPoint: 1,
      preferredStock: 3,
    });
  });

  const consumables = [
    "Kapton Tape 20mm", "Isopropyl Alcohol 1L", "No-Clean Flux Pen",
    "Desoldering Braid 2.5mm", "ESD Bags 10×15cm", "Label Tape Cartridge",
    "Heat Shrink Kit Assorted", "PCB Cleaning Brush",
  ];
  consumables.forEach((label, i) => {
    extras.push({
      key: `cons-var-${i}`,
      sku: `cons-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: label,
      description: `${label} lab consumable. Reorder: 2 | Preferred: 10`,
      manufacturerCode: "multicomp",
      categoryCode: "consumables",
      supplierCode: i % 2 === 0 ? "amazon" : "electronicscomp",
      unit: i % 3 === 0 ? "roll" : "pcs",
      package: "Consumable",
      mpn: `CONS-${4000 + i}`,
      vendorPartNumber: `CONS${4000 + i}`,
      unitCostInr: 120 + i * 60,
      stockProfile: "tool",
      reorderPoint: 2,
      preferredStock: 10,
    });
  });

  const mechanical = [
    "M2.5 Screw Kit", "M3 Screw Kit", "M3 Nylon Washer", "Rubber Feet 10mm",
    "Aluminum Enclosure 100×60×25", "Polycarbonate Enclosure IP65",
    "PCB Spacer M3 20mm", "Cable Gland PG7", "DIN Rail 35mm 1m",
  ];
  mechanical.forEach((label, i) => {
    extras.push({
      key: `mech-var-${i}`,
      sku: `mech-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: label,
      description: `${label} for product assembly. Reorder: 5 | Preferred: 40`,
      manufacturerCode: "multicomp",
      categoryCode: "mechanical",
      supplierCode: "local-vendor",
      unit: label.includes("Kit") ? "set" : "pcs",
      package: "Hardware",
      mpn: `MECH-${5000 + i}`,
      vendorPartNumber: `MECH${5000 + i}`,
      unitCostInr: 45 + i * 35,
      stockProfile: "default",
      reorderPoint: 5,
      preferredStock: 40,
    });
  });

  const leds = [
    { color: "Green", pkg: "0805" }, { color: "Blue", pkg: "0805" },
    { color: "Warm White", pkg: "3528" }, { color: "Cool White", pkg: "3528" },
    { color: "RGB Common Cathode", pkg: "5mm" }, { color: "IR 940nm", pkg: "5mm" },
  ];
  leds.forEach((led, i) => {
    extras.push({
      key: `led-var-${i}`,
      sku: `led-${led.color.toLowerCase().replace(/\s+/g, "-")}-${led.pkg}`,
      name: `${led.color} LED ${led.pkg}`,
      description: `${led.color} indicator LED ${led.pkg}. Reorder: 100 | Preferred: 800`,
      manufacturerCode: "xinglight",
      categoryCode: "leds",
      supplierCode: "lcsc",
      unit: "pcs",
      package: led.pkg,
      mpn: `LED-${led.color.slice(0, 3).toUpperCase()}-${led.pkg}`,
      vendorPartNumber: `LED${6000 + i}`,
      unitCostInr: 0.35 + i * 0.15,
      stockProfile: "led",
      reorderPoint: 100,
      preferredStock: 800,
    });
  });

  const kemetCaps = [
    { value: "100uF 16V", pkg: "1206" }, { value: "220uF 10V", pkg: "1210" },
    { value: "47uF 25V", pkg: "1206" }, { value: "10uF 50V", pkg: "1210" },
  ];
  kemetCaps.forEach((cap, i) => {
    extras.push({
      key: `kemet-${i}`,
      sku: `cap-kemet-${cap.value.replace(/\s+/g, "-").toLowerCase()}`,
      name: `Kemet Tantalum ${cap.value} ${cap.pkg}`,
      description: `Tantalum capacitor ${cap.value} ${cap.pkg}. Reorder: 20 | Preferred: 120`,
      manufacturerCode: "kemet",
      categoryCode: "capacitors",
      supplierCode: "mouser",
      unit: "pcs",
      package: cap.pkg,
      mpn: `T${490 + i}A${cap.value.split(" ")[0]}M`,
      vendorPartNumber: `KMT${7000 + i}`,
      unitCostInr: 18 + i * 8,
      stockProfile: "mlcc",
      reorderPoint: 20,
      preferredStock: 120,
    });
  });

  const vishayRes = [
    "0.1R 1W 2512", "10R 0.5W 1206", "100R 0.25W 0805",
    "1k 0.125W 0603", "10k 0.125W 0603", "100k 0.125W 0603",
  ];
  vishayRes.forEach((spec, i) => {
    extras.push({
      key: `vishay-res-${i}`,
      sku: `res-vishay-${spec.replace(/\s+/g, "-").toLowerCase()}`,
      name: `Vishay CRCW ${spec}`,
      description: `Precision thick film resistor ${spec}. Reorder: 200 | Preferred: 2000`,
      manufacturerCode: "vishay",
      categoryCode: "resistors",
      supplierCode: "digikey",
      unit: "pcs",
      package: spec.split(" ")[2]!,
      mpn: `CRCW${spec.replace(/\s+/g, "")}`,
      vendorPartNumber: `VSH${8000 + i}`,
      unitCostInr: 0.5 + i * 0.2,
      stockProfile: "resistor",
      reorderPoint: 200,
      preferredStock: 2000,
    });
  });

  const samwhaCaps = [
    "470uF 16V Electrolytic", "1000uF 25V Electrolytic",
    "2200uF 10V Electrolytic", "47uF 50V Electrolytic",
  ];
  samwhaCaps.forEach((spec, i) => {
    extras.push({
      key: `samwha-${i}`,
      sku: `cap-ec-${spec.split(" ")[0]}-${spec.split(" ")[1]}`,
      name: `Samwha ${spec}`,
      description: `Radial electrolytic capacitor ${spec}. Reorder: 10 | Preferred: 80`,
      manufacturerCode: "samwha",
      categoryCode: "capacitors",
      supplierCode: "electronicscomp",
      unit: "pcs",
      package: "Radial",
      mpn: `EC-${spec.replace(/\s+/g, "-")}`,
      vendorPartNumber: `SWH${9000 + i}`,
      unitCostInr: 12 + i * 6,
      stockProfile: "default",
      reorderPoint: 10,
      preferredStock: 80,
    });
  });

  const bournsParts = [
    "10k Trim Pot 3296W", "100R Current Sense 2512", "USB ESD TVS Array",
    "Common Mode Choke 90R", "PTC Resettable Fuse 500mA",
  ];
  bournsParts.forEach((label, i) => {
    extras.push({
      key: `bourns-${i}`,
      sku: `brn-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: `Bourns ${label}`,
      description: `${label}. Reorder: 15 | Preferred: 90`,
      manufacturerCode: "bourns",
      categoryCode: i === 0 ? "switches" : i === 4 ? "consumables" : "inductors",
      supplierCode: "mouser",
      unit: "pcs",
      package: "Mixed",
      mpn: `BRN-${9000 + i}`,
      vendorPartNumber: `BRN${9000 + i}`,
      unitCostInr: 25 + i * 15,
      stockProfile: "default",
      reorderPoint: 15,
      preferredStock: 90,
    });
  });

  return extras;
}

import { INITIAL_PURCHASE_ITEMS } from "./initial-purchase";

export function buildProductCatalog(): ProductDefinition[] {
  const catalog = [
    ...INITIAL_PURCHASE_ITEMS,
    ...buildResistors(),
    ...buildMlccs(),
    ...CORE_PRODUCTS,
    ...buildExtendedCatalog(),
  ];

  const uniqueByKey = new Map<string, ProductDefinition>();
  for (const product of catalog) {
    uniqueByKey.set(product.key, product);
  }

  const products = Array.from(uniqueByKey.values());

  // Demo stock scenarios
  const outOfStockKeys = ["dev-esp32-s3-devkitc", "sns-mpu6050-module", "ic-pn5321a3hn"];
  const lowStockKeys = ["mos-bss138-sot23", "led-ws2812b-5050", "con-usbc-16p"];
  const overstockKeys = ["res-10k-0805", "cap-104-0805", "led-red-0805"];

  for (const product of products) {
    if (outOfStockKeys.includes(product.sku)) {
      product.stockOverride = 0;
    } else if (lowStockKeys.includes(product.sku)) {
      product.stockOverride = Math.max(1, Math.floor(product.reorderPoint * 0.2));
    } else if (overstockKeys.includes(product.sku)) {
      product.stockOverride = product.preferredStock * 2;
    }
  }

  return products.slice(0, 300);
}

export function stockQuantityForProfile(
  profile: StockProfile,
  rngValue: number,
  override?: number,
): number {
  if (override !== undefined) return override;

  switch (profile) {
    case "resistor":
      return 3000 + Math.floor(rngValue * 7000);
    case "mlcc":
      return 1000 + Math.floor(rngValue * 5000);
    case "mosfet":
      return 100 + Math.floor(rngValue * 400);
    case "connector":
      return 20 + Math.floor(rngValue * 280);
    case "devboard":
      return 10 + Math.floor(rngValue * 30);
    case "sensor":
      return 5 + Math.floor(rngValue * 25);
    case "tool":
      return 1 + Math.floor(rngValue * 9);
    case "led":
      return 200 + Math.floor(rngValue * 1800);
    case "ic":
      return 15 + Math.floor(rngValue * 120);
    default:
      return 50 + Math.floor(rngValue * 450);
  }
}
