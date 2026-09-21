import {
  findProposalCollision,
  readAttributeDefinitionProposal,
  validateAttributeDefinitionProposal,
  type AttributeDefinitionProposal,
} from './attribute-definition-proposal';
import type { UnitRef } from '../attribute-value-semantics';

/**
 * Unit tests for the definition-creation proposal (Pass 7).
 *
 * The apply integration suite proves the whole transaction; these prove the rules
 * themselves, including the cases a database fixture cannot easily produce — a
 * proposal whose data type is absent, an undeclared unit, an option list the library
 * cannot store. Every rule here either mirrors a live library configuration or a
 * domain aggregate's own validation, so the expectations are the domain's, not the
 * test's.
 */

/** The dimension catalogue the apply path loads from `units`. */
const UNITS: UnitRef[] = [
  {
    name: 'ohm',
    category: 'Resistance',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 4,
  },
  {
    name: 'kohm',
    category: 'Resistance',
    isBaseUnit: false,
    conversionFactor: 1000,
    precision: 4,
  },
  {
    name: '°C',
    category: 'Temperature',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 2,
  },
  {
    name: '%',
    category: 'Percentage',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 4,
  },
];

function proposal(
  overrides: Partial<AttributeDefinitionProposal> = {},
): AttributeDefinitionProposal {
  return {
    code: 'operating_temperature',
    name: 'Operating Temperature',
    description: null,
    dataType: 'QUANTITY',
    unitCategory: 'Temperature',
    defaultUnit: '°C',
    groupName: 'Environmental',
    aliases: [],
    isRequired: false,
    options: [],
    ...overrides,
  };
}

function validate(
  overrides: Partial<AttributeDefinitionProposal> = {},
  units: UnitRef[] = UNITS,
) {
  return validateAttributeDefinitionProposal({
    proposal: proposal(overrides),
    units,
  });
}

describe('readAttributeDefinitionProposal', () => {
  it('reads the proposal from the persisted suggested state', () => {
    const result = readAttributeDefinitionProposal({
      issueType: 'MISSING_EXPECTED_ATTRIBUTE',
      suggestedValue: {
        canonicalCode: 'Termination-Style',
        canonicalName: 'Termination Style',
        dataType: 'SELECT',
        groupName: 'Physical',
        isRequired: false,
      },
      metadata: {},
    });

    expect('proposal' in result).toBe(true);
    if (!('proposal' in result)) return;
    // The canonical form the domain stores and the fingerprint hashes.
    expect(result.proposal.code).toBe('termination_style');
    expect(result.proposal.name).toBe('Termination Style');
    expect(result.proposal.dataType).toBe('SELECT');
    expect(result.proposal.unitCategory).toBeNull();
    expect(result.proposal.defaultUnit).toBeNull();
    expect(result.proposal.groupName).toBe('Physical');
  });

  it('falls back to the expected-state snapshot for code and name', () => {
    const result = readAttributeDefinitionProposal({
      issueType: 'MISSING_EXPECTED_ATTRIBUTE',
      suggestedValue: { isExisting: false },
      metadata: {
        expectedState: {
          expectedAttributeCode: 'voltage_rating',
          expectedAttributeName: 'Voltage Rating',
        },
      },
    });

    expect('proposal' in result).toBe(true);
    if (!('proposal' in result)) return;
    expect(result.proposal.code).toBe('voltage_rating');
    expect(result.proposal.name).toBe('Voltage Rating');
    // Nothing is defaulted: a missing data type stays missing so validation can
    // refuse it rather than guessing a type.
    expect(result.proposal.dataType).toBeNull();
  });

  it('refuses a finding with no canonical code', () => {
    const result = readAttributeDefinitionProposal({
      issueType: 'MISSING_EXPECTED_ATTRIBUTE',
      suggestedValue: { canonicalName: 'Something' },
      metadata: {},
    });

    expect('refusal' in result).toBe(true);
    if (!('refusal' in result)) return;
    expect(result.refusal.reason).toBe('INVALID_PROPOSAL');
    expect(result.refusal.message).toMatch(/canonical code/i);
  });

  it('refuses a finding with no name', () => {
    const result = readAttributeDefinitionProposal({
      issueType: 'MISSING_EXPECTED_ATTRIBUTE',
      suggestedValue: { canonicalCode: 'resistance' },
      metadata: {},
    });

    expect('refusal' in result).toBe(true);
    if (!('refusal' in result)) return;
    expect(result.refusal.message).toMatch(/does not carry a name/i);
  });

  it('reads bare-string options as code-and-label, and objects with sortOrder', () => {
    const result = readAttributeDefinitionProposal({
      issueType: 'MISSING_EXPECTED_ATTRIBUTE',
      suggestedValue: {
        canonicalCode: 'termination',
        canonicalName: 'Termination Style',
        dataType: 'SELECT',
        options: [
          'SMD / SMT',
          { code: 'TH', label: 'Through Hole', sortOrder: 9 },
        ],
      },
      metadata: {},
    });

    expect('proposal' in result).toBe(true);
    if (!('proposal' in result)) return;
    expect(result.proposal.options).toEqual([
      { code: 'SMD / SMT', label: 'SMD / SMT', sortOrder: 1 },
      { code: 'TH', label: 'Through Hole', sortOrder: 9 },
    ]);
  });

  it('keeps a blank declared label so validation can refuse it', () => {
    const result = readAttributeDefinitionProposal({
      issueType: 'MISSING_EXPECTED_ATTRIBUTE',
      suggestedValue: {
        canonicalCode: 'termination',
        canonicalName: 'Termination Style',
        dataType: 'SELECT',
        options: [{ code: 'SMD', label: '   ' }],
      },
      metadata: {},
    });

    expect('proposal' in result).toBe(true);
    if (!('proposal' in result)) return;
    // Not silently relabelled with its own code: the defect is reported.
    expect(result.proposal.options[0]?.label).toBe('');
    expect(
      validateAttributeDefinitionProposal({
        proposal: result.proposal,
        units: UNITS,
      }),
    ).toMatchObject({
      reason: 'INVALID_PROPOSAL',
    });
  });
});

