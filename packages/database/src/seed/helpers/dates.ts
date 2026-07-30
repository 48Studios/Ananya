/** Demo timeline anchor: six months of operating history ending on a fixed date. */
export const DEMO_END_DATE = new Date("2026-07-30T12:00:00.000Z");
export const DEMO_START_DATE = new Date("2026-01-30T08:00:00.000Z");
export const DEMO_ORG_CREATED = new Date("2026-01-15T08:00:00.000Z");

const MS_PER_DAY = 86_400_000;

export function daysAgo(days: number, from: Date = DEMO_END_DATE): Date {
  return new Date(from.getTime() - days * MS_PER_DAY);
}

export function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function atDayOffset(
  dayOffset: number,
  hour = 10,
  minute = 0,
): Date {
  const date = addDays(DEMO_START_DATE, dayOffset);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

export function formatPoDate(date: Date): string {
  return date.toISOString();
}
