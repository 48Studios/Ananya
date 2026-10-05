import { Test, TestingModule } from '@nestjs/testing';
import { BackupsService } from './backups.service';
import { StorageService } from '../documents/storage.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { promises as fs } from 'fs';
import { BadRequestException } from '@nestjs/common';
import type { BackupArchive } from './archive';

class MockStorageService {
  files = new Map<string, Buffer>();
  shouldFailOnKey?: string;
  failOnDeleteKey?: string;

  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.files.has(key));
  }

  readFile(key: string): Promise<Buffer> {
    const val = this.files.get(key);
    if (!val) return Promise.reject(new Error(`File ${key} not found`));
    return Promise.resolve(val);
  }

  storeFile(key: string, content: Buffer): Promise<void> {
    if (this.shouldFailOnKey && key === this.shouldFailOnKey) {
      return Promise.reject(new Error(`Injected failure storing ${key}`));
    }
    this.files.set(key, Buffer.from(content));
    return Promise.resolve();
  }

  async storeFileFromPath(key: string, filePath: string): Promise<void> {
    if (this.shouldFailOnKey && key === this.shouldFailOnKey) {
      throw new Error(`Injected failure storing from path ${key}`);
    }
    const content = await fs.readFile(filePath);
    this.files.set(key, content);
  }

  deleteFile(key: string): Promise<void> {
    if (this.failOnDeleteKey && key.includes(this.failOnDeleteKey)) {
      return Promise.reject(new Error(`Injected failure deleting ${key}`));
    }
    this.files.delete(key);
    return Promise.resolve();
  }
}

