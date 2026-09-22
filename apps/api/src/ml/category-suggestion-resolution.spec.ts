import {
  resolveCategorySuggestion,
  type CategoryCandidate,
  type PackCategoryDeclaration,
} from './category-suggestion-resolution';

/**
 * The live taxonomy this bug was reproduced against: an "Electronic Components"
 * root that groups the part families, and a second "Resistors" row at the root
 * with no data behind it.
 */
const ELEC: CategoryCandidate = {
  id: 'cat-elec',
  code: 'ELEC',
  name: 'Electronic Components',
  parentId: null,
  isActive: true,
};
const CAP: CategoryCandidate = {
  id: 'cat-cap',
  code: 'CAP',
  name: 'Capacitors',
  parentId: 'cat-elec',
  isActive: true,
};
const IND: CategoryCandidate = {
  id: 'cat-ind',
  code: 'IND',
  name: 'Inductors',
  parentId: 'cat-elec',
  isActive: true,
};
const RES_CHILD: CategoryCandidate = {
  id: 'cat-res',
  code: 'RES',
  name: 'Resistors',
  parentId: 'cat-elec',
  isActive: true,
};
const RES_ROOT: CategoryCandidate = {
  id: 'cat-res-root',
  code: 'RESISTORS',
  name: 'Resistors',
  parentId: null,
  isActive: true,
};

const CATEGORIES = [ELEC, CAP, IND, RES_CHILD, RES_ROOT];

const PACK: PackCategoryDeclaration[] = [
  { categoryCode: 'CAP', categoryName: 'Capacitors' },
  { categoryCode: 'RES', categoryName: 'Resistors' },
  { categoryCode: 'IND', categoryName: 'Inductors' },
];

