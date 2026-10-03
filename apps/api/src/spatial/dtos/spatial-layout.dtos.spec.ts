import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateSpatialLayoutDto,
  UpdateSpatialLayoutDto,
  PublishSpatialLayoutDto,
  ArchiveSpatialLayoutDto,
} from './index';

describe('SpatialLayout DTO Validation', () => {
  describe('CreateSpatialLayoutDto', () => {
    it('accepts valid draft layout payload', async () => {
      const dto = plainToInstance(CreateSpatialLayoutDto, {
        code: 'CAB-01',
        name: 'Main Cabinet Layout',
        parentLocationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        templateType: 'SMD_DRAWER_CABINET',
        config: {
          widthMm: 1000,
          heightMm: 2000,
          depthMm: 500,
          rows: 4,
          columns: 3,
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid parentLocationId UUID', async () => {
      const dto = plainToInstance(CreateSpatialLayoutDto, {
        name: 'Invalid Parent Layout',
        parentLocationId: 'not-a-uuid',
        templateId: 'bin-cabinet',
        config: { widthMm: 1000 },
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'parentLocationId')).toBe(true);
    });

    it('rejects empty name or invalid templateId', async () => {
      const dto = plainToInstance(CreateSpatialLayoutDto, {
        name: '',
        parentLocationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        templateId: 12345 as unknown as string,
        config: {},
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('rejects non-object config', async () => {
      const dto = plainToInstance(CreateSpatialLayoutDto, {
        name: 'Test Layout',
        parentLocationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        templateId: 'bin-cabinet',
        config: 'not-an-object' as unknown as Record<string, unknown>,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'config')).toBe(true);
    });
  });

  describe('UpdateSpatialLayoutDto', () => {
    it('accepts valid update payload with expectedRevision', async () => {
      const dto = plainToInstance(UpdateSpatialLayoutDto, {
        expectedRevision: 1,
        config: {
          widthMm: 1200,
          heightMm: 2000,
          depthMm: 500,
          rows: 4,
          columns: 3,
        },
        mappings: [
          {
            slotId: 'slot-1-1',
            slotCode: 'R1-C1',
            locationId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            isStale: false,
          },
        ],
        changeDescription: 'Expanded cabinet width',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects update without expectedRevision', async () => {
      const dto = plainToInstance(UpdateSpatialLayoutDto, {
        config: { widthMm: 1000 },
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'expectedRevision')).toBe(true);
    });

    it('rejects invalid mapping item in mappings array', async () => {
      const dto = plainToInstance(UpdateSpatialLayoutDto, {
        expectedRevision: 2,
        mappings: [
          {
            slotId: '',
            slotCode: 'R1-C1',
            locationId: 'invalid-uuid',
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'mappings')).toBe(true);
    });
  });

  describe('PublishSpatialLayoutDto', () => {
    it('accepts valid publish payload with expectedRevision and overwriteManualSpatialNodes', async () => {
      const dto = plainToInstance(PublishSpatialLayoutDto, {
        expectedRevision: 3,
        overwriteManualSpatialNodes: true,
        changeDescription: 'Production publishing with CAD overwrite',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects non-integer or missing expectedRevision', async () => {
      const dto = plainToInstance(PublishSpatialLayoutDto, {
        expectedRevision: -1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'expectedRevision')).toBe(true);
    });
  });

  describe('ArchiveSpatialLayoutDto', () => {
    it('accepts valid archive payload with expectedRevision', async () => {
      const dto = plainToInstance(ArchiveSpatialLayoutDto, {
        expectedRevision: 4,
        changeDescription: 'Decommissioned layout',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects missing expectedRevision', async () => {
      const dto = plainToInstance(ArchiveSpatialLayoutDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'expectedRevision')).toBe(true);
    });
  });
});