describe('Filesystem Restore & Staged Rollback', () => {
  let service: BackupsService;
  let storage: MockStorageService;
  let module: TestingModule;

  beforeEach(async () => {
    storage = new MockStorageService();
    module = await Test.createTestingModule({
      providers: [
        BackupsService,
        { provide: StorageService, useValue: storage },
        { provide: SecurityAuditService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    }).compile();
    service = module.get<BackupsService>(BackupsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('New file promotion succeeds and persists to storage', async () => {
    const archive: BackupArchive = {
      manifest: {
        formatVersion: '2',
        applicationVersion: 'test',
        createdAt: new Date().toISOString(),
        scope: {},
        tables: [],
        files: ['file1.txt', 'file2.txt'],
        encrypted: false,
      },
      tables: {},
      files: [
        {
          storageKey: 'file1.txt',
          content: Buffer.from('content 1').toString('base64'),
        },
        {
          storageKey: 'file2.txt',
          content: Buffer.from('content 2').toString('base64'),
        },
      ],
    };

    const staging = await service.stageFiles(archive);
    const promoted = await service.promoteFiles(archive, undefined, staging);

    expect(promoted).toEqual(['file1.txt', 'file2.txt']);
    expect(storage.files.get('file1.txt')?.toString('utf8')).toBe('content 1');
    expect(storage.files.get('file2.txt')?.toString('utf8')).toBe('content 2');

    await fs.rm(staging.directory, { recursive: true, force: true });
  });

  it('Existing file replacement creates backup, replaces file, and cleans backup', async () => {
    storage.files.set('existing.txt', Buffer.from('old content'));

    const archive: BackupArchive = {
      manifest: {
        formatVersion: '2',
        applicationVersion: 'test',
        createdAt: new Date().toISOString(),
        scope: {},
        tables: [],
        files: ['existing.txt'],
        encrypted: false,
      },
      tables: {},
      files: [
        {
          storageKey: 'existing.txt',
          content: Buffer.from('new content').toString('base64'),
        },
      ],
    };

    const staging = await service.stageFiles(archive);
    const promoted = await service.promoteFiles(archive, undefined, staging);

    expect(promoted).toEqual(['existing.txt']);
    expect(storage.files.get('existing.txt')?.toString('utf8')).toBe(
      'new content',
    );

    // Verify all temporary .backup- files were cleaned up
    const remainingBackupKeys = Array.from(storage.files.keys()).filter((k) =>
      k.includes('.backup-'),
    );
    expect(remainingBackupKeys).toHaveLength(0);

    await fs.rm(staging.directory, { recursive: true, force: true });
  });

  it('Mixed new + existing files promotes both and cleans temporary backups', async () => {
    storage.files.set('old.txt', Buffer.from('original old'));

    const archive: BackupArchive = {
      manifest: {
        formatVersion: '2',
        applicationVersion: 'test',
        createdAt: new Date().toISOString(),
        scope: {},
        tables: [],
        files: ['old.txt', 'fresh.txt'],
        encrypted: false,
      },
      tables: {},
      files: [
        {
          storageKey: 'old.txt',
          content: Buffer.from('updated old').toString('base64'),
        },
        {
          storageKey: 'fresh.txt',
          content: Buffer.from('brand new').toString('base64'),
        },
      ],
    };

    const staging = await service.stageFiles(archive);
    const promoted = await service.promoteFiles(archive, undefined, staging);

    expect(promoted).toEqual(['old.txt', 'fresh.txt']);
    expect(storage.files.get('old.txt')?.toString('utf8')).toBe('updated old');
    expect(storage.files.get('fresh.txt')?.toString('utf8')).toBe('brand new');

    await fs.rm(staging.directory, { recursive: true, force: true });
  });

  it('Failure after partial promotion: restores originals, deletes new files, and cleans backups', async () => {
    // Setup initial state: file1 exists, file2 does not
    storage.files.set('file1.txt', Buffer.from('original file 1 content'));

    const archive: BackupArchive = {
      manifest: {
        formatVersion: '2',
        applicationVersion: 'test',
        createdAt: new Date().toISOString(),
        scope: {},
        tables: [],
        files: ['file1.txt', 'file2.txt', 'file3.txt'],
        encrypted: false,
      },
      tables: {},
      files: [
        {
          storageKey: 'file1.txt',
          content: Buffer.from('new file 1').toString('base64'),
        },
        {
          storageKey: 'file2.txt',
          content: Buffer.from('new file 2').toString('base64'),
        },
        {
          storageKey: 'file3.txt',
          content: Buffer.from('new file 3').toString('base64'),
        },
      ],
    };

    const staging = await service.stageFiles(archive);

    // Inject failure on file3
    storage.shouldFailOnKey = 'file3.txt';

    await expect(
      service.promoteFiles(archive, undefined, staging),
    ).rejects.toThrow('Injected failure storing from path file3.txt');

    // Rollback verification:
    // 1. Existing file1 must be restored to original content
    expect(storage.files.get('file1.txt')?.toString('utf8')).toBe(
      'original file 1 content',
    );

    // 2. Newly-created file2 must be deleted
    expect(storage.files.has('file2.txt')).toBe(false);

    // 3. Failed file3 was never created
    expect(storage.files.has('file3.txt')).toBe(false);

    // 4. Temporary backup files are deleted
    const leftoverBackups = Array.from(storage.files.keys()).filter((k) =>
      k.includes('.backup-'),
    );
    expect(leftoverBackups).toHaveLength(0);

    await fs.rm(staging.directory, { recursive: true, force: true });
  });

  it('Cleanup failure logging: logs warning when backup removal fails, but succeeds', async () => {
    storage.files.set('target.txt', Buffer.from('initial'));
    storage.failOnDeleteKey = '.backup-';

    const warnSpy = jest.spyOn<any, any>(service['logger'], 'warn');

    const archive: BackupArchive = {
      manifest: {
        formatVersion: '2',
        applicationVersion: 'test',
        createdAt: new Date().toISOString(),
        scope: {},
        tables: [],
        files: ['target.txt'],
        encrypted: false,
      },
      tables: {},
      files: [
        {
          storageKey: 'target.txt',
          content: Buffer.from('replaced').toString('base64'),
        },
      ],
    };

    const staging = await service.stageFiles(archive);
    const promoted = await service.promoteFiles(archive, undefined, staging);

    expect(promoted).toEqual(['target.txt']);
    expect(storage.files.get('target.txt')?.toString('utf8')).toBe('replaced');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to delete temporary backup'),
    );

    await fs.rm(staging.directory, { recursive: true, force: true });
  });

  it('Staging failure with zero production mutation', async () => {
    const storeSpy = jest.spyOn(storage, 'storeFile');
    const storePathSpy = jest.spyOn(storage, 'storeFileFromPath');
    const deleteSpy = jest.spyOn(storage, 'deleteFile');

    const archive: BackupArchive = {
      manifest: {
        formatVersion: '2',
        applicationVersion: 'test',
        createdAt: new Date().toISOString(),
        scope: {},
        tables: [],
        files: ['../escape.txt'],
        encrypted: false,
      },
      tables: {},
      files: [
        {
          storageKey: '../escape.txt',
          content: Buffer.from('evil').toString('base64'),
        },
      ],
    };

    await expect(service.stageFiles(archive)).rejects.toThrow(
      BadRequestException,
    );

    // Verify production storage was not touched at all
    expect(storeSpy).not.toHaveBeenCalled();
    expect(storePathSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
