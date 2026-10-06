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