describe('resolveCategorySuggestion', () => {
  describe('a prediction that names a family and its group', () => {
    // The exact payload the ML service returns for "100nF 50V X7R Ceramic
    // Capacitor": the group is named in `category`, the family in `subcategory`.
    const capacitor = {
      categoryName: 'Electronic Components',
      subcategoryName: 'Capacitors',
      categoryId: 'cat-cap',
      categoryCode: 'CAP',
      parentCategoryId: 'cat-elec',
    };

    it('resolves to the family, never to the group it belongs to', () => {
      const resolved = resolveCategorySuggestion(capacitor, CATEGORIES, PACK);
      expect(resolved?.category).toEqual(CAP);
      // The group is a GROUP: resolving to it is the bug this prevents.
      expect(resolved?.category.id).not.toBe(ELEC.id);
    });

    it('resolves to the family for every family the pack declares', () => {
      for (const [name, code, id] of [
        ['Inductors', 'IND', IND.id],
        ['Resistors', 'RES', RES_CHILD.id],
      ] as const) {
        const resolved = resolveCategorySuggestion(
          {
            categoryName: 'Electronic Components',
            subcategoryName: name,
            categoryCode: code,
            parentCategoryId: 'cat-elec',
          },
          CATEGORIES,
          PACK,
        );
        expect(resolved?.category.id).toBe(id);
      }
    });

    it('does not let the group name win even when it sorts first', () => {
      const resolved = resolveCategorySuggestion(capacitor, [ELEC, CAP], []);
      expect(resolved?.category).toEqual(CAP);
      expect(resolved?.matchedBy).toBe('ML_CATEGORY_CODE');
    });
  });

  describe('a same-named duplicate', () => {
    // "10k Ohm 0805 SMD Resistor": the ML named "Resistors" and resolved it to
    // the root row, which holds no data, while the pack's family category is the
    // child under Electronic Components.
    const resistor = {
      categoryName: 'Resistors',
      subcategoryName: null,
      categoryId: RES_ROOT.id,
      categoryCode: 'RESISTORS',
      parentCategoryId: null,
    };

    it('prefers the category the installed pack declares', () => {
      const resolved = resolveCategorySuggestion(resistor, CATEGORIES, PACK);
      expect(resolved?.category).toEqual(RES_CHILD);
      expect(resolved?.matchedBy).toBe('PACK_DECLARED');
    });

    it('honours the ML resolution when no pack declaration outranks it', () => {
      const resolved = resolveCategorySuggestion(resistor, CATEGORIES, []);
      // The ML's own row is kept. Its code ('RESISTORS') is also a code match on
      // the family name, which is why this is a code signal, not a name one.
      expect(resolved?.category).toEqual(RES_ROOT);
      expect(resolved?.matchedBy).toBe('ML_CATEGORY_CODE');
    });

    it('breaks a same-name tie by code, never by row order', () => {
      // Two categories share a name that no code spells, so only the name signal
      // can match, and nothing names one of them.
      const first: CategoryCandidate = {
        id: 'cat-ccap-1',
        code: 'CCAP1',
        name: 'Ceramic Capacitors',
        parentId: null,
        isActive: true,
      };
      const second: CategoryCandidate = {
        id: 'cat-ccap-2',
        code: 'CCAP2',
        name: 'Ceramic Capacitors',
        parentId: null,
        isActive: true,
      };
      const input = { categoryName: 'Ceramic Capacitors' };

      const forward = resolveCategorySuggestion(input, [first, second], []);
      const reversed = resolveCategorySuggestion(input, [second, first], []);

      expect(forward?.category).toEqual(first);
      expect(reversed?.category).toEqual(first);
      expect(forward?.matchedBy).toBe('CATEGORY_NAME');
    });

    it('honours the recorded parent when the ML chose no id', () => {
      const child: CategoryCandidate = {
        id: 'cat-ccap-child',
        code: 'CCAPC',
        name: 'Ceramic Capacitors',
        parentId: ELEC.id,
        isActive: true,
      };
      const root: CategoryCandidate = {
        id: 'cat-ccap-root',
        code: 'CCAPR',
        name: 'Ceramic Capacitors',
        parentId: null,
        isActive: true,
      };

      const resolved = resolveCategorySuggestion(
        {
          categoryName: 'Ceramic Capacitors',
          categoryId: null,
          parentCategoryId: ELEC.id,
        },
        [root, child],
        [],
      );

      expect(resolved?.category).toEqual(child);
    });

    it('ignores a pack declaration whose name disagrees with the ML', () => {
      // The pack declares Resistors; the ML said Capacitors. A declaration may
      // only reinforce the family the ML named, never redirect it.
      const resolved = resolveCategorySuggestion(
        { categoryName: 'Capacitors', categoryCode: 'CAP' },
        CATEGORIES,
        [{ categoryCode: 'RES', categoryName: 'Resistors' }],
      );
      expect(resolved?.category).toEqual(CAP);
      expect(resolved?.matchedBy).toBe('ML_CATEGORY_CODE');
    });
  });

  describe('signal priority', () => {
    it('prefers a code match over a name match', () => {
      const alias: CategoryCandidate = {
        id: 'cat-alias',
        code: 'CAP-ALT',
        name: 'Capacitors',
        parentId: null,
        isActive: true,
      };
      const resolved = resolveCategorySuggestion(
        { categoryName: 'Capacitors', categoryCode: 'CAP-ALT' },
        [CAP, alias],
        [],
      );
      expect(resolved?.category).toEqual(alias);
      expect(resolved?.matchedBy).toBe('ML_CATEGORY_CODE');
    });

    it('prefers the specific family name over the group name', () => {
      const resolved = resolveCategorySuggestion(
        {
          categoryName: 'Capacitors',
          subcategoryName: 'Capacitors',
          categoryCode: null,
        },
        [ELEC, CAP],
        [],
      );
      expect(resolved?.category).toEqual(CAP);
    });

    it('falls back to the group name only when nothing else matched', () => {
      const resolved = resolveCategorySuggestion(
        { categoryName: 'Inductors', subcategoryName: 'Nonexistent' },
        [ELEC, IND],
        [],
      );
      expect(resolved?.category).toEqual(IND);
      expect(resolved?.matchedBy).toBe('CATEGORY_NAME');
    });

    it('treats names case- and whitespace-insensitively', () => {
      const resolved = resolveCategorySuggestion(
        { categoryName: '  electronic   components ' },
        [ELEC, CAP],
        [],
      );
      expect(resolved?.category).toEqual(ELEC);
    });
  });

  describe('when nothing matches', () => {
    it('returns null so the caller can offer a new-category candidate', () => {
      expect(
        resolveCategorySuggestion(
          { categoryName: 'Ceramic Capacitors' },
          CATEGORIES,
          PACK,
        ),
      ).toBeNull();
    });

    it('never resolves to an inactive category', () => {
      const inactive: CategoryCandidate = { ...CAP, isActive: false };
      expect(
        resolveCategorySuggestion(
          { categoryName: 'Capacitors' },
          [inactive],
          [],
        ),
      ).toBeNull();
      // Nor does a pack declaration revive one.
      expect(
        resolveCategorySuggestion(
          { categoryName: 'Capacitors' },
          [inactive],
          PACK,
        ),
      ).toBeNull();
    });

    it('skips the pack rule when the declared code is not in the ERP', () => {
      // The pack declares IC, the ERP holds ICSEM: the declaration cannot match,
      // and the ML's own answer must still be used.
      const icsem: CategoryCandidate = {
        id: 'cat-icsem',
        code: 'ICSEM',
        name: 'ICs & Semiconductors',
        parentId: 'cat-elec',
        isActive: true,
      };
      const resolved = resolveCategorySuggestion(
        {
          categoryName: 'Electronic Components',
          subcategoryName: 'ICs & Semiconductors',
          categoryCode: 'ICSEM',
        },
        [ELEC, icsem],
        [{ categoryCode: 'IC', categoryName: 'ICs & Semiconductors' }],
      );
      expect(resolved?.category).toEqual(icsem);
      expect(resolved?.matchedBy).toBe('ML_CATEGORY_CODE');
    });

    it('handles an empty category list', () => {
      expect(
        resolveCategorySuggestion({ categoryName: 'Capacitors' }, [], PACK),
      ).toBeNull();
    });
  });
});
