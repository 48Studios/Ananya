export interface ComponentSkuGenerator {
  generate(): Promise<string>;
}

export function normalizeComponentSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export function formatComponentSku(
  sequence: number,
  prefix = "CMP-",
  zeroPadLength = 6,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Component SKU sequence must be a positive integer");
  }

  const normalizedPrefix = prefix.trim().toUpperCase();
  return `${normalizedPrefix}${String(sequence).padStart(zeroPadLength, "0")}`;
}