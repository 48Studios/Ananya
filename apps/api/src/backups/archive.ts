import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
} from 'crypto';
import { createGzip, gunzipSync, gzipSync } from 'zlib';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { once } from 'events';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { join } from 'path';
import { tmpdir } from 'os';

export interface BackupManifest {
  formatVersion: string;
  applicationVersion: string;
  createdAt: string;
  scope: Record<string, unknown>;
  tables: string[];
  files: string[];
  components?: string[];
  encrypted: boolean;
}

export interface BackupArchive {
  manifest: BackupManifest;
  tables: Record<string, unknown[]>;
  files: Array<{ storageKey: string; content: string }>;
}

export interface BackupStreamRecord {
  type: 'table' | 'file';
  table?: string;
  row?: unknown;
  storageKey?: string;
  content?: string;
}

export interface StreamedArchiveResult {
  sizeBytes: number;
  checksum: string;
  manifest: BackupManifest;
}

interface Envelope {
  formatVersion: string;
  encrypted: boolean;
  salt?: string;
  iv?: string;
  tag?: string;
  payload: string;
}

export function archiveChecksum(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function packArchive(
  archive: BackupArchive,
  passphrase?: string,
): Buffer {
  const plain = gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'));
  if (!passphrase) {
    return Buffer.from(
      JSON.stringify({
        formatVersion: archive.manifest.formatVersion,
        encrypted: false,
        payload: plain.toString('base64'),
      } satisfies Envelope),
      'utf8',
    );
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      formatVersion: archive.manifest.formatVersion,
      encrypted: true,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      payload: ciphertext.toString('base64'),
    } satisfies Envelope),
    'utf8',
  );
}

/**
 * Writes a v2 archive without materializing the complete snapshot. The
 * manifest is written first, followed by a gzip stream of newline-delimited
 * records. Encrypted archives use independently authenticated AES-GCM chunks;
 * every chunk has a unique IV derived from a random prefix and its sequence.
 */
export async function streamPackArchiveToFile(
  manifest: BackupManifest,
  records: AsyncIterable<BackupStreamRecord> | Iterable<BackupStreamRecord>,
  outputPath: string,
  passphrase?: string,
): Promise<StreamedArchiveResult> {
  // Validate that the manifest specifies the streaming format version
  if (manifest.formatVersion !== STREAM_FORMAT_VERSION) {
    throw new Error(
      `streamPackArchiveToFile only supports streaming format version '${STREAM_FORMAT_VERSION}'. ` +
        `Received formatVersion='${manifest.formatVersion}'.`,
    );
  }
  const header = {
    formatVersion: STREAM_FORMAT_VERSION,
    encrypted: Boolean(passphrase),
    algorithm: passphrase ? 'AES-256-GCM-CHUNKED' : undefined,
    chunkSize: STREAM_CHUNK_BYTES,
    salt: passphrase ? randomBytes(16).toString('base64') : undefined,
    ivPrefix: passphrase ? randomBytes(8).toString('base64') : undefined,
    manifest,
  };
  const headerLine = `${JSON.stringify(header)}\n`;
  const gzipPath = `${outputPath}.gzip-${randomBytes(8).toString('hex')}`;
  await fs.mkdir(join(outputPath, '..'), { recursive: true });
  try {
    const source = Readable.from(
      (async function* () {
        for await (const record of records) {
          yield `${JSON.stringify(record)}\n`;
        }
      })(),
    );
    await pipeline(source, createGzip(), createWriteStream(gzipPath));

    const output = createWriteStream(outputPath);
    output.write(headerLine);
    if (!passphrase) {
      await pipeline(createReadStream(gzipPath), output);
    } else {
      const key = scryptSync(
        passphrase,
        Buffer.from(header.salt!, 'base64'),
        32,
        { N: 16384, r: 8, p: 1 },
      );
      const ivPrefix = Buffer.from(header.ivPrefix!, 'base64');
      const input = createReadStream(gzipPath, {
        highWaterMark: STREAM_CHUNK_BYTES,
      });
      let index = 0;
      for await (const chunk of input) {
        if (index > 0xffffffff) throw new Error('Backup has too many chunks.');
        const iv = Buffer.alloc(12);
        ivPrefix.copy(iv, 0);
        iv.writeUInt32BE(index, 8);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from(headerLine));
        const ciphertext = Buffer.concat([
          cipher.update(chunk as Buffer),
          cipher.final(),
        ]);
        const line = `${JSON.stringify({
          index,
          iv: iv.toString('base64'),
          tag: cipher.getAuthTag().toString('base64'),
          data: ciphertext.toString('base64'),
        })}\n`;
        if (!output.write(line)) await once(output, 'drain');
        index += 1;
      }
      output.end();
      await once(output, 'close');
    }
    const digest = createHash('sha256');
    let sizeBytes = 0;
    for await (const chunk of createReadStream(outputPath)) {
      sizeBytes += (chunk as Buffer).length;
      digest.update(chunk as Buffer);
    }
    return { sizeBytes, checksum: digest.digest('hex'), manifest };
  } finally {
    await fs.rm(gzipPath, { force: true });
  }
}