describe('validateAttributeDefinitionProposal', () => {
  it('accepts a proposal mirroring a live library configuration', () => {
    expect(validate()).toBeNull();
  });

  it('accepts a NUMBER attribute with a unit category, as the library has', () => {
    expect(validate({ dataType: 'NUMBER' })).toBeNull();
  });

  it('accepts an unknown default unit, matching the library’s Length/mm rows', () => {
    // `length` and `pitch` are recorded in `Length` with `mm`, and `mm` is not in
    // the catalogue: refusing it would be stricter than the domain.
    expect(validate({ unitCategory: 'Length', defaultUnit: 'mm' })).toBeNull();
  });

  it('accepts a proposal with no unit at all', () => {
    expect(validate({ unitCategory: null, defaultUnit: null })).toBeNull();
  });

  it('refuses a missing data type', () => {
    expect(validate({ dataType: null })).toMatchObject({
      reason: 'INVALID_PROPOSAL',
    });
    expect(validate({ dataType: null })?.message).toMatch(
      /does not declare its data type/i,
    );
  });

  it('refuses a data type outside the domain vocabulary', () => {
    const refusal = validate({ dataType: 'MAGIC' as never });
    expect(refusal?.reason).toBe('INVALID_PROPOSAL');
    expect(refusal?.message).toMatch(/not one of the library's types/i);
  });

  it('refuses a code that is not a canonical identifier', () => {
    expect(validate({ code: '2n2222' })).toMatchObject({
      reason: 'INVALID_PROPOSAL',
    });
    expect(validate({ code: '2n2222' })?.message).toMatch(
      /not a valid attribute code/i,
    );
    expect(validate({ code: '_leading' })?.reason).toBe('INVALID_PROPOSAL');
  });

  it('refuses an empty name', () => {
    expect(validate({ name: '' })).toMatchObject({
      reason: 'INVALID_PROPOSAL',
    });
  });

  it('refuses a unit category on a data type that cannot carry one', () => {
    for (const dataType of [
      'SELECT',
      'TEXT',
      'BOOLEAN',
      'INTEGER',
      'DATE',
      'MULTI_SELECT',
    ] as const) {
      const refusal = validate({
        dataType,
        unitCategory: 'Resistance',
        defaultUnit: 'ohm',
      });
      expect(refusal?.reason).toBe('INVALID_PROPOSAL');
      expect(refusal?.message).toMatch(/cannot declare a unit category/i);
    }
  });

  it('refuses a default unit without a unit category', () => {
    expect(
      validate({ unitCategory: null, defaultUnit: 'ohm' })?.message,
    ).toMatch(/needs the dimension it belongs to/i);
  });

  it('refuses a default unit from a different dimension', () => {
    const refusal = validate({
      unitCategory: 'Temperature',
      defaultUnit: 'ohm',
    });
    expect(refusal?.reason).toBe('INVALID_PROPOSAL');
    expect(refusal?.message).toMatch(/measures Resistance/i);
  });

  it('folds case when comparing the declared dimension', () => {
    expect(
      validate({ unitCategory: 'resistance', defaultUnit: 'ohm' }),
    ).toBeNull();
  });

  it('refuses options on a data type with no option set', () => {
    expect(
      validate({ options: [{ code: 'A', label: 'A', sortOrder: 1 }] })?.message,
    ).toMatch(/cannot have a closed option set/i);
  });

  it('accepts options on SELECT and MULTI_SELECT', () => {
    const options = [{ code: 'SMD', label: 'SMD / SMT', sortOrder: 1 }];
    expect(
      validate({
        dataType: 'SELECT',
        unitCategory: null,
        defaultUnit: null,
        options,
      }),
    ).toBeNull();
    expect(
      validate({
        dataType: 'MULTI_SELECT',
        unitCategory: null,
        defaultUnit: null,
        options,
      }),
    ).toBeNull();
  });

  it('refuses duplicate option codes, matching the table’s unique index', () => {
    const refusal = validate({
      dataType: 'SELECT',
      unitCategory: null,
      defaultUnit: null,
      options: [
        { code: 'SMD', label: 'A', sortOrder: 1 },
        { code: 'SMD', label: 'B', sortOrder: 2 },
      ],
    });
    expect(refusal?.message).toMatch(/twice/i);
  });

  it('refuses an option with an empty code or label', () => {
    expect(
      validate({
        dataType: 'SELECT',
        unitCategory: null,
        defaultUnit: null,
        options: [{ code: 'SMD', label: '  ', sortOrder: 1 }],
      })?.message,
    ).toMatch(/empty code or label/i);
  });

  it('refuses an option beyond the column limits', () => {
    expect(
      validate({
        dataType: 'SELECT',
        unitCategory: null,
        defaultUnit: null,
        options: [{ code: 'X'.repeat(101), label: 'ok', sortOrder: 1 }],
      })?.message,
    ).toMatch(/exceeds the library's limits/i);
  });
});

describe('findProposalCollision', () => {
  const definitions = [
    {
      id: 'def-1',
      code: 'resistance',
      name: 'Resistance',
      aliases: ['res', 'ohm'],
    },
    {
      id: 'def-2',
      code: 'operating_temp_min',
      name: 'Operating Temperature Minimum',
      aliases: [],
    },
  ];

  it('reports nothing for an unclaimed identity', () => {
    expect(
      findProposalCollision({
        proposal: { code: 'termination', name: 'Termination Style' },
        definitions,
      }),
    ).toBeNull();
  });

  it('detects a code match through the audit’s reduced key', () => {
    const collision = findProposalCollision({
      proposal: { code: 'Resistance', name: 'Something else' },
      definitions,
    });
    expect(collision).toMatchObject({ matchedOn: 'code', ambiguous: false });
    expect(collision?.definition?.id).toBe('def-1');
  });

  it('detects a name match', () => {
    const collision = findProposalCollision({
      proposal: { code: 'something_new', name: 'Resistance' },
      definitions,
    });
    expect(collision).toMatchObject({ matchedOn: 'name' });
  });

  it('detects a match against an existing alias', () => {
    const collision = findProposalCollision({
      proposal: { code: 'ohm', name: 'Ohmage' },
      definitions,
    });
    expect(collision).toMatchObject({ matchedOn: 'code' });
    expect(collision?.definition?.id).toBe('def-1');
  });

  it('treats a key claimed twice as ambiguous, and reports it as existing', () => {
    const collision = findProposalCollision({
      proposal: { code: 'shared_key', name: 'Shared Key' },
      definitions: [
        { id: 'a', code: 'shared_key', name: 'A', aliases: [] },
        { id: 'b', code: 'other', name: 'B', aliases: ['shared_key'] },
      ],
    });
    expect(collision).toMatchObject({ ambiguous: true, definition: null });
  });

  it('does not treat a distinct split identity as a collision', () => {
    // `operating_temperature` is genuinely absent while `operating_temp_min`
    // exists: the reduced keys differ, so creation is allowed and the reviewer's
    // judgement — not the code — decides whether they mean the same thing.
    expect(
      findProposalCollision({
        proposal: {
          code: 'operating_temperature',
          name: 'Operating Temperature',
        },
        definitions,
      }),
    ).toBeNull();
  });
});
