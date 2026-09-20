import {
  buildFindingFingerprint,
  canDecide,
  decidableStatusesFor,
  mapDecisionToFeedbackAction,
  stableStringify,
} from './component-review-queue.service';
import { COMPONENT_REVIEW_STATUSES } from './component-review-queue.dtos';

describe('ComponentReviewQueueService helpers', () => {
  describe('stableStringify', () => {
    it('serializes objects deterministically regardless of key order', () => {
      expect(stableStringify({ b: 1, a: 2 })).toBe(
        stableStringify({ a: 2, b: 1 }),
      );
    });

    it('normalizes nested arrays, dates, and undefined values', () => {
      const value = {
        nested: { z: [1, undefined, new Date('2026-01-01T00:00:00.000Z')] },
        missing: undefined,
      };
      expect(stableStringify(value)).toBe(
        '{"missing":null,"nested":{"z":[1,null,"2026-01-01T00:00:00.000Z"]}}',
      );
    });
  });

  describe('buildFindingFingerprint', () => {
    const base = {
      componentId: '11111111-1111-4111-8111-111111111111',
      issueType: 'MANUFACTURER_CONFLICT',
      field: 'manufacturer',
      currentValue: { manufacturerName: 'Unknown' },
      suggestedValue: { manufacturerName: 'Yageo' },
      intelligenceVersion: 'test-v1',
    };

    it('produces a stable sha256 hex fingerprint', () => {
      const fingerprint = buildFindingFingerprint(base);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(fingerprint).toBe(buildFindingFingerprint({ ...base }));
    });

    it('is insensitive to snapshot key ordering', () => {
      expect(
        buildFindingFingerprint({
          ...base,
          suggestedValue: { manufacturerName: 'Yageo', code: 'YAGEO' },
        }),
      ).toBe(
        buildFindingFingerprint({
          ...base,
          suggestedValue: { code: 'YAGEO', manufacturerName: 'Yageo' },
        }),
      );
    });

    it('changes when the reviewed component, suggestion, or version changes', () => {
      const fingerprint = buildFindingFingerprint(base);
      expect(
        buildFindingFingerprint({
          ...base,
          componentId: '22222222-2222-4222-8222-222222222222',
        }),
      ).not.toBe(fingerprint);
      expect(
        buildFindingFingerprint({ ...base, issueType: 'CATEGORY_CONFLICT' }),
      ).not.toBe(fingerprint);
      expect(
        buildFindingFingerprint({
          ...base,
          suggestedValue: { manufacturerName: 'Murata' },
        }),
      ).not.toBe(fingerprint);
      expect(
        buildFindingFingerprint({ ...base, intelligenceVersion: 'test-v2' }),
      ).not.toBe(fingerprint);
    });
  });

  describe('decision transitions', () => {
    it('allows every decision from PENDING', () => {
      expect(canDecide('PENDING', 'ACCEPTED')).toBe(true);
      expect(canDecide('PENDING', 'REJECTED')).toBe(true);
      expect(canDecide('PENDING', 'DISMISSED')).toBe(true);
    });

    it('refuses to accept a stale finding while still allowing dismissal', () => {
      expect(canDecide('STALE', 'ACCEPTED')).toBe(false);
      expect(canDecide('STALE', 'REJECTED')).toBe(true);
      expect(canDecide('STALE', 'DISMISSED')).toBe(true);
    });

    it('treats ACCEPTED, REJECTED, and DISMISSED as terminal', () => {
      for (const status of ['ACCEPTED', 'REJECTED', 'DISMISSED'] as const) {
        expect(canDecide(status, 'ACCEPTED')).toBe(false);
        expect(canDecide(status, 'REJECTED')).toBe(false);
        expect(canDecide(status, 'DISMISSED')).toBe(false);
      }
    });

    it('exposes the decidable statuses per decision', () => {
      expect(decidableStatusesFor('ACCEPTED')).toEqual(['PENDING']);
      expect(decidableStatusesFor('DISMISSED')).toEqual(['PENDING', 'STALE']);
    });
  });

  describe('feedback projection', () => {
    it('maps accepted decisions with a reviewer value to EDITED', () => {
      expect(mapDecisionToFeedbackAction('ACCEPTED', false)).toBe('ACCEPTED');
      expect(mapDecisionToFeedbackAction('ACCEPTED', true)).toBe('EDITED');
    });

    it('records rejection and dismissal as REJECTED telemetry', () => {
      expect(mapDecisionToFeedbackAction('REJECTED', false)).toBe('REJECTED');
      expect(mapDecisionToFeedbackAction('DISMISSED', false)).toBe('REJECTED');
      expect(mapDecisionToFeedbackAction('DISMISSED', true)).toBe('REJECTED');
    });
  });

  it('keeps the documented lifecycle statuses stable', () => {
    expect([...COMPONENT_REVIEW_STATUSES]).toEqual([
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'DISMISSED',
      'STALE',
    ]);
  });
});
