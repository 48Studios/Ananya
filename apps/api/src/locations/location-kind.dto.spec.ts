import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ACCEPTED_LOCATION_KINDS,
  CreateLocationDto,
} from './create-location.dto';
import { UpdateLocationDto } from './update-location.dto';

/**
 * Request-shape validation for location kinds. The domain aggregate remains
 * authoritative (it canonicalizes aliases and rejects unknown values); these
 * tests cover the DTO-level allow-list only.
 */
describe('Location kind DTO validation', () => {
  const createDto = (kind: string) =>
    plainToInstance(CreateLocationDto, {
      code: 'LOC-01',
      name: 'Location 01',
      kind,
    });

  const kindErrors = async (dto: object): Promise<number> => {
    const errors = await validate(dto);
    return errors.filter((error) => error.property === 'kind').length;
  };

  it('accepts every canonical category', async () => {
    for (const kind of ACCEPTED_LOCATION_KINDS) {
      expect(await kindErrors(createDto(kind))).toBe(0);
    }
  });

  it('accepts the supported legacy aliases', async () => {
    for (const alias of ['room', 'area', 'tray', 'tube', 'rail', 'ic_tube']) {
      expect(await kindErrors(createDto(alias))).toBe(0);
    }
  });

  it('rejects an unknown kind', async () => {
    expect(await kindErrors(createDto('pallet'))).toBe(1);
    expect(await kindErrors(createDto('banana'))).toBe(1);
  });

  it('rejects a non-canonical legacy spelling that is not an accepted alias', async () => {
    // `building`, `facility` and `zone` are read-compatible but are not accepted
    // as new canonical write values.
    for (const legacy of ['building', 'facility', 'zone']) {
      expect(await kindErrors(createDto(legacy))).toBe(1);
    }
  });

  it('applies the same allow-list to updates, and allows the kind to be omitted', async () => {
    const valid = plainToInstance(UpdateLocationDto, { kind: 'matrix_tray' });
    expect(await kindErrors(valid)).toBe(0);

    const alias = plainToInstance(UpdateLocationDto, { kind: 'tray' });
    expect(await kindErrors(alias)).toBe(0);

    const invalid = plainToInstance(UpdateLocationDto, { kind: 'pallet' });
    expect(await kindErrors(invalid)).toBe(1);

    const omitted = plainToInstance(UpdateLocationDto, { name: 'Renamed' });
    expect(await kindErrors(omitted)).toBe(0);
  });
});

/**
 * `parentId` must be validated identically on create and update. The audit found
 * create used `@IsUUID()` while update used `@IsString()`, so a non-UUID parent
 * could reach the domain through the update path but not the create path.
 */
describe('Location parentId DTO validation', () => {
  const parentErrors = async (dto: object): Promise<number> => {
    const errors = await validate(dto);
    return errors.filter((error) => error.property === 'parentId').length;
  };

  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  it('applies the same UUID rule to create and update', async () => {
    const createValid = plainToInstance(CreateLocationDto, {
      code: 'LOC-02',
      name: 'Location 02',
      kind: 'bin',
      parentId: VALID_UUID,
    });
    const updateValid = plainToInstance(UpdateLocationDto, {
      parentId: VALID_UUID,
    });
    expect(await parentErrors(createValid)).toBe(0);
    expect(await parentErrors(updateValid)).toBe(0);

    const createInvalid = plainToInstance(CreateLocationDto, {
      code: 'LOC-03',
      name: 'Location 03',
      kind: 'bin',
      parentId: 'not-a-uuid',
    });
    const updateInvalid = plainToInstance(UpdateLocationDto, {
      parentId: 'not-a-uuid',
    });
    expect(await parentErrors(createInvalid)).toBe(1);
    expect(await parentErrors(updateInvalid)).toBe(1);
  });

  it('still allows parentId to be omitted or explicitly null', async () => {
    expect(
      await parentErrors(
        plainToInstance(UpdateLocationDto, { name: 'No parent change' }),
      ),
    ).toBe(0);
    expect(
      await parentErrors(
        plainToInstance(UpdateLocationDto, { parentId: null }),
      ),
    ).toBe(0);
  });
});

/**
 * `containerId` (RFC-0069 Phase 2) is the physical-containment analogue of
 * `parentId` and shares its request-shape rule: an optional UUID, or null.
 */
describe('Location containerId DTO validation', () => {
  const containerErrors = async (dto: object): Promise<number> => {
    const errors = await validate(dto);
    return errors.filter((error) => error.property === 'containerId').length;
  };

  const VALID_UUID = '22222222-2222-4222-8222-222222222222';

  it('accepts a valid UUID on create and update', async () => {
    const createValid = plainToInstance(CreateLocationDto, {
      code: 'LOC-10',
      name: 'Location 10',
      kind: 'drawer',
      containerId: VALID_UUID,
    });
    const updateValid = plainToInstance(UpdateLocationDto, {
      containerId: VALID_UUID,
    });
    expect(await containerErrors(createValid)).toBe(0);
    expect(await containerErrors(updateValid)).toBe(0);
  });

  it('rejects a non-UUID containerId on create and update', async () => {
    const createInvalid = plainToInstance(CreateLocationDto, {
      code: 'LOC-11',
      name: 'Location 11',
      kind: 'drawer',
      containerId: 'not-a-uuid',
    });
    const updateInvalid = plainToInstance(UpdateLocationDto, {
      containerId: 'not-a-uuid',
    });
    expect(await containerErrors(createInvalid)).toBe(1);
    expect(await containerErrors(updateInvalid)).toBe(1);
  });

  it('allows containerId to be omitted or explicitly null (undefined !== null)', async () => {
    const omitted = plainToInstance(UpdateLocationDto, { name: 'No change' });
    expect(await containerErrors(omitted)).toBe(0);
    // Undefined (omitted) must remain distinguishable from null (clear).
    expect(omitted.containerId).toBeUndefined();

    const cleared = plainToInstance(UpdateLocationDto, { containerId: null });
    expect(await containerErrors(cleared)).toBe(0);
    expect(cleared.containerId).toBeNull();
  });

  it('keeps parentId and containerId independent fields', async () => {
    const dto = plainToInstance(UpdateLocationDto, {
      parentId: VALID_UUID,
      containerId: null,
    });
    expect(await containerErrors(dto)).toBe(0);
    expect(dto.parentId).toBe(VALID_UUID);
    expect(dto.containerId).toBeNull();
  });
});
