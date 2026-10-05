import {
  archiveChecksum,
  packArchive,
  streamPackArchiveToBuffer,
  unpackArchive,
  type BackupManifest,
  type BackupStreamRecord,
} from './archive';

const sampleManifest: BackupManifest = {
  formatVersion: '1',
  applicationVersion: 'test',
  createdAt: new Date().toISOString(),
  scope: { includeDatabase: true, includeFiles: false },
  tables: ['components'],
  files: [],
  encrypted: true,
};

const archive = {
  manifest: sampleManifest,
  tables: {
    components: [
      { id: '1', name: 'Resistor' },
      { id: '2', name: 'Capacitor' },
    ],
  },
  files: [],
};

describe('backup archive v1 tests', () => {
  it('round-trips encrypted archives and produces a valid checksum', () => {
    const content = packArchive(archive, 'passphrase');
    expect(unpackArchive(content, 'passphrase').tables.components).toHaveLength(
      2,
    );
    expect(archiveChecksum(content)).toHaveLength(64);
  });

  it('fails unpacking when the password is wrong', () => {
    const payload = packArchive(archive, 'passphrase');
    expect(() => unpackArchive(payload, 'wrong-password')).toThrow();
  });

  it('fails unpacking when payload is corrupted', () => {
    const payload = packArchive(archive, 'passphrase');
    const tampered = Buffer.from(payload);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] === 0 ? 1 : 0;
    expect(() => unpackArchive(tampered, 'passphrase')).toThrow();
  });

  it('unpacks plain archive without passphrase', () => {
    const plainArchive = {
      ...archive,
      manifest: { ...sampleManifest, encrypted: false },
    };
    const payload = packArchive(plainArchive);
    const restored = unpackArchive(payload);
    expect(restored.manifest.encrypted).toBe(false);
    expect(restored.tables.components).toHaveLength(2);
  });

  it('fails unpacking plaintext archive when passphrase is provided', () => {
    const plainArchive = {
      ...archive,
      manifest: { ...sampleManifest, encrypted: false },
    };
    const payload = packArchive(plainArchive);
    expect(() => unpackArchive(payload, 'should-not-be-set')).toThrow();
  });
});

