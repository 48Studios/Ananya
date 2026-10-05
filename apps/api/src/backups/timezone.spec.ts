import { assertTimeZone, nextScheduledRun } from './timezone';

describe('backup timezone scheduling', () => {
  it('calculates a UTC daily run', () => {
    const next = nextScheduledRun(
      new Date('2025-01-01T08:00:00.000Z'),
      'DAILY',
      '10:00',
      'UTC',
    );
    expect(next.toISOString()).toBe('2025-01-01T10:00:00.000Z');
  });

  it('calculates Asia/Kolkata independently of server timezone', () => {
    const next = nextScheduledRun(
      new Date('2025-01-01T00:00:00.000Z'),
      'DAILY',
      '10:00',
      'Asia/Kolkata',
    );
    expect(next.toISOString()).toBe('2025-01-01T04:30:00.000Z');
  });

  it('handles the New York DST spring transition', () => {
    const next = nextScheduledRun(
      new Date('2025-03-09T14:30:00.000Z'),
      'DAILY',
      '10:00',
      'America/New_York',
    );
    expect(next.toISOString()).toBe('2025-03-10T14:00:00.000Z');
  });

  it('rejects invalid timezone identifiers', () => {
    expect(() => assertTimeZone('Not/A_Timezone')).toThrow(
      'Invalid IANA timezone',
    );
  });
});
