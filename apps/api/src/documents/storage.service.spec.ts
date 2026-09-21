import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createStorageProvider,
  defaultUploadDir,
  ensureLocalUploadDir,
  LocalStorageProvider,
  resolveLocalUploadDir,
  resolveStorageDriver,
  StorageObjectNotFoundError,
  StorageService,
  UnsupportedStorageDriverError,
} from './storage.service';

describe('document storage', () => {
  let workDir: string;
  let uploadDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ananya-storage-'));
    uploadDir = path.join(workDir, 'uploads');
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('local provider', () => {
    it('creates the upload directory on construction', () => {
      expect(fs.existsSync(uploadDir)).toBe(false);
      new LocalStorageProvider(uploadDir);
      expect(fs.existsSync(uploadDir)).toBe(true);
    });

    it('stores, reads, reports and deletes a file', async () => {
      const provider = new LocalStorageProvider(uploadDir);
      const content = Buffer.from('resistor datasheet');

      const stored = await provider.storeFile(
        'Component_1_abc_part.txt',
        content,
      );
      expect(stored.storageKey).toBe('Component_1_abc_part.txt');
      expect(stored.sizeBytes).toBe(content.length);
      expect(await provider.exists(stored.storageKey)).toBe(true);

      const read = await provider.readFile(stored.storageKey);
      expect(read.equals(content)).toBe(true);

      await provider.deleteFile(stored.storageKey);
      expect(await provider.exists(stored.storageKey)).toBe(false);
    });

    it('keeps a traversal key inside the upload directory', async () => {
      const provider = new LocalStorageProvider(uploadDir);
      const stored = await provider.storeFile(
        '../../escaped.txt',
        Buffer.from('x'),
      );

      expect(stored.storageKey).toBe('escaped.txt');
      expect(fs.existsSync(path.join(uploadDir, 'escaped.txt'))).toBe(true);
      expect(fs.existsSync(path.join(workDir, 'escaped.txt'))).toBe(false);
    });

    it('refuses a key that cannot name a file', async () => {
      const provider = new LocalStorageProvider(uploadDir);
      await expect(provider.storeFile('..', Buffer.from('x'))).rejects.toThrow(
        /Invalid storage key/,
      );
    });

    it('throws when reading a missing object instead of returning empty data', async () => {
      const provider = new LocalStorageProvider(uploadDir);
      await expect(provider.readFile('nope.pdf')).rejects.toBeInstanceOf(
        StorageObjectNotFoundError,
      );
    });

    it('treats deleting an absent object as a no-op, so retries are safe', async () => {
      const provider = new LocalStorageProvider(uploadDir);
      await expect(provider.deleteFile('nope.pdf')).resolves.toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('honours STORAGE_LOCAL_PATH and defaults to <cwd>/uploads', () => {
      expect(resolveLocalUploadDir({ STORAGE_LOCAL_PATH: '/tmp/custom' })).toBe(
        path.resolve('/tmp/custom'),
      );
      expect(resolveLocalUploadDir({})).toBe(
        path.join(process.cwd(), 'uploads'),
      );
      expect(resolveLocalUploadDir({ STORAGE_LOCAL_PATH: '   ' })).toBe(
        path.join(process.cwd(), 'uploads'),
      );
    });

    it('defaults the driver to local and normalises case', () => {
      expect(resolveStorageDriver({})).toBe('local');
      expect(resolveStorageDriver({ STORAGE_DRIVER: '  LOCAL ' })).toBe(
        'local',
      );
    });

    it('builds a local provider from the environment', () => {
      const provider = createStorageProvider({
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_PATH: uploadDir,
      });
      expect(provider.driver).toBe('local');
      expect(fs.existsSync(uploadDir)).toBe(true);
    });

    it('falls back to the default location when the configured path is unusable', () => {
      // A container path such as /app/uploads does not exist on a host; the
      // provider must not take the whole API down for it.
      const blocker = path.join(workDir, 'not-a-directory');
      fs.writeFileSync(blocker, 'x');
      const fallback = path.join(workDir, 'fallback-uploads');
      const warnings: string[] = [];

      const resolved = ensureLocalUploadDir(
        path.join(blocker, 'nested'),
        fallback,
        { warn: (message) => warnings.push(message) },
      );

      expect(resolved).toBe(path.resolve(fallback));
      expect(fs.existsSync(fallback)).toBe(true);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('not-a-directory');
    });

    it('propagates the failure when the default location is unusable too', () => {
      const blocker = path.join(workDir, 'also-not-a-directory');
      fs.writeFileSync(blocker, 'x');
      const unusable = path.join(blocker, 'nested');

      expect(() => ensureLocalUploadDir(unusable, unusable)).toThrow();
    });

    it('keeps the historical default and creates it', () => {
      expect(defaultUploadDir()).toBe(path.join(process.cwd(), 'uploads'));
      expect(ensureLocalUploadDir(uploadDir)).toBe(path.resolve(uploadDir));
      expect(fs.existsSync(uploadDir)).toBe(true);
    });

    it('fails loudly for an unsupported driver instead of silently using local storage', () => {
      expect(() => createStorageProvider({ STORAGE_DRIVER: 's3' })).toThrow(
        UnsupportedStorageDriverError,
      );
      expect(() => createStorageProvider({ STORAGE_DRIVER: 's3' })).toThrow(
        /Unsupported STORAGE_DRIVER "s3"/,
      );
    });
  });

  describe('StorageService facade', () => {
    it('delegates every operation to the injected provider', async () => {
      const provider = new LocalStorageProvider(uploadDir);
      const service = new StorageService(provider);

      expect(service.driver).toBe('local');
      const stored = await service.storeFile('a.txt', Buffer.from('hello'));
      expect(await service.exists(stored.storageKey)).toBe(true);
      expect((await service.readFile(stored.storageKey)).toString()).toBe(
        'hello',
      );
      await service.deleteFile(stored.storageKey);
      expect(await service.exists(stored.storageKey)).toBe(false);
    });

    it('works with a non-filesystem provider (future S3 compatibility)', async () => {
      const memory = new Map<string, Buffer>();
      const service = new StorageService({
        driver: 'memory',
        storeFile: (key, content) => {
          memory.set(key, content);
          return Promise.resolve({
            storageKey: key,
            sizeBytes: content.length,
          });
        },
        readFile: (key) => Promise.resolve(memory.get(key) ?? Buffer.from('')),
        deleteFile: (key) => {
          memory.delete(key);
          return Promise.resolve();
        },
        exists: (key) => Promise.resolve(memory.has(key)),
      });

      const stored = await service.storeFile('b.txt', Buffer.from('data'));
      expect(stored.sizeBytes).toBe(4);
      expect(await service.exists('b.txt')).toBe(true);
    });
  });
});
