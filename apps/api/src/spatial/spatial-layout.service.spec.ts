import {
  computeSlotAcknowledgmentSignature,
  INCOMPATIBLE_COMPARTMENT_KINDS,
  SpatialLayoutNotFoundError,
  SpatialLayoutRevisionConflictError,
  SpatialNodeOwnershipConflictError,
  ParentCannotBeSlotError,
  InvalidParametricConfigError,
  ConcurrentHierarchyMutationError,
  InactiveLocationMappingError,
  DuplicateLocationMappingError,
  DuplicateSlotMappingError,
  IncompatibleLocationKindError,
  PublishedLayoutAlreadyExistsError,
  CannotDeleteNonDraftLayoutError,
  CannotModifyArchivedLayoutError,
  MalformedSupersededGeometryError,
} from '@ananya/inventory';
import type { GeneratedCompartment } from '@ananya/inventory';

describe('Spatial Layout Service Unit & Invariant Logic', () => {
  describe('Acknowledgment Signatures & Stale Invariant', () => {
    const baseCompartment: GeneratedCompartment = {
      slotId: 'slot-r0-c0',
      code: 'R0-C0',
      name: 'Bin R0-C0',
      kind: 'bin',
      logicalIndex: { row: 0, col: 0 },
      dimensions: { widthMm: 100, heightMm: 100, depthMm: 200 },
      clearDimensions: { widthMm: 90, heightMm: 90, depthMm: 190 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      metadata: {
        templateType: 'SMD_DRAWER_CABINET',
        origin: 'corner',
        row: 0,
        col: 0,
      },
    };

    it('generates deterministic signature for compartment topology change', () => {
      const sig1 = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Template topology changed',
      );
      const sig2 = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Template topology changed',
      );
      expect(sig1).toBe(sig2);
      expect(sig1).toContain('slot-r0-c0');
      expect(sig1).toContain('R0-C0');
      expect(sig1).toContain('bin');
      expect(sig1).toContain('SMD_DRAWER_CABINET');
    });

    it('produces identical signature when only dimensions vary', () => {
      const resizedCompartment: GeneratedCompartment = {
        ...baseCompartment,
        dimensions: { widthMm: 250, heightMm: 300, depthMm: 500 },
        clearDimensions: { widthMm: 240, heightMm: 290, depthMm: 490 },
      };

      const sigBase = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Dimension resized',
      );
      const sigResized = computeSlotAcknowledgmentSignature(
        resizedCompartment,
        'Dimension resized',
      );

      // Dimension-only changes do NOT alter the slot acknowledgment signature
      expect(sigBase).toBe(sigResized);
    });

    it('produces different signature when compartment kind or template changes', () => {
      const rackCompartment: GeneratedCompartment = {
        ...baseCompartment,
        kind: 'shelf',
        metadata: {
          templateType: 'PALLET_RACK',
          origin: 'corner',
          row: 0,
          col: 0,
        },
      };

      const sigBase = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Reason',
      );
      const sigRack = computeSlotAcknowledgmentSignature(
        rackCompartment,
        'Reason',
      );

      expect(sigBase).not.toBe(sigRack);
    });
  });

  describe('Incompatible Macro Compartment Kinds', () => {
    it('defines warehouse, room, building, facility, zone as incompatible for slots', () => {
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('warehouse');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('room');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('building');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('facility');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('zone');
    });
  });

  describe('Domain Error Contract Adherence', () => {
    it('SpatialLayoutNotFoundError provides correct code and id', () => {
      const err = new SpatialLayoutNotFoundError('layout-xyz');
      expect(err.code).toBe('SPATIAL_LAYOUT_NOT_FOUND');
      expect(err.layoutId).toBe('layout-xyz');
      expect(err.message).toContain('layout-xyz');
    });

    it('SpatialLayoutRevisionConflictError encapsulates current and expected revisions', () => {
      const err = new SpatialLayoutRevisionConflictError(
        5,
        4,
        'user-1',
        new Date('2026-10-01'),
      );
      expect(err.code).toBe('SPATIAL_LAYOUT_REVISION_CONFLICT');
      expect(err.currentRevision).toBe(5);
      expect(err.expectedRevision).toBe(4);
      expect(err.updatedBy).toBe('user-1');
      expect(err.updatedAt).toEqual(new Date('2026-10-01'));
    });

    it('SpatialNodeOwnershipConflictError encapsulates conflicting nodes', () => {
      const conflictingNodes = [
        {
          nodeId: 'node-1',
          locationId: 'loc-1',
          existingSource: 'cad',
          existingOwnerId: 'cad-import-run-1',
        },
      ];
      const err = new SpatialNodeOwnershipConflictError(conflictingNodes);
      expect(err.code).toBe('SPATIAL_NODE_OWNERSHIP_CONFLICT');
      expect(err.conflictingNodes).toEqual(conflictingNodes);
    });

    it('ParentCannotBeSlotError identifies parent location id and slot id', () => {
      const err = new ParentCannotBeSlotError('loc-parent', 'slot-1');
      expect(err.code).toBe('PARENT_CANNOT_BE_SLOT');
      expect(err.parentLocationId).toBe('loc-parent');
      expect(err.slotId).toBe('slot-1');
    });

    it('InvalidParametricConfigError contains validation errors', () => {
      const err = new InvalidParametricConfigError(['rows must be >= 1']);
      expect(err.code).toBe('INVALID_PARAMETRIC_CONFIG');
      expect(err.validationErrors).toEqual(['rows must be >= 1']);
    });

    it('ConcurrentHierarchyMutationError identifies missing location ids', () => {
      const err = new ConcurrentHierarchyMutationError(['loc-orphan']);
      expect(err.code).toBe('CONCURRENT_HIERARCHY_MUTATION');
      expect(err.invalidLocationIds).toEqual(['loc-orphan']);
    });

    it('InactiveLocationMappingError identifies inactive locations', () => {
      const err = new InactiveLocationMappingError(['loc-inactive']);
      expect(err.code).toBe('INACTIVE_LOCATION_MAPPING');
      expect(err.inactiveLocationIds).toEqual(['loc-inactive']);
    });

    it('DuplicateLocationMappingError identifies duplicated location id', () => {
      const err = new DuplicateLocationMappingError('loc-dup');
      expect(err.code).toBe('DUPLICATE_LOCATION_MAPPING');
      expect(err.locationId).toBe('loc-dup');
    });

    it('DuplicateSlotMappingError identifies duplicated slot id', () => {
      const err = new DuplicateSlotMappingError('slot-dup');
      expect(err.code).toBe('DUPLICATE_SLOT_MAPPING');
      expect(err.slotId).toBe('slot-dup');
    });

    it('IncompatibleLocationKindError identifies incompatible location kind', () => {
      const err = new IncompatibleLocationKindError('loc-1', 'warehouse');
      expect(err.code).toBe('INCOMPATIBLE_LOCATION_KIND');
      expect(err.locationId).toBe('loc-1');
      expect(err.kind).toBe('warehouse');
    });

    it('PublishedLayoutAlreadyExistsError identifies parent and conflicting layout', () => {
      const err = new PublishedLayoutAlreadyExistsError(
        'loc-p',
        'layout-1',
        'CAB-01',
      );
      expect(err.code).toBe('PUBLISHED_LAYOUT_ALREADY_EXISTS');
      expect(err.parentLocationId).toBe('loc-p');
      expect(err.existingLayoutId).toBe('layout-1');
      expect(err.existingLayoutCode).toBe('CAB-01');
    });

    it('CannotDeleteNonDraftLayoutError identifies layout id and non-draft status', () => {
      const err = new CannotDeleteNonDraftLayoutError('layout-1', 'PUBLISHED');
      expect(err.code).toBe('CANNOT_DELETE_NON_DRAFT_LAYOUT');
      expect(err.layoutId).toBe('layout-1');
      expect(err.status).toBe('PUBLISHED');
    });

    it('CannotModifyArchivedLayoutError identifies layout id and action', () => {
      const err = new CannotModifyArchivedLayoutError('layout-1', 'publish');
      expect(err.code).toBe('CANNOT_MODIFY_ARCHIVED_LAYOUT');
      expect(err.layoutId).toBe('layout-1');
      expect(err.message).toContain('publish');
    });

    it('MalformedSupersededGeometryError identifies node, location, and reason', () => {
      const err = new MalformedSupersededGeometryError(
        'node-123',
        'loc-456',
        'missing position coordinates',
      );
      expect(err.code).toBe('MALFORMED_SUPERSEDED_GEOMETRY');
      expect(err.nodeId).toBe('node-123');
      expect(err.locationId).toBe('loc-456');
      expect(err.reason).toBe('missing position coordinates');
      expect(err.message).toContain('node-123');
    });
  });
});