export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const MAX_FILES = 100_000;
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_TABLE_ROWS = 10_000_000;
export const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024;
export const STREAM_FORMAT_VERSION = '2';
export const ENVELOPE_FORMAT_VERSION = '1';
export const STREAM_CHUNK_BYTES = 1024 * 1024;

export interface ArchiveValidationLimits {
  maxArchiveBytes?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  maxTableRows?: number;
  maxDecompressedBytes?: number;
}

export function validateStorageKey(
  storageKey: unknown,
  seenPaths: Set<string>,
): string {
  if (typeof storageKey !== 'string' || storageKey.length === 0) {
    throw new Error('Backup contains an unsafe or duplicate file path.');
  }
  if (storageKey.includes('\0')) {
    throw new Error('Backup contains an unsafe or duplicate file path.');
  }
  if (storageKey.startsWith('/') || storageKey.startsWith('\\')) {
    throw new Error('Backup contains an unsafe or duplicate file path.');
  }
  if (/^[a-zA-Z]:[\\/]/.test(storageKey)) {
    throw new Error('Backup contains an unsafe or duplicate file path.');
  }
  const parts = storageKey.split(/[\\/]/);
  if (parts.includes('..') || parts.includes('.')) {
    throw new Error('Backup contains an unsafe or duplicate file path.');
  }
  if (seenPaths.has(storageKey)) {
    throw new Error('Backup contains an unsafe or duplicate file path.');
  }
  seenPaths.add(storageKey);
  return storageKey;
}

export function validateFileContent(
  content: unknown,
  maxFileBytes: number = MAX_FILE_BYTES,
): string {
  if (typeof content !== 'string') {
    throw new Error('Streaming backup record is malformed.');
  }
  const size = Buffer.byteLength(content, 'base64');
  if (size > maxFileBytes) {
    throw new Error('Backup contains an oversized file.');
  }
  return content;
}

export function validateManifest(
  manifest: unknown,
  expectedVersion?: string,
): BackupManifest {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Backup manifest is missing or malformed.');
  }
  const m = manifest as Record<string, unknown>;
  if (typeof m.formatVersion !== 'string') {
    throw new Error('Backup manifest is missing or malformed.');
  }
  if (expectedVersion && m.formatVersion !== expectedVersion) {
    throw new Error(`Unsupported backup format version "${m.formatVersion}".`);
  }
  if (!Array.isArray(m.tables) || !Array.isArray(m.files)) {
    throw new Error('Backup manifest is missing or malformed.');
  }
  for (const table of m.tables) {
    if (typeof table !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw new Error('Backup manifest is missing or malformed.');
    }
  }
  for (const file of m.files) {
    if (typeof file !== 'string') {
      throw new Error('Backup manifest is missing or malformed.');
    }
  }
  if (
    typeof m.createdAt !== 'string' ||
    Number.isNaN(Date.parse(m.createdAt))
  ) {
    throw new Error('Backup manifest is missing or malformed.');
  }
  return m as unknown as BackupManifest;
}

export function safeGunzip(
  compressed: Buffer,
  maxBytes: number = MAX_DECOMPRESSED_BYTES,
): Buffer {
  try {
    return gunzipSync(compressed, { maxOutputLength: maxBytes });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new Error('Backup archive exceeds decompressed size limit.');
    }
    throw new Error('Backup archive contains corrupt compressed data.');
  }
}

