/**
 * Canonical currency resolution utility for Ananya ERP.
 * Enforces precedence order:
 * 1. Explicit currency supplied by user/import
 * 2. Organization configured base currency
 * 3. Safe system fallback ("INR")
 */
export interface ResolveCurrencyOptions {
  explicitCurrency?: string | null;
  organizationCurrency?: string | null;
  fallbackCurrency?: string;
}

export function resolveCurrency(options: ResolveCurrencyOptions): string {
  if (options.explicitCurrency && options.explicitCurrency.trim() !== '') {
    return options.explicitCurrency.trim().toUpperCase();
  }
  if (
    options.organizationCurrency &&
    options.organizationCurrency.trim() !== ''
  ) {
    return options.organizationCurrency.trim().toUpperCase();
  }
  return (options.fallbackCurrency || 'INR').trim().toUpperCase();
}
