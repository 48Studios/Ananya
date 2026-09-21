import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { isPathInsideDirectory } from './document-file';

/**
 * Storage abstraction for documentation files.
 *
 * Pass 1 ships the local filesystem provider only. The interface exists so a
 * future S3-compatible provider can be added without touching the service,
 * controller or schema: implement {@link IStorageProvider}, add its driver name
 * to {@link SUPPORTED_STORAGE_DRIVERS} and register it in
 * {@link createStorageProvider}.
 */
export interface StoredObject {
  /** The key the object was actually written under. Authoritative for reads. */
  storageKey: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  /** Driver name as configured through `STORAGE_DRIVER`. */
  readonly driver: string;
  storeFile(storageKey: string, content: Buffer): Promise<StoredObject>;
  readFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = 'DOCUMENT_STORAGE_PROVIDER';

export const SUPPORTED_STORAGE_DRIVERS = ['local'] as const;

export class UnsupportedStorageDriverError extends Error {
  constructor(driver: string) {
    super(
      `Unsupported STORAGE_DRIVER "${driver}". Supported drivers: ${SUPPORTED_STORAGE_DRIVERS.join(', ')}.`,
    );
    this.name = 'UnsupportedStorageDriverError';
  }
}

export class StorageObjectNotFoundError extends Error {
  constructor(storageKey: string) {
    super(
      `Stored file for key "${storageKey}" is missing. The record exists but its file is no longer available.`,
    );
    this.name = 'StorageObjectNotFoundError';
  }
}

/**
 * Resolves the directory the local provider writes to.
 *
 * `STORAGE_LOCAL_PATH` is honoured when set (the deployment default is
 * `/app/uploads`, which is the mounted volume); otherwise the historical
 * `<cwd>/uploads` location is kept, so an environment that never configured the
 * variable behaves exactly as before.
 */
export function resolveLocalUploadDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured = env.STORAGE_LOCAL_PATH?.trim();
  if (configured) return path.resolve(configured);
  return defaultUploadDir();
}

/** The location used before `STORAGE_LOCAL_PATH` existed, and as a fallback. */
export function defaultUploadDir(): string {
  return path.join(process.cwd(), 'uploads');
}

/**
 * Creates the upload directory, falling back to the historical location.
 *
 * A configured path can be unusable outside its intended environment — the
 * container default `/app/uploads` does not exist on a developer machine or CI
 * runner. Rather than refusing to start (which would take the whole API down
 * for a storage-path problem, including read-only features), the provider falls
 * back to `<cwd>/uploads` and logs a warning naming both paths. The fallback is
 * only ever used when the configured directory genuinely cannot be created.
 */
export function ensureLocalUploadDir(
  preferred: string,
  fallback: string = defaultUploadDir(),
  logger?: { warn: (message: string) => void },
): string {
  const resolvedPreferred = path.resolve(preferred);
  try {
    fs.mkdirSync(resolvedPreferred, { recursive: true });
    return resolvedPreferred;
  } catch (error) {
    if (resolvedPreferred === path.resolve(fallback)) {
      throw error;
    }
    logger?.warn(
      `Upload directory "${resolvedPreferred}" is not usable (${String(error)}); falling back to "${path.resolve(fallback)}".`,
    );
    const resolvedFallback = path.resolve(fallback);
    fs.mkdirSync(resolvedFallback, { recursive: true });
    return resolvedFallback;
  }
}

export function resolveStorageDriver(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.STORAGE_DRIVER?.trim().toLowerCase() || 'local';
}

/**
 * Local filesystem provider.
 *
 * Every operation reduces the caller-supplied key to a base name, checks the
 * resulting path is inside the configured directory, and only then touches the
 * filesystem. Deletion is tolerant of a missing object (retrying a failed
 * delete must not fail the request); reads are not, because silently returning
 * an empty file would be a wrong answer rather than an error.
 */
export class LocalStorageProvider implements IStorageProvider {
  readonly driver = 'local';
  private readonly uploadDir: string;
  private readonly logger = new Logger(LocalStorageProvider.name);

  constructor(uploadDir: string = resolveLocalUploadDir()) {
    this.uploadDir = ensureLocalUploadDir(uploadDir, defaultUploadDir(), {
      warn: (message) => this.logger.warn(message),
    });
  }

  get directory(): string {
    return this.uploadDir;
  }

  async storeFile(storageKey: string, content: Buffer): Promise<StoredObject> {
    const target = this.resolvePath(storageKey);
    await fs.promises.writeFile(target, content);
    return { storageKey: path.basename(target), sizeBytes: content.length };
  }

  async readFile(storageKey: string): Promise<Buffer> {
    const target = this.resolvePath(storageKey);
    if (!fs.existsSync(target)) {
      throw new StorageObjectNotFoundError(storageKey);
    }
    return fs.promises.readFile(target);
  }

  async deleteFile(storageKey: string): Promise<void> {
    const target = this.resolvePath(storageKey);
    if (!fs.existsSync(target)) {
      this.logger.warn(
        `Storage object "${storageKey}" was already absent; nothing to delete.`,
      );
      return;
    }
    await fs.promises.unlink(target);
  }

  exists(storageKey: string): Promise<boolean> {
    return Promise.resolve(fs.existsSync(this.resolvePath(storageKey)));
  }

  /**
   * Maps a storage key to an absolute path, refusing anything that escapes the
   * upload directory.
   */
  private resolvePath(storageKey: string): string {
    const baseName = path.basename(String(storageKey).replace(/\\/g, '/'));
    if (baseName.length === 0 || baseName === '.' || baseName === '..') {
      throw new Error(`Invalid storage key: "${storageKey}".`);
    }
    const target = path.join(this.uploadDir, baseName);
    if (!isPathInsideDirectory(this.uploadDir, target)) {
      throw new Error(
        `Refusing to access a path outside the upload directory for key "${storageKey}".`,
      );
    }
    return target;
  }
}

/**
 * Builds the configured provider. Throws for an unknown driver instead of
 * silently falling back to local storage, so a misconfigured deployment fails
 * loudly at startup rather than writing files somewhere unexpected.
 */
export function createStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
): IStorageProvider {
  const driver = resolveStorageDriver(env);
  switch (driver) {
    case 'local':
      return new LocalStorageProvider(resolveLocalUploadDir(env));
    default:
      throw new UnsupportedStorageDriverError(driver);
  }
}

/**
 * Nest-injectable facade used by `DocumentsService`.
 *
 * The provider is injected through {@link STORAGE_PROVIDER} so tests can supply
 * an in-memory double without touching the filesystem.
 */
@Injectable()
export class StorageService implements IStorageProvider {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: IStorageProvider,
  ) {}

  get driver(): string {
    return this.provider.driver;
  }

  storeFile(storageKey: string, content: Buffer): Promise<StoredObject> {
    return this.provider.storeFile(storageKey, content);
  }

  readFile(storageKey: string): Promise<Buffer> {
    return this.provider.readFile(storageKey);
  }

  deleteFile(storageKey: string): Promise<void> {
    return this.provider.deleteFile(storageKey);
  }

  exists(storageKey: string): Promise<boolean> {
    return this.provider.exists(storageKey);
  }
}