describe('backup archive v2 malicious validation tests', () => {
  const v2Manifest: BackupManifest = {
    formatVersion: '2',
    applicationVersion: 'test-2.0',
    createdAt: new Date().toISOString(),
    scope: { includeDatabase: true, includeFiles: true },
    tables: ['components'],
    files: ['valid.txt'],
    encrypted: false,
  };

  function* sampleRecords(): Iterable<BackupStreamRecord> {
    yield {
      type: 'table',
      table: 'components',
      row: { id: '1', name: 'Resistor' },
    };
    yield {
      type: 'file',
      storageKey: 'valid.txt',
      content: Buffer.from('hello world').toString('base64'),
    };
  }

  it('1. Valid plaintext archive', async () => {
    const buf = await streamPackArchiveToBuffer(v2Manifest, sampleRecords());
    const unpacked = unpackArchive(buf);
    expect(unpacked.manifest.formatVersion).toBe('2');
    expect(unpacked.tables.components).toHaveLength(1);
    expect(unpacked.files).toHaveLength(1);
    expect(unpacked.files[0]?.storageKey).toBe('valid.txt');
  });

  it('2. Valid encrypted archive', async () => {
    const encManifest = { ...v2Manifest, encrypted: true };
    const buf = await streamPackArchiveToBuffer(
      encManifest,
      sampleRecords(),
      'secret-key',
    );
    const unpacked = unpackArchive(buf, 'secret-key');
    expect(unpacked.manifest.encrypted).toBe(true);
    expect(unpacked.tables.components).toHaveLength(1);
    expect(unpacked.files[0]?.storageKey).toBe('valid.txt');
  });

  it('3. Wrong passphrase', async () => {
    const encManifest = { ...v2Manifest, encrypted: true };
    const buf = await streamPackArchiveToBuffer(
      encManifest,
      sampleRecords(),
      'secret-key',
    );
    expect(() => unpackArchive(buf, 'wrong-password')).toThrow();
  });

  it('4. Corrupt authentication tag', async () => {
    const encManifest = { ...v2Manifest, encrypted: true };
    const buf = await streamPackArchiveToBuffer(
      encManifest,
      sampleRecords(),
      'secret-key',
    );
    const lines = buf.toString('utf8').split('\n');
    const chunkObj = JSON.parse(lines[1]!) as { tag: string };
    chunkObj.tag = Buffer.from('corruptedtag1234').toString('base64');
    lines[1] = JSON.stringify(chunkObj);
    const corrupted = Buffer.from(lines.join('\n'), 'utf8');

    expect(() => unpackArchive(corrupted, 'secret-key')).toThrow(
      'tag verification failed',
    );
  });

  it('5. Corrupt chunk ordering', async () => {
    const encManifest = { ...v2Manifest, encrypted: true };
    const buf = await streamPackArchiveToBuffer(
      encManifest,
      sampleRecords(),
      'secret-key',
    );
    const lines = buf.toString('utf8').split('\n');
    const chunkObj = JSON.parse(lines[1]!) as { index: number };
    chunkObj.index = 999; // invalid sequence index
    lines[1] = JSON.stringify(chunkObj);
    const corrupted = Buffer.from(lines.join('\n'), 'utf8');

    expect(() => unpackArchive(corrupted, 'secret-key')).toThrow(
      'chunk sequence is invalid',
    );
  });

  it('6. Absolute path', async () => {
    function* badRecords(): Iterable<BackupStreamRecord> {
      yield {
        type: 'file',
        storageKey: '/etc/shadow',
        content: Buffer.from('root:x').toString('base64'),
      };
    }
    const buf = await streamPackArchiveToBuffer(
      { ...v2Manifest, files: ['/etc/shadow'] },
      badRecords(),
    );
    expect(() => unpackArchive(buf)).toThrow('unsafe or duplicate file path');
  });

  it('7. ../ traversal', async () => {
    function* badRecords(): Iterable<BackupStreamRecord> {
      yield {
        type: 'file',
        storageKey: 'uploads/../../etc/passwd',
        content: Buffer.from('root:x').toString('base64'),
      };
    }
    const buf = await streamPackArchiveToBuffer(
      { ...v2Manifest, files: ['uploads/../../etc/passwd'] },
      badRecords(),
    );
    expect(() => unpackArchive(buf)).toThrow('unsafe or duplicate file path');
  });

  it('8. Null byte', async () => {
    function* badRecords(): Iterable<BackupStreamRecord> {
      yield {
        type: 'file',
        storageKey: 'uploads/file\0.txt',
        content: Buffer.from('evil').toString('base64'),
      };
    }
    const buf = await streamPackArchiveToBuffer(
      { ...v2Manifest, files: ['uploads/file\0.txt'] },
      badRecords(),
    );
    expect(() => unpackArchive(buf)).toThrow('unsafe or duplicate file path');
  });

  it('9. Duplicate storage key', async () => {
    function* badRecords(): Iterable<BackupStreamRecord> {
      yield {
        type: 'file',
        storageKey: 'dup.txt',
        content: Buffer.from('one').toString('base64'),
      };
      yield {
        type: 'file',
        storageKey: 'dup.txt',
        content: Buffer.from('two').toString('base64'),
      };
    }
    const buf = await streamPackArchiveToBuffer(
      { ...v2Manifest, files: ['dup.txt', 'dup.txt'] },
      badRecords(),
    );
    expect(() => unpackArchive(buf)).toThrow('unsafe or duplicate file path');
  });

  it('10. Excessive file count', async () => {
    function* manyFiles(): Iterable<BackupStreamRecord> {
      for (let i = 0; i < 5; i++) {
        yield {
          type: 'file',
          storageKey: `file-${i}.txt`,
          content: Buffer.from('data').toString('base64'),
        };
      }
    }
    const buf = await streamPackArchiveToBuffer(
      {
        ...v2Manifest,
        files: [
          'file-0.txt',
          'file-1.txt',
          'file-2.txt',
          'file-3.txt',
          'file-4.txt',
        ],
      },
      manyFiles(),
    );
    expect(() => unpackArchive(buf, undefined, { maxFiles: 3 })).toThrow(
      'Backup contains too many files.',
    );
  });

  it('11. Excessive file size', async () => {
    function* bigFile(): Iterable<BackupStreamRecord> {
      yield {
        type: 'file',
        storageKey: 'large.bin',
        content: Buffer.alloc(200, 1).toString('base64'),
      };
    }
    const buf = await streamPackArchiveToBuffer(
      { ...v2Manifest, files: ['large.bin'] },
      bigFile(),
    );
    expect(() => unpackArchive(buf, undefined, { maxFileBytes: 100 })).toThrow(
      'Backup contains an oversized file.',
    );
  });

  it('12. Excessive table rows', async () => {
    function* manyRows(): Iterable<BackupStreamRecord> {
      for (let i = 0; i < 10; i++) {
        yield {
          type: 'table',
          table: 'components',
          row: { id: String(i) },
        };
      }
    }
    const buf = await streamPackArchiveToBuffer(v2Manifest, manyRows());
    expect(() => unpackArchive(buf, undefined, { maxTableRows: 5 })).toThrow(
      'Backup contains too many records.',
    );
  });

  it('13. Excessive total decompressed size', async () => {
    function* records(): Iterable<BackupStreamRecord> {
      for (let i = 0; i < 20; i++) {
        yield {
          type: 'table',
          table: 'components',
          row: { id: String(i), text: 'x'.repeat(100) },
        };
      }
    }
    const buf = await streamPackArchiveToBuffer(v2Manifest, records());
    expect(() =>
      unpackArchive(buf, undefined, { maxDecompressedBytes: 100 }),
    ).toThrow('Backup archive exceeds decompressed size limit.');
  });

  it('14. Malformed manifest', async () => {
    const badManifest = {
      ...v2Manifest,
      tables: ['valid_table', 'invalid table with spaces & punctuation!'],
    };
    const buf = await streamPackArchiveToBuffer(badManifest, sampleRecords());
    expect(() => unpackArchive(buf)).toThrow(
      'Backup manifest is missing or malformed.',
    );
  });

  it('15. Unsupported version', () => {
    const futureHeader = {
      formatVersion: '99',
      encrypted: false,
      manifest: v2Manifest,
    };
    const badBuf = Buffer.from(`${JSON.stringify(futureHeader)}\npayload\n`);
    expect(() => unpackArchive(badBuf)).toThrow(
      'Unsupported backup format version "99".',
    );
  });
});
