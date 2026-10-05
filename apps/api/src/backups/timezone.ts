const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  let value = formatterCache.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timezone, value);
  }
  return value;
}

export function assertTimeZone(timezone: string) {
  try {
    formatter(timezone).format(new Date());
  } catch {
    throw new Error(`Invalid IANA timezone "${timezone}".`);
  }
  return timezone;
}

function parts(date: Date, timezone: string) {
  return Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;
}

export function nextScheduledRun(
  now: Date,
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  timeOfDay: string,
  timezone: string,
) {
  assertTimeZone(timezone);
  const [hour, minute] = timeOfDay.split(':').map(Number);
  const local = parts(now, timezone);
  const year = local.year ?? now.getUTCFullYear();
  const month = local.month ?? now.getUTCMonth() + 1;
  const day = local.day ?? now.getUTCDate();
  const localHour = local.hour ?? hour;
  const localMinute = local.minute ?? minute;
  const localSecond = local.second ?? 0;
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const localProbe = parts(probe, timezone);
  const offset =
    Date.UTC(
      localProbe.year ?? year,
      (localProbe.month ?? month) - 1,
      localProbe.day ?? day,
      localProbe.hour ?? localHour,
      localProbe.minute ?? localMinute,
      localProbe.second ?? localSecond,
    ) - probe.getTime();
  let candidate = new Date(probe.getTime() - offset);
  if (candidate <= now) {
    if (frequency === 'MONTHLY')
      candidate = new Date(Date.UTC(year, month, 1, hour, minute));
    else {
      const days = frequency === 'WEEKLY' ? 7 : 1;
      candidate = new Date(candidate.getTime() + days * 86_400_000);
    }
  }
  return candidate;
}

export function formatInTimeZone(date: Date, timezone: string) {
  assertTimeZone(timezone);
  return formatter(timezone).format(date);
}
