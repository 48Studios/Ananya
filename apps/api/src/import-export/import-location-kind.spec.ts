import { normalizeImportedLocationKind } from './import-export.service';

/**
 * The bulk importer is an external boundary: imported kind spellings must be
 * normalized to a canonical location category before they are persisted, exactly
 * like the HTTP DTO. These tests pin the translation so a second vocabulary
 * (`WAREHOUSE | ZONE | SHELF | BIN`) can never leak into the `locations` table.
 */
describe('import location-kind vocabulary', () => {
  it('normalizes canonical and legacy-alias spellings through the canonical taxonomy', () => {
    // Canonical categories pass through unchanged.
    for (const category of [
      'warehouse',
      'room_area',
      'aisle',
      'rack',
      'shelf',
      'cabinet',
      'dry_cabinet',
      'bin',
      'drawer',
      'compartment',
      'reel_rack',
      'reel_slot',
      'matrix_tray',
      'ic_tube_rail',
    ]) {
      expect(normalizeImportedLocationKind(category)).toBe(category);
    }
    // Legacy aliases resolve through `normalizeLocationCategory`.
    expect(normalizeImportedLocationKind('TRAY')).toBe('matrix_tray');
    expect(normalizeImportedLocationKind('tube')).toBe('ic_tube_rail');
    expect(normalizeImportedLocationKind('ROOM')).toBe('room_area');
  });

  it('translates the legacy uppercase external vocabulary to canonical categories', () => {
    expect(normalizeImportedLocationKind('WAREHOUSE')).toBe('warehouse');
    expect(normalizeImportedLocationKind('SHELF')).toBe('shelf');
    expect(normalizeImportedLocationKind('RACK')).toBe('rack');
    expect(normalizeImportedLocationKind('BIN')).toBe('bin');
    // `ZONE` has no canonical category; it is preserved as an external spelling
    // and mapped to the canonical context category `room_area`.
    expect(normalizeImportedLocationKind('ZONE')).toBe('room_area');
    expect(normalizeImportedLocationKind('zone')).toBe('room_area');
    expect(normalizeImportedLocationKind('BUILDING')).toBe('warehouse');
    expect(normalizeImportedLocationKind('FACILITY')).toBe('warehouse');
  });

  it('never returns a non-canonical token', () => {
    // Every accepted external token resolves to a value that normalizes to itself,
    // i.e. it is a canonical category — never an uppercase or legacy spelling.
    for (const token of [
      'WAREHOUSE',
      'ZONE',
      'SHELF',
      'RACK',
      'BIN',
      'TRAY',
      'TUBE',
      'ROOM',
    ]) {
      const resolved = normalizeImportedLocationKind(token);
      expect(resolved).not.toBeNull();
      expect(resolved).toBe(resolved!.toLowerCase());
      expect(resolved).not.toBe(token);
      // Persisting only canonical values means the idempotent round-trip holds.
      expect(normalizeImportedLocationKind(resolved)).toBe(resolved);
    }
  });

  it('returns null for unknown or empty tokens so the caller can fall back', () => {
    expect(normalizeImportedLocationKind('pallet')).toBeNull();
    expect(normalizeImportedLocationKind('banana')).toBeNull();
    expect(normalizeImportedLocationKind('')).toBeNull();
    expect(normalizeImportedLocationKind('   ')).toBeNull();
    expect(normalizeImportedLocationKind(null)).toBeNull();
    expect(normalizeImportedLocationKind(undefined)).toBeNull();
  });
});
