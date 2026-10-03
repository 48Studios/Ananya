import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateSpatialModelDto } from './create-spatial-model.dto';
import { UpdateSpatialModelDto } from './update-spatial-model.dto';
import { BulkSaveSpatialAnchorsDto } from './bulk-save-spatial-anchors.dto';

describe('SpatialModel DTO Validation', () => {
  describe('CreateSpatialModelDto', () => {
    it('accepts valid https URL with .glb extension', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'CAB-01',
        name: 'Parts Cabinet',
        format: 'GLB',
        assetUri: 'https://cdn.48studios.internal/models/shelf.glb',
        widthMm: 1000,
        heightMm: 2000,
        depthMm: 500,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts valid relative path with .gltf extension, query parameters, and hash fragments', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'CAB-02',
        name: 'Drawer Unit',
        format: 'GLTF',
        assetUri: '/models/cabinets/drawer.gltf?v=2#root-part',
        widthMm: 800,
        heightMm: 1200,
        depthMm: 400,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts procedural model with no assetUri', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'PROC-01',
        name: 'Parametric Rack',
        format: 'PROCEDURAL',
        widthMm: 1500,
        heightMm: 1800,
        depthMm: 600,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects path traversal in assetUri', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-01',
        name: 'Bad Model',
        assetUri: '/models/../../etc/shadow.glb',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });

    it('rejects backslashes in assetUri', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-02',
        name: 'Bad Model',
        assetUri: 'https://cdn.example.com/models\\shelf.glb',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });

    it('rejects protocol-relative URLs', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-03',
        name: 'Bad Model',
        assetUri: '//malicious.example.com/shelf.glb',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });

    it('rejects embedded credentials in assetUri', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-04',
        name: 'Bad Model',
        assetUri: 'https://admin:secret@vault.example.com/shelf.glb',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });

    it('rejects non-glb/gltf extensions', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-05',
        name: 'Bad Model',
        assetUri: '/models/shelf.fbx',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });

    it('rejects unsupported format values', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-06',
        name: 'Bad Model',
        format: 'AUTOCAD_DWG',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const formatErrors = errors.find((e) => e.property === 'format');
      expect(formatErrors).toBeDefined();
    });

    it('rejects assetUri exceeding 512 characters', async () => {
      const dto = plainToInstance(CreateSpatialModelDto, {
        code: 'BAD-07',
        name: 'Bad Model',
        assetUri: 'https://cdn.example.com/' + 'a'.repeat(500) + '.glb',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });
  });

  describe('UpdateSpatialModelDto', () => {
    it('accepts valid partial update with assetUri', async () => {
      const dto = plainToInstance(UpdateSpatialModelDto, {
        assetUri: 'https://cdn.48studios.internal/models/shelf-v2.glb',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid assetUri traversal in update', async () => {
      const dto = plainToInstance(UpdateSpatialModelDto, {
        assetUri: '/models/../../secret.glb',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const assetErrors = errors.find((e) => e.property === 'assetUri');
      expect(assetErrors).toBeDefined();
    });
  });

  describe('BulkSaveSpatialAnchorsDto', () => {
    it('accepts valid bulk save payload', async () => {
      const dto = plainToInstance(BulkSaveSpatialAnchorsDto, {
        expectedModelUpdatedAt: new Date().toISOString(),
        creates: [
          {
            code: 'A01',
            name: 'Slot 1',
            localPositionX: 100,
            localPositionY: 100,
            localPositionZ: 0,
          },
        ],
        updates: [
          {
            id: 'c8b4df56-e970-4f59-994c-cf9e335e2978',
            name: 'Updated Name',
          },
        ],
        deleteIds: ['e61c56ab-cc62-43bb-8a71-6cbf2bca6df9'],
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid UUID in deleteIds', async () => {
      const dto = plainToInstance(BulkSaveSpatialAnchorsDto, {
        deleteIds: ['not-a-valid-uuid'],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.find((e) => e.property === 'deleteIds')).toBeDefined();
    });

    it('rejects invalid nested update items without id', async () => {
      const dto = plainToInstance(BulkSaveSpatialAnchorsDto, {
        updates: [
          {
            name: 'Missing ID',
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.find((e) => e.property === 'updates')).toBeDefined();
    });
  });
});