export async function streamPackArchiveToBuffer(
  manifest: BackupManifest,
  records: AsyncIterable<BackupStreamRecord> | Iterable<BackupStreamRecord>,
  passphrase?: string,
): Promise<Buffer> {
  const tmp = join(tmpdir(), `ananya-stream-${randomUUID()}.archive`);
  try {
    await streamPackArchiveToFile(manifest, records, tmp, passphrase);
    return await fs.readFile(tmp);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

export function unpackArchive(
  content: Buffer,
  passphrase?: string,
  limits?: ArchiveValidationLimits,
): BackupArchive {
  const maxArchiveBytes = limits?.maxArchiveBytes ?? MAX_ARCHIVE_BYTES;
  const maxFiles = limits?.maxFiles ?? MAX_FILES;
  const maxFileBytes = limits?.maxFileBytes ?? MAX_FILE_BYTES;
  const maxTableRows = limits?.maxTableRows ?? MAX_TABLE_ROWS;
  const maxDecompressedBytes =
    limits?.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES;

  if (content.length > maxArchiveBytes) {
    throw new Error('Backup archive exceeds the configured size limit.');
  }
  const firstLineEnd = content.indexOf(0x0a);
  const firstLine =
    firstLineEnd >= 0 ? content.subarray(0, firstLineEnd).toString('utf8') : '';
  if (firstLine) {
    let header:
      | {
          formatVersion?: string;
          encrypted?: boolean;
          algorithm?: string;
          chunkSize?: number;
          salt?: string;
          ivPrefix?: string;
          manifest?: BackupManifest;
        }
      | undefined;
    try {
      header = JSON.parse(firstLine) as typeof header;
    } catch {
      // not a v2 header line
    }
    if (header && typeof header === 'object' && header.formatVersion) {
      if (header.formatVersion === STREAM_FORMAT_VERSION) {
        return unpackStreamArchive(
          content.subarray(firstLineEnd + 1),
          header as Required<typeof header>,
          firstLine,
          passphrase,
          { maxFiles, maxFileBytes, maxTableRows, maxDecompressedBytes },
        );
      }
      throw new Error(
        `Unsupported backup format version "${header.formatVersion}".`,
      );
    }
  }

  let envelope: Envelope;
  try {
    envelope = JSON.parse(content.toString('utf8')) as Envelope;
  } catch {
    throw new Error('Backup archive is malformed or corrupted.');
  }
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.formatVersion !== ENVELOPE_FORMAT_VERSION
  ) {
    throw new Error(
      `Unsupported backup format version "${envelope?.formatVersion ?? 'unknown'}".`,
    );
  }

  function unpackStreamArchive(
    payload: Buffer,
    header: {
      formatVersion: string;
      encrypted: boolean;
      algorithm?: string;
      salt?: string;
      ivPrefix?: string;
      manifest?: BackupManifest;
    },
    headerLine: string,
    passphrase?: string,
    streamLimits?: {
      maxFiles: number;
      maxFileBytes: number;
      maxTableRows: number;
      maxDecompressedBytes: number;
    },
  ): BackupArchive {
    const sLimits = streamLimits ?? {
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxTableRows: MAX_TABLE_ROWS,
      maxDecompressedBytes: MAX_DECOMPRESSED_BYTES,
    };
    if (!header.manifest) {
      throw new Error('Streaming backup manifest is missing or malformed.');
    }
    validateManifest(header.manifest, STREAM_FORMAT_VERSION);

    let compressed: Buffer;
    if (!header.encrypted) {
      compressed = payload;
    } else {
      if (!passphrase) {
        throw new Error(
          'This backup is encrypted and requires its passphrase.',
        );
      }
      if (
        header.algorithm !== 'AES-256-GCM-CHUNKED' ||
        !header.salt ||
        !header.ivPrefix
      ) {
        throw new Error('Streaming backup encryption metadata is invalid.');
      }
      const key = scryptSync(
        passphrase,
        Buffer.from(header.salt, 'base64'),
        32,
        { N: 16384, r: 8, p: 1 },
      );
      const chunks: Buffer[] = [];
      let expectedIndex = 0;
      const lines = payload.toString('utf8').split('\n').filter(Boolean);
      if (lines.length === 0) {
        throw new Error('Streaming backup contains no encrypted chunks.');
      }
      for (const line of lines) {
        let chunk: {
          index: number;
          iv: string;
          tag: string;
          data: string;
        };
        try {
          chunk = JSON.parse(line) as typeof chunk;
        } catch {
          throw new Error('Streaming backup chunk structure is invalid.');
        }
        if (
          !chunk ||
          typeof chunk !== 'object' ||
          typeof chunk.index !== 'number' ||
          typeof chunk.iv !== 'string' ||
          typeof chunk.tag !== 'string' ||
          typeof chunk.data !== 'string'
        ) {
          throw new Error('Streaming backup chunk structure is invalid.');
        }
        if (chunk.index !== expectedIndex) {
          throw new Error('Streaming backup chunk sequence is invalid.');
        }
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(chunk.iv, 'base64'),
        );
        decipher.setAAD(Buffer.from(`${headerLine}\n`));
        decipher.setAuthTag(Buffer.from(chunk.tag, 'base64'));
        try {
          chunks.push(
            Buffer.concat([
              decipher.update(Buffer.from(chunk.data, 'base64')),
              decipher.final(),
            ]),
          );
        } catch {
          throw new Error(
            'Streaming backup authentication tag verification failed.',
          );
        }
        expectedIndex += 1;
      }
      compressed = Buffer.concat(chunks);
    }

    const decompressed = safeGunzip(compressed, sLimits.maxDecompressedBytes);
    const lines = decompressed.toString('utf8').split('\n').filter(Boolean);
    const tables: Record<string, unknown[]> = {};
    const files: BackupArchive['files'] = [];
    const seenPaths = new Set<string>();
    let totalRows = 0;

    for (const line of lines) {
      let record: BackupStreamRecord;
      try {
        record = JSON.parse(line) as BackupStreamRecord;
      } catch {
        throw new Error('Streaming backup record is malformed.');
      }
      if (!record || typeof record !== 'object') {
        throw new Error('Streaming backup record is malformed.');
      }
      if (record.type === 'table') {
        if (
          !record.table ||
          typeof record.table !== 'string' ||
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(record.table)
        ) {
          throw new Error('Streaming backup record is malformed.');
        }
        totalRows += 1;
        if (totalRows > sLimits.maxTableRows) {
          throw new Error('Backup contains too many records.');
        }
        (tables[record.table] ??= []).push(record.row);
      } else if (record.type === 'file') {
        if (files.length >= sLimits.maxFiles) {
          throw new Error('Backup contains too many files.');
        }
        const storageKey = validateStorageKey(record.storageKey, seenPaths);
        const fileContent = validateFileContent(
          record.content,
          sLimits.maxFileBytes,
        );
        files.push({ storageKey, content: fileContent });
      } else {
        throw new Error('Streaming backup record is malformed.');
      }
    }

    return {
      manifest: header.manifest,
      tables,
      files,
    };
  }

  if (envelope.encrypted && !passphrase) {
    throw new Error('This backup is encrypted and requires its passphrase.');
  }
  if (!envelope.encrypted && passphrase) {
    throw new Error(
      'This backup is not encrypted; a passphrase must not be supplied.',
    );
  }
  let payload = Buffer.from(envelope.payload, 'base64');
  if (envelope.encrypted) {
    if (!envelope.salt || !envelope.iv || !envelope.tag) {
      throw new Error('Encrypted backup metadata is incomplete.');
    }
    const key = scryptSync(
      passphrase!,
      Buffer.from(envelope.salt, 'base64'),
      32,
      { N: 16384, r: 8, p: 1 },
    );
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    try {
      payload = Buffer.concat([decipher.update(payload), decipher.final()]);
    } catch {
      throw new Error('Backup authentication tag verification failed.');
    }
  }

  const decompressed = safeGunzip(payload, maxDecompressedBytes);
  let archive: BackupArchive;
  try {
    archive = JSON.parse(decompressed.toString('utf8')) as BackupArchive;
  } catch {
    throw new Error('Backup archive is malformed or corrupted.');
  }

  validateManifest(archive.manifest, ENVELOPE_FORMAT_VERSION);

  if (
    !archive.tables ||
    typeof archive.tables !== 'object' ||
    Array.isArray(archive.tables)
  ) {
    throw new Error('Backup table data is malformed.');
  }
  if (!Array.isArray(archive.files)) {
    throw new Error('Backup manifest is missing or incompatible.');
  }
  if (archive.files.length > maxFiles) {
    throw new Error('Backup contains too many files.');
  }

  const paths = new Set<string>();
  for (const file of archive.files) {
    if (!file || typeof file !== 'object') {
      throw new Error('Backup contains an unsafe or duplicate file path.');
    }
    validateStorageKey(file.storageKey, paths);
    validateFileContent(file.content, maxFileBytes);
  }

  let rows = 0;
  for (const tableRows of Object.values(archive.tables)) {
    if (!Array.isArray(tableRows)) {
      throw new Error('Backup table data is malformed.');
    }
    rows += tableRows.length;
    if (rows > maxTableRows) {
      throw new Error('Backup contains too many records.');
    }
  }

  return archive;
}
