/**
 * Null-safe formatting utilities for Ananya ERP.
 * Guaranteed never to throw TypeError or undefined.toLocaleString crashes.
 */

export function formatNumber(
  val: number | string | null | undefined,
  fallback = "0",
): string {
  if (val == null) return fallback;
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num.toLocaleString();
}

export function formatCurrency(
  val: number | string | null | undefined,
  currency = "INR",
  fallback = "₹0.00",
): string {
  if (val == null) return fallback;
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num) || !isFinite(num)) return fallback;

  const symbol = currency === "INR" ? "₹" : "$";
  return `${symbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercentage(
  val: number | string | null | undefined,
  decimals = 1,
  fallback = "0%",
): string {
  if (val == null) return fallback;
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return `${num.toFixed(decimals)}%`;
}

export function formatQuantity(
  val: number | string | null | undefined,
  uom?: string | null,
  fallback = "0",
): string {
  if (val == null) return fallback;
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num) || !isFinite(num)) return fallback;
  const formatted = num.toLocaleString();
  return uom ? `${formatted} ${uom}` : formatted;
}

export function formatDate(
  val: string | Date | number | null | undefined,
  fallback = "-",
): string {
  if (!val) return fallback;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString();
  } catch {
    return fallback;
  }
}
