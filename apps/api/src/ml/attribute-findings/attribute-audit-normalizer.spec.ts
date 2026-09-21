import type { AttributeAuditIssueDto } from '../dtos';
import {
  buildDefinitionKeyIndex,
  normalizeAttributeAudit,
  resolveExpectedAttribute,
  resolvePersistedIssueType,
  type AttributeAuditSubjectIndex,
} from './attribute-audit-normalizer';
import {
  attributeUsageBand,
  bindingUsageBand,
  buildBindingExpectedState,
  buildExpectedAttributeState,
  buildRelationshipExpectedState,
  buildUnusedAttributeState,
  describeAttributeFindingStaleness,
  normalizeAttributeCode,
  normalizeAttributeKey,
  toAttributeIdentitySnapshot,
  type AttributeFindingLiveState,
} from './attribute-finding-expected-state';
import { ATTRIBUTE_AUDIT_SOURCES } from './attribute-audit.dtos';
import { buildAttributeFindingFingerprint } from './attribute-finding.fingerprint';

/**
 * Normalization of the *existing* Attribute Intelligence audit.
 *
 * The producer's four real issue types are the contract here. Anything else the
 * DTO union declares is not produced, and must not silently become a finding.
 */
describe('Attribute audit normalization', () => {
  const definitionA = toAttributeIdentitySnapshot({
    id: 'attr-aaa',
    code: 'voltage_rating',
    name: 'Voltage Rating',
    dataType: 'QUANTITY',
    unitCategory: 'Voltage',
    defaultUnit: 'V',
    aliases: ['Rated Voltage'],
    groupName: 'Electrical',
    isActive: true,
  });
  const definitionB = toAttributeIdentitySnapshot({
    id: 'attr-bbb',
    code: 'voltage',
    name: 'Voltage',
    dataType: 'QUANTITY',
    unitCategory: 'Voltage',
    defaultUnit: 'V',
    aliases: [],
    groupName: 'Electrical',
    isActive: true,
  });
  const definitionUnused = toAttributeIdentitySnapshot({
    id: 'attr-ccc',
    code: 'obsolete_spec',
    name: 'Obsolete Spec',
    dataType: 'TEXT',
    aliases: [],
    isActive: true,
  });
  const category = {
    id: 'cat-1',
    code: 'CAPACITORS',
    name: 'Capacitors',
    isActive: true,
  };

  const index: AttributeAuditSubjectIndex = {
    definitionsById: new Map([
      [definitionA.id, definitionA],
      [definitionB.id, definitionB],
      [definitionUnused.id, definitionUnused],
    ]),
    definitionsByKey: buildDefinitionKeyIndex([
      definitionA,
      definitionB,
      definitionUnused,
    ]),
    categoriesById: new Map([[category.id, category]]),
    componentValueCounts: new Map([[definitionA.id, 4]]),
    bindingCounts: new Map([[definitionA.id, 2]]),
  };

  const normalize = (issues: AttributeAuditIssueDto[]) =>
    normalizeAttributeAudit({
      issues,
      index,
      source: ATTRIBUTE_AUDIT_SOURCES.DETERMINISTIC,
      intelligenceVersion: 'attribute-audit-v1',
      modelVersion: '1.0.0',
    });

  const issue = (
    overrides: Partial<AttributeAuditIssueDto> & { type: string },
  ): AttributeAuditIssueDto => ({
    id: 'audit-1',
    severity: 'WARNING',
    confidence: 0.9,
    confidenceLevel: 'HIGH',
    reason: 'Producer reason text',
    evidence: [
      {
        type: 'similarity',
        description: 'Producer evidence text',
        weight: 0.9,
        source: 'audit:deduplication',
      },
    ],
    ...overrides,
  });

  describe('issue type mapping', () => {
    it('maps each produced type, renaming the duplicate signal', () => {
      expect(resolvePersistedIssueType('DUPLICATE_ATTRIBUTE')).toBe(
        'POSSIBLE_DUPLICATE',
      );
      expect(resolvePersistedIssueType('SUSPICIOUS_BINDING')).toBe(
        'SUSPICIOUS_BINDING',
      );
      expect(resolvePersistedIssueType('MISSING_EXPECTED_ATTRIBUTE')).toBe(
        'MISSING_EXPECTED_ATTRIBUTE',
      );
      expect(resolvePersistedIssueType('UNUSED_ATTRIBUTE')).toBe(
        'UNUSED_ATTRIBUTE',
      );
    });

    it('does not invent findings for declared-but-unproduced types', () => {
      for (const declared of [
        'SUGGESTED_BINDING',
        'SUGGESTED_ENUM_VALUE',
        'INCONSISTENT_CONFIG',
        'POSSIBLE_DUPLICATE',
      ]) {
        expect(resolvePersistedIssueType(declared)).toBeNull();
      }
    });

    it('warns instead of inventing a finding for an unsupported type', () => {
      const result = normalize([
        issue({ type: 'SUGGESTED_ENUM_VALUE', attributeId: definitionA.id }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe('UNSUPPORTED_PRODUCER_ISSUE_TYPE');
      expect(result.warnings[0]!.producerIssueType).toBe(
        'SUGGESTED_ENUM_VALUE',
      );
    });
  });

  describe('duplicate normalization', () => {
    it('resolves both sides of the pair and snapshots them', () => {
      const result = normalize([
        issue({
          type: 'DUPLICATE_ATTRIBUTE',
          attributeId: definitionA.id,
          attributeCode: definitionA.code,
          attributeName: definitionA.name,
          payload: {
            targetAttributeId: definitionB.id,
            targetAttributeName: definitionB.name,
            similarity: 0.91,
          },
        }),
      ]);

      expect(result.warnings).toHaveLength(0);
      expect(result.findings).toHaveLength(1);
      const finding = result.findings[0]!;

      expect(finding.issueType).toBe('POSSIBLE_DUPLICATE');
      expect(finding.attributeDefinitionId).toBe(definitionA.id);
      expect(finding.relatedAttributeDefinitionId).toBe(definitionB.id);

      const state = finding.currentValue as {
        attributeA: { id: string };
        attributeB: { id: string };
      };
      expect([state.attributeA.id, state.attributeB.id].sort()).toEqual(
        [definitionA.id, definitionB.id].sort(),
      );
      expect(finding.suggestedValue).toMatchObject({
        matchType: 'LEXICAL_SIMILARITY',
      });
      // The score measures the names, so it stays in metadata rather than
      // becoming proposed state the fingerprint depends on.
      expect(
        (finding.metadata?.producerObservations as { similarity: number })
          .similarity,
      ).toBe(0.91);
    });

    it('produces the same fingerprint whichever side the producer lists first', () => {
      const forward = normalize([
        issue({
          type: 'DUPLICATE_ATTRIBUTE',
          attributeId: definitionA.id,
          payload: { targetAttributeId: definitionB.id, similarity: 0.91 },
        }),
      ]).findings[0]!;
      const reversed = normalize([
        issue({
          type: 'DUPLICATE_ATTRIBUTE',
          attributeId: definitionB.id,
          payload: { targetAttributeId: definitionA.id, similarity: 0.88 },
        }),
      ]).findings[0]!;

      expect(fingerprintOf(forward)).toBe(fingerprintOf(reversed));
    });

    it('warns when the producer omits the related attribute', () => {
      const result = normalize([
        issue({ type: 'DUPLICATE_ATTRIBUTE', attributeId: definitionA.id }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings[0]!.code).toBe('MALFORMED_PRODUCER_ISSUE');
      expect(result.warnings[0]!.message).toMatch(/targetAttributeId/);
    });

    it('warns when a side is not in the library', () => {
      const result = normalize([
        issue({
          type: 'DUPLICATE_ATTRIBUTE',
          attributeId: definitionA.id,
          payload: { targetAttributeId: 'attr-missing' },
        }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings[0]!.code).toBe('MISSING_SUBJECT');
    });

    it('reports a pair the producer listed twice instead of persisting two findings', () => {
      const result = normalize([
        issue({
          id: 'audit-1',
          type: 'DUPLICATE_ATTRIBUTE',
          attributeId: definitionA.id,
          payload: { targetAttributeId: definitionB.id },
        }),
        issue({
          id: 'audit-2',
          type: 'DUPLICATE_ATTRIBUTE',
          attributeId: definitionB.id,
          payload: { targetAttributeId: definitionA.id },
        }),
      ]);

      expect(result.findings).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe('DUPLICATE_FINDING_COLLAPSED');
      expect(result.warnings[0]!.producerIssueId).toBe('audit-2');
    });
  });

  describe('suspicious binding normalization', () => {
    it('resolves the binding subject and proposes the queue’s own action', () => {
      const result = normalize([
        issue({
          type: 'SUSPICIOUS_BINDING',
          attributeId: definitionA.id,
          categoryId: category.id,
          payload: { usageCount: 0 },
        }),
      ]);

      const finding = result.findings[0]!;
      expect(finding.issueType).toBe('SUSPICIOUS_BINDING');
      expect(finding.attributeDefinitionId).toBe(definitionA.id);
      expect(finding.categoryId).toBe(category.id);
      expect(finding.suggestedValue).toMatchObject({
        suggestedAction: 'REMOVE_BINDING',
        rule: 'DOMAIN_ANOMALY',
      });
      expect(finding.currentValue).toMatchObject({
        bindingExists: true,
        usageBand: 'ZERO',
      });
    });

    it('warns when the category is missing', () => {
      const result = normalize([
        issue({
          type: 'SUSPICIOUS_BINDING',
          attributeId: definitionA.id,
          categoryId: 'cat-missing',
        }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings[0]!.code).toBe('MISSING_SUBJECT');
    });

    it('warns when the category is absent from the issue', () => {
      const result = normalize([
        issue({ type: 'SUSPICIOUS_BINDING', attributeId: definitionA.id }),
      ]);

      expect(result.warnings[0]!.code).toBe('MALFORMED_PRODUCER_ISSUE');
    });
  });

  describe('missing expected attribute normalization', () => {
    it('keeps the category-first form when no definition exists', () => {
      const result = normalize([
        issue({
          type: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeId: null,
          attributeCode: 'dielectric',
          attributeName: 'Dielectric',
          categoryId: category.id,
          payload: {
            isExisting: false,
            canonicalCode: 'dielectric',
            dataType: 'SELECT',
            group: 'Physical',
          },
        }),
      ]);

      const finding = result.findings[0]!;
      // No definition is invented and no foreign key is faked.
      expect(finding.attributeDefinitionId).toBeNull();
      expect(finding.categoryId).toBe(category.id);
      expect(finding.attributeCode).toBe('dielectric');
      expect(finding.currentValue).toMatchObject({ attributeExists: false });
      expect(finding.suggestedValue).toMatchObject({
        suggestedAction: 'BIND_ATTRIBUTE',
        isExisting: false,
        dataType: 'SELECT',
        groupName: 'Physical',
      });
    });

    it('links an existing definition and resolves it by code when the id is absent', () => {
      const result = normalize([
        issue({
          type: 'MISSING_EXPECTED_ATTRIBUTE',
          attributeId: null,
          attributeCode: 'Rated Voltage',
          categoryId: category.id,
          payload: {
            isExisting: true,
            canonicalCode: 'voltage_rating',
            canonicalName: 'Voltage Rating',
          },
        }),
      ]);

      expect(result.warnings).toHaveLength(0);
      const finding = result.findings[0]!;
      // `Rated Voltage` is one of the definitions' aliases, so the reduced-key
      // lookup resolves it — the same rule the producer matches with.
      expect(finding.attributeDefinitionId).toBe(definitionA.id);
      expect(finding.currentValue).toMatchObject({ attributeExists: true });
      expect(finding.suggestedValue).toMatchObject({ isExisting: true });
    });

    it('reports ambiguity but still persists a reviewable category-first finding', () => {
      const ambiguousIndex: AttributeAuditSubjectIndex = {
        ...index,
        definitionsByKey: new Map([['voltage', null]]),
      };
      const result = normalizeAttributeAudit({
        issues: [
          issue({
            type: 'MISSING_EXPECTED_ATTRIBUTE',
            attributeId: null,
            attributeCode: 'voltage',
            attributeName: 'Voltage',
            categoryId: category.id,
            payload: {
              isExisting: true,
              canonicalCode: 'voltage',
              canonicalName: 'Voltage',
            },
          }),
        ],
        index: ambiguousIndex,
        source: ATTRIBUTE_AUDIT_SOURCES.ML,
        intelligenceVersion: 'attribute-audit-v1',
        modelVersion: '1.0.0',
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.attributeDefinitionId).toBeNull();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe('AMBIGUOUS_SUBJECT');
      expect(result.warnings[0]!.message).toMatch(/matches more than one/);
    });

    it('warns when the category is not in the library', () => {
      const result = normalize([
        issue({
          type: 'MISSING_EXPECTED_ATTRIBUTE',
          categoryId: 'cat-missing',
          payload: { canonicalCode: 'dielectric', canonicalName: 'Dielectric' },
        }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings[0]!.code).toBe('MISSING_SUBJECT');
    });

    it('warns when the canonical identity is missing', () => {
      const result = normalize([
        issue({
          type: 'MISSING_EXPECTED_ATTRIBUTE',
          categoryId: category.id,
          payload: { isExisting: false },
        }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings[0]!.code).toBe('MALFORMED_PRODUCER_ISSUE');
    });
  });

  describe('unused attribute normalization', () => {
    it('snapshots the usage and proposes no action', () => {
      const result = normalize([
        issue({
          type: 'UNUSED_ATTRIBUTE',
          attributeId: definitionUnused.id,
          payload: { usageCount: 0, bindingCount: 0, dataType: 'TEXT' },
        }),
      ]);

      const finding = result.findings[0]!;
      expect(finding.attributeDefinitionId).toBe(definitionUnused.id);
      expect(finding.suggestedValue).toBeNull();
      expect(finding.currentValue).toMatchObject({
        componentValueCount: 0,
        directBindingCount: 0,
        usageBand: 'NO_VALUES_NO_BINDINGS',
      });
    });

    it('warns when the attribute is not in the library', () => {
      const result = normalize([
        issue({ type: 'UNUSED_ATTRIBUTE', attributeId: 'attr-missing' }),
      ]);

      expect(result.findings).toHaveLength(0);
      expect(result.warnings[0]!.code).toBe('MISSING_SUBJECT');
    });
  });

  describe('shared behavior', () => {
    it('preserves producer confidence, severity and evidence unchanged', () => {
      const result = normalize([
        issue({
          type: 'UNUSED_ATTRIBUTE',
          attributeId: definitionUnused.id,
          confidence: 0.75,
          confidenceLevel: 'MEDIUM',
          severity: 'INFO',
        }),
      ]);

      const finding = result.findings[0]!;
      expect(finding.confidence).toBe(0.75);
      expect(finding.confidenceLevel).toBe('MEDIUM');
      expect(finding.metadata?.producerSeverity).toBe('INFO');
      expect(finding.evidence).toEqual([
        {
          type: 'similarity',
          description: 'Producer evidence text',
          weight: 0.9,
          source: 'audit:deduplication',
        },
      ]);
    });

    it('leaves confidence null when the producer supplied none', () => {
      const result = normalize([
        issue({
          type: 'UNUSED_ATTRIBUTE',
          attributeId: definitionUnused.id,
          confidence: undefined,
          confidenceLevel: undefined,
        }),
      ]);

      // No numeric confidence is computed from severity or anything else.
      expect(result.findings[0]!.confidence).toBeNull();
      expect(result.findings[0]!.confidenceLevel).toBeNull();
    });

    it('prefers the producer title and falls back to the queue’s wording', () => {
      const withTitle = normalize([
        issue({
          type: 'UNUSED_ATTRIBUTE',
          attributeId: definitionUnused.id,
          title: 'Producer supplied title',
        }),
      ]);
      expect(withTitle.findings[0]!.title).toBe('Producer supplied title');

      const withoutTitle = normalize([
        issue({ type: 'UNUSED_ATTRIBUTE', attributeId: definitionUnused.id }),
      ]);
      expect(withoutTitle.findings[0]!.title).toBe(
        'Unused Attribute: "Obsolete Spec"',
      );
    });

    it('uses the producer reason as the description, with a safety net', () => {
      const withReason = normalize([
        issue({ type: 'UNUSED_ATTRIBUTE', attributeId: definitionUnused.id }),
      ]);
      expect(withReason.findings[0]!.description).toBe('Producer reason text');

      const withoutReason = normalize([
        issue({
          type: 'UNUSED_ATTRIBUTE',
          attributeId: definitionUnused.id,
          reason: undefined,
          subtitle: undefined,
          title: undefined,
        }),
      ]);
      expect(
        withoutReason.findings[0]!.description.trim().length,
      ).toBeGreaterThan(0);
    });

    it('records the producer identity on every finding', () => {
      const result = normalize([
        issue({ type: 'UNUSED_ATTRIBUTE', attributeId: definitionUnused.id }),
      ]);

      const finding = result.findings[0]!;
      expect(finding.source).toBe(ATTRIBUTE_AUDIT_SOURCES.DETERMINISTIC);
      expect(finding.intelligenceVersion).toBe('attribute-audit-v1');
      expect(finding.metadata?.producerIssueType).toBe('UNUSED_ATTRIBUTE');
      expect(finding.metadata?.producerIssueId).toBe('audit-1');
    });

    it('does not mutate the producer issues it reads', () => {
      const original = issue({
        type: 'DUPLICATE_ATTRIBUTE',
        attributeId: definitionA.id,
        payload: { targetAttributeId: definitionB.id, similarity: 0.9 },
      });
      const snapshot = JSON.stringify(original);

      normalize([original]);

      expect(JSON.stringify(original)).toBe(snapshot);
    });
  });

  describe('definition key index', () => {
    it('resolves by code, name and alias', () => {
      const byKey = buildDefinitionKeyIndex([definitionA]);
      expect(byKey.get('voltagerating')?.id).toBe(definitionA.id);
      expect(byKey.get('ratedvoltage')?.id).toBe(definitionA.id);
    });

    it('marks a key two definitions claim as ambiguous', () => {
      const twin = toAttributeIdentitySnapshot({
        id: 'attr-twin',
        code: 'voltage-rating',
        name: 'Voltage Rating',
        dataType: 'QUANTITY',
        isActive: true,
      });
      const byKey = buildDefinitionKeyIndex([definitionA, twin]);
      expect(byKey.get('voltagerating')).toBeNull();
    });

    it('resolves by declared id before consulting codes', () => {
      const resolution = resolveExpectedAttribute({
        index: {
          definitionsById: index.definitionsById,
          definitionsByKey: index.definitionsByKey,
        },
        declaredAttributeId: definitionB.id,
        declaredAttributeCode: 'voltage_rating',
        canonicalCode: 'voltage_rating',
      });
      expect(resolution.attribute?.id).toBe(definitionB.id);
      expect(resolution.ambiguous).toBe(false);
    });

    it('reports nothing rather than guessing when a code is unknown', () => {
      const resolution = resolveExpectedAttribute({
        index: {
          definitionsById: index.definitionsById,
          definitionsByKey: index.definitionsByKey,
        },
        declaredAttributeId: null,
        declaredAttributeCode: null,
        canonicalCode: 'not_in_library',
      });
      expect(resolution.attribute).toBeNull();
      expect(resolution.ambiguous).toBe(false);
    });
  });

  function fingerprintOf(finding: {
    issueType: string;
    attributeDefinitionId?: string | null;
    relatedAttributeDefinitionId?: string | null;
    categoryId?: string | null;
    currentValue?: Record<string, unknown> | null;
    suggestedValue?: Record<string, unknown> | null;
    attributeCode?: string | null;
    intelligenceVersion?: string | null;
  }): string {
    return buildAttributeFindingFingerprint({
      issueType: finding.issueType,
      subject: {
        attributeDefinitionId: finding.attributeDefinitionId ?? null,
        relatedAttributeDefinitionId:
          finding.relatedAttributeDefinitionId ?? null,
        categoryId: finding.categoryId ?? null,
        attributeCode: finding.attributeCode ?? null,
      },
      currentState: finding.currentValue ?? null,
      suggestedState: finding.suggestedValue ?? null,
      intelligenceVersion: finding.intelligenceVersion ?? null,
    });
  }
});

/**
 * Expected state, usage bands and staleness.
 *
 * These are the rules that decide whether a stored finding is still about the
 * current world, so each one is pinned individually.
 */
describe('Attribute finding expected state and staleness', () => {
  const attribute = toAttributeIdentitySnapshot({
    id: 'attr-1',
    code: 'resistance',
    name: 'Resistance',
    dataType: 'QUANTITY',
    unitCategory: 'Resistance',
    defaultUnit: 'ohm',
    aliases: ['Res', 'RES'],
    isActive: true,
  });
  const category = {
    id: 'cat-1',
    code: 'CAPACITORS',
    name: 'Capacitors',
    isActive: true,
  };

  const live = (
    overrides: Partial<AttributeFindingLiveState> = {},
  ): AttributeFindingLiveState => ({
    attributes: new Map([[attribute.id, attribute]]),
    categories: new Map([[category.id, category]]),
    bindingKeys: new Set([`${category.id}::${attribute.id}`]),
    bindingKeysByAttributeCode: new Set([`${category.id}::resistance`]),
    existingAttributeKeys: new Set(['resistance']),
    componentValueCounts: new Map(),
    bindingCounts: new Map(),
    ...overrides,
  });

  describe('snapshots', () => {
    it('normalizes aliases so their order cannot churn a fingerprint', () => {
      const first = toAttributeIdentitySnapshot({
        id: 'attr-1',
        code: 'resistance',
        name: 'Resistance',
        dataType: 'QUANTITY',
        aliases: ['Res', 'RES'],
        isActive: true,
      });
      const second = toAttributeIdentitySnapshot({
        id: 'attr-1',
        code: 'resistance',
        name: 'Resistance',
        dataType: 'QUANTITY',
        aliases: ['RES', 'Res'],
        isActive: true,
      });

      expect(first.aliases).toEqual(['res', 'res']);
      expect(first).toEqual(second);
    });

    it('handles a non-array aliases column defensively', () => {
      const snapshot = toAttributeIdentitySnapshot({
        id: 'attr-1',
        code: 'x',
        name: 'X',
        dataType: 'TEXT',
        aliases: null,
        isActive: true,
      });
      expect(snapshot.aliases).toEqual([]);
    });

    it('normalizes a canonical code the same way the fingerprint does', () => {
      expect(normalizeAttributeCode('Voltage Rating')).toBe('voltage_rating');
      expect(normalizeAttributeKey('voltage_rating')).toBe('voltagerating');
    });
  });

  describe('usage bands', () => {
    it('bands on the producers’ only threshold, zero', () => {
      expect(
        attributeUsageBand({ componentValueCount: 0, bindingCount: 0 }),
      ).toBe('NO_VALUES_NO_BINDINGS');
      expect(
        attributeUsageBand({ componentValueCount: 0, bindingCount: 3 }),
      ).toBe('NO_VALUES_WITH_BINDINGS');
      expect(
        attributeUsageBand({ componentValueCount: 7, bindingCount: 0 }),
      ).toBe('VALUES_NO_BINDINGS');
      expect(
        attributeUsageBand({ componentValueCount: 1, bindingCount: 1 }),
      ).toBe('VALUES_WITH_BINDINGS');
    });

    it('bands binding usage as zero or non-zero', () => {
      expect(bindingUsageBand(0)).toBe('ZERO');
      expect(bindingUsageBand(1)).toBe('NON_ZERO');
    });

    it('keeps the band stable as exact counters move', () => {
      const low = buildUnusedAttributeState({
        attribute,
        componentValueCount: 0,
        directBindingCount: 0,
      });
      const high = buildUnusedAttributeState({
        attribute,
        componentValueCount: 0,
        directBindingCount: 4,
      });
      expect(low.usageBand).not.toBe(high.usageBand);
      // A change *within* a band is invisible to the fingerprint by design.
      expect(
        attributeUsageBand({ componentValueCount: 0, bindingCount: 4 }),
      ).toBe(attributeUsageBand({ componentValueCount: 0, bindingCount: 9 }));
    });
  });

  describe('relationship staleness', () => {
    const expectedState = buildRelationshipExpectedState({
      first: attribute,
      second: toAttributeIdentitySnapshot({
        id: 'attr-2',
        code: 'res',
        name: 'Res',
        dataType: 'QUANTITY',
        aliases: [],
        isActive: true,
      }),
    }) as unknown as Record<string, unknown>;

    it('is not stale while both sides are unchanged', () => {
      const liveState = live({
        attributes: new Map([
          [attribute.id, attribute],
          [
            'attr-2',
            toAttributeIdentitySnapshot({
              id: 'attr-2',
              code: 'res',
              name: 'Res',
              dataType: 'QUANTITY',
              aliases: [],
              isActive: true,
            }),
          ],
        ]),
      });

      expect(
        describeAttributeFindingStaleness({
          issueType: 'POSSIBLE_DUPLICATE',
          expectedState,
          live: liveState,
        }),
      ).toBeNull();
    });

    it('is stale when a side is deleted', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'POSSIBLE_DUPLICATE',
          expectedState,
          live: live({ attributes: new Map() }),
        }),
      ).toMatch(/no longer exists/);
    });

    it('is stale when either side is edited', () => {
      const renamed = { ...attribute, name: 'Resistance Value' };
      const liveState = live({
        attributes: new Map([
          [attribute.id, renamed],
          [
            'attr-2',
            toAttributeIdentitySnapshot({
              id: 'attr-2',
              code: 'res',
              name: 'Res',
              dataType: 'QUANTITY',
              aliases: [],
              isActive: true,
            }),
          ],
        ]),
      });

      expect(
        describeAttributeFindingStaleness({
          issueType: 'POSSIBLE_DUPLICATE',
          expectedState,
          live: liveState,
        }),
      ).toMatch(/identity or configuration changed/);
    });
  });

  describe('binding staleness', () => {
    const expectedState = buildBindingExpectedState({
      attribute,
      category,
      componentValueCount: 0,
    }) as unknown as Record<string, unknown>;

    it('is not stale while the binding exists', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SUSPICIOUS_BINDING',
          expectedState,
          live: live(),
        }),
      ).toBeNull();
    });

    it('is stale once the binding is removed', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SUSPICIOUS_BINDING',
          expectedState,
          live: live({ bindingKeys: new Set() }),
        }),
      ).toMatch(/binding no longer exists/);
    });

    it('is stale when the category disappears', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SUSPICIOUS_BINDING',
          expectedState,
          live: live({ categories: new Map() }),
        }),
      ).toMatch(/category no longer exists/);
    });

    it('is stale when the bound attribute changed since it was analysed', () => {
      // The finding's evidence is the attribute as analysed, so a deactivation or
      // rename means removing the binding would act on stale ground — the apply path
      // refuses rather than removing a binding it can no longer justify.
      const deactivated = { ...attribute, isActive: false };
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SUSPICIOUS_BINDING',
          expectedState,
          live: live({ attributes: new Map([[attribute.id, deactivated]]) }),
        }),
      ).toMatch(/changed since it was analysed/);

      const renamed = { ...attribute, name: 'Renamed After Analysis' };
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SUSPICIOUS_BINDING',
          expectedState,
          live: live({ attributes: new Map([[attribute.id, renamed]]) }),
        }),
      ).toMatch(/changed since it was analysed/);
    });

    it('is not stale for a binding that was already anomalous when analysed', () => {
      // The detector never analyses inactive attributes into a binding finding, so
      // this guards the other direction: a snapshot that already records the current
      // values must not be reported as drift.
      const sameAttribute = { ...attribute };
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SUSPICIOUS_BINDING',
          expectedState,
          live: live({ attributes: new Map([[attribute.id, sameAttribute]]) }),
        }),
      ).toBeNull();
    });
  });

  describe('expected attribute staleness', () => {
    const expectedState = buildExpectedAttributeState({
      category,
      expectedAttributeCode: 'voltage_rating',
      expectedAttributeName: 'Voltage Rating',
      existingAttribute: null,
    }) as unknown as Record<string, unknown>;

    it('is stale once the expectation is satisfied by a binding', () => {
      const liveState = live({
        bindingKeysByAttributeCode: new Set([`${category.id}::voltagerating`]),
      });

      expect(
        describeAttributeFindingStaleness({
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          expectedState,
          live: liveState,
        }),
      ).toMatch(/now bound to this category/);
    });

    it('is not stale while the gap remains', () => {
      const liveState = live({
        bindingKeysByAttributeCode: new Set([`${category.id}::resistance`]),
      });

      expect(
        describeAttributeFindingStaleness({
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          expectedState,
          live: liveState,
        }),
      ).toBeNull();
    });

    it('is stale when the category disappears', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'MISSING_EXPECTED_ATTRIBUTE',
          expectedState,
          live: live({ categories: new Map() }),
        }),
      ).toMatch(/category no longer exists/);
    });
  });

  describe('unused staleness', () => {
    const expectedState = buildUnusedAttributeState({
      attribute,
      componentValueCount: 0,
      directBindingCount: 0,
    }) as unknown as Record<string, unknown>;

    it('is not stale while nothing references the attribute', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'UNUSED_ATTRIBUTE',
          expectedState,
          live: live(),
        }),
      ).toBeNull();
    });

    it('is stale once the attribute gains a reference', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'UNUSED_ATTRIBUTE',
          expectedState,
          live: live({ bindingCounts: new Map([[attribute.id, 1]]) }),
        }),
      ).toMatch(/now referenced/);
    });

    it('is stale when the attribute disappears', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'UNUSED_ATTRIBUTE',
          expectedState,
          live: live({ attributes: new Map() }),
        }),
      ).toMatch(/no longer exists/);
    });
  });

  describe('contract', () => {
    it('returns null for an unknown finding family rather than a verdict', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'SOMETHING_ELSE',
          expectedState: { anything: true },
          live: live(),
        }),
      ).toBeNull();
    });

    it('returns null for a finding with no expected state', () => {
      expect(
        describeAttributeFindingStaleness({
          issueType: 'UNUSED_ATTRIBUTE',
          expectedState: null,
          live: live({ attributes: new Map() }),
        }),
      ).toBeNull();
    });
  });
});
