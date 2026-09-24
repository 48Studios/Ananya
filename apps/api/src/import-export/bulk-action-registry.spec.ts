import { IMPORT_ENTITY_REGISTRY } from './importer-registry';
import { BulkActionType } from './dtos';
import {
  BULK_ACTION_SUPPORT,
  MAX_BULK_ACTION_IDS,
  isBulkActionSupported,
  supportedBulkActions,
} from './bulk-action-registry';

/**
 * The registry is the contract the review toolbar renders from: an action is
 * offered only because it is listed here, and the service has a matching
 * handler. These tests keep the two halves from drifting apart.
 */
describe('bulk action registry', () => {
  it('only registers entity types the import/export registry knows', () => {
    const known = Object.keys(IMPORT_ENTITY_REGISTRY);

    for (const entityType of Object.keys(BULK_ACTION_SUPPORT)) {
      expect(known).toContain(entityType);
    }
  });

  it('never registers an empty action list', () => {
    for (const actions of Object.values(BULK_ACTION_SUPPORT)) {
      expect(actions.length).toBeGreaterThan(0);
    }
  });

  it('offers delete, archive and activate for the master data that has an isActive flag', () => {
    const masterData = [
      'AttributeDefinition',
      'Category',
      'Component',
      'Manufacturer',
      'Supplier',
      'Location',
      'Unit',
    ];

    for (const entityType of masterData) {
      expect(supportedBulkActions(entityType)).toEqual([
        BulkActionType.DELETE,
        BulkActionType.ARCHIVE,
        BulkActionType.UPDATE_STATUS,
      ]);
    }
  });

  it('offers only delete where no archive/activate capability exists', () => {
    for (const entityType of ['Role', 'BOM', 'WorkOrder', 'PurchaseOrder']) {
      expect(supportedBulkActions(entityType)).toEqual([BulkActionType.DELETE]);
    }
  });

  it('reports no support for entity types with no safe bulk mutation', () => {
    for (const entityType of [
      'Permission',
      'OpeningInventory',
      'ServiceRequest',
      'Asset',
      'Equipment',
      'UnknownEntity',
      '',
    ]) {
      expect(supportedBulkActions(entityType)).toEqual([]);
      expect(isBulkActionSupported(entityType, BulkActionType.DELETE)).toBe(
        false,
      );
    }
  });

  it('answers support per action, not per entity type', () => {
    expect(isBulkActionSupported('Component', BulkActionType.DELETE)).toBe(
      true,
    );
    expect(
      isBulkActionSupported('Component', BulkActionType.ASSIGN_CATEGORY),
    ).toBe(false);
    expect(isBulkActionSupported('Role', BulkActionType.ARCHIVE)).toBe(false);
  });

  it('hands out a copy so a caller cannot edit the registry', () => {
    const actions = supportedBulkActions('Component');
    actions.push(BulkActionType.ASSIGN_LOCATION);

    expect(supportedBulkActions('Component')).toEqual([
      BulkActionType.DELETE,
      BulkActionType.ARCHIVE,
      BulkActionType.UPDATE_STATUS,
    ]);
  });

  it('bounds a single request', () => {
    expect(MAX_BULK_ACTION_IDS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_BULK_ACTION_IDS)).toBe(true);
  });
});
