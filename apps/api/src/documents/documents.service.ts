import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { db } from '@ananya/database';
import {
  components,
  documents,
  documentVersions,
} from '@ananya/database/schema';
import { and, desc, eq } from '@ananya/database/query';
import { StorageObjectNotFoundError, StorageService } from './storage.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import {
  CreateDocumentVersionDto,
  CreateExternalUrlDocumentDto,
  UpdateDocumentMetadataDto,
  UploadDocumentDto,
  UploadedDocumentFile,
} from './dtos';
import {
  DocumentSourceType,
  DocumentType,
  normalizeDocumentType,
  readDocumentSourceType,
  readDocumentType,
} from './document-types';
import {
  COMPONENT_DOCUMENT_ENTITY_TYPE,
  isSupportedDocumentEntityType,
  SUPPORTED_DOCUMENT_ENTITY_TYPES,
} from './document-entities';
import {
  buildDocumentStorageKey,
  formatDocumentBytes,
  MAX_DOCUMENT_UPLOAD_BYTES,
  resolveDocumentMimeType,
  sanitizeDocumentFileName,
} from './document-file';
import {
  parseBooleanInput,
  parseDocumentTags,
  parseOptionalText,
} from './document-metadata';
import { externalUrlHost, validateExternalUrl } from './document-url';

/** Authenticated principal performing a documentation change. */
export interface DocumentActor {
  id?: string;
  email?: string;
}

/** API representation of a documentation record. */
export interface DocumentationRecord {
  id: string;
  entityType: string;
  entityId: string;
  documentType: DocumentType;
  sourceType: DocumentSourceType;
  title: string;
  description: string | null;
  tags: string[];
  isConfidential: boolean;
  externalUrl: string | null;
  externalUrlHost: string | null;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  currentVersion: number;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Authenticated API paths for the stored file. Derived rather than read from
   * `file_url`, so records written before this pass (whose `file_url` pointed at
   * an unserved `/uploads/...` location) become downloadable too. `null` for
   * external references, which have no bytes on this server.
   */
  downloadPath: string | null;
  previewPath: string | null;
}

/** A stored object resolved for download/preview. */
export interface DocumentFileContent {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const ACTIVITY_MODULE = 'Documents';

/**
 * Component documentation.
 *
 * This service turns the repository's dormant generic document tables into the
 * production Component Documentation feature. It deliberately keeps using the
 * generic `documents` / `document_versions` infrastructure and the polymorphic
 * `(entity_type, entity_id)` association, so component consolidation keeps
 * repointing documentation to the surviving component without any change.
 *
 * Two source kinds are supported:
 *  - `UPLOADED_FILE` — validated, stored through {@link StorageService}, with
 *    revisions in `document_versions` and authenticated download/preview.
 *  - `EXTERNAL_URL`   — a validated external link with no stored object and no
 *    placeholder file metadata. External URLs are never fetched, crawled or
 *    mirrored by this service.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async uploadDocument(
    dto: UploadDocumentDto,
    file: UploadedDocumentFile | undefined,
    actor: DocumentActor,
  ): Promise<DocumentationRecord> {
    // Cheap, pure validation first; the entity lookup is the only step that
    // needs the database and it runs last.
    const uploaded = this.validateUploadedFile(file);
    const documentType = this.requireDocumentType(dto.documentType);
    await this.assertEntityExists(dto.entityType, dto.entityId);

    const fileName = sanitizeDocumentFileName(uploaded.originalname);
    const documentId = randomUUID();
    const storageKey = buildDocumentStorageKey({
      entityType: dto.entityType,
      entityId: dto.entityId,
      uniqueSuffix: documentId,
      fileName,
    });

    const stored = await this.storageService.storeFile(
      storageKey,
      uploaded.buffer,
    );

    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(documents)
          .values({
            id: documentId,
            entityType: dto.entityType,
            entityId: dto.entityId,
            documentType,
            sourceType: 'UPLOADED_FILE',
            title: this.resolveTitle(dto.title, fileName),
            description: parseOptionalText(dto.description) ?? null,
            fileName,
            fileUrl: this.downloadPath(documentId),
            storageKey: stored.storageKey,
            mimeType: uploaded.mimeType,
            sizeBytes: stored.sizeBytes,
            currentVersion: 1,
            tags: parseDocumentTags(dto.tags),
            isConfidential: parseBooleanInput(dto.isConfidential) ?? false,
            uploadedById: actor.id ?? null,
          })
          .returning();

        if (!row) {
          throw new BadRequestException('Failed to create document record');
        }

        await tx.insert(documentVersions).values({
          documentId: row.id,
          versionNumber: 1,
          fileName,
          fileUrl: this.downloadPath(row.id, 1),
          storageKey: stored.storageKey,
          mimeType: uploaded.mimeType,
          sizeBytes: stored.sizeBytes,
          changelog: 'Initial upload (v1)',
          uploadedById: actor.id ?? null,
        });

        return row;
      });

      await this.activityService.createEvent({
        module: ACTIVITY_MODULE,
        entityType: created.entityType,
        entityId: created.entityId,
        eventType: 'DOCUMENT_UPLOADED',
        description: `Uploaded document ${fileName} for ${created.entityType}`,
        severity: 'INFO',
        status: 'COMPLETED',
        metadata: {
          documentId: created.id,
          fileName,
          title: created.title,
          documentType,
          sourceType: 'UPLOADED_FILE',
        },
        userId: actor.id,
        userEmail: actor.email,
      });

      await this.auditService.record({
        action: 'DOCUMENT_UPLOAD',
        category: ACTIVITY_MODULE,
        userId: actor.id,
        userEmail: actor.email,
        details: {
          documentId: created.id,
          fileName,
          entityType: created.entityType,
          entityId: created.entityId,
          documentType,
        },
      });

      return this.toRecord(created);
    } catch (error) {
      // The file is already on disk; a failed write must not leave it behind.
      await this.removeStoredFile(stored.storageKey);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // External references
  // -------------------------------------------------------------------------

  /**
   * Files an external reference (manufacturer page, vendor-hosted manual, ...).
   *
   * Nothing is fetched from the URL: it is validated, stored verbatim and
   * surfaced as a link. The record carries no file metadata at all, so it can
   * never be mistaken for — or downloaded as — a stored object.
   */
  async createExternalUrlDocument(
    dto: CreateExternalUrlDocumentDto,
    actor: DocumentActor,
  ): Promise<DocumentationRecord> {
    const documentType = this.requireDocumentType(dto.documentType);
    const url = validateExternalUrl(dto.url);
    if (!url.ok) {
      throw new BadRequestException(url.message);
    }
    await this.assertEntityExists(dto.entityType, dto.entityId);

    const [created] = await db
      .insert(documents)
      .values({
        entityType: dto.entityType,
        entityId: dto.entityId,
        documentType,
        sourceType: 'EXTERNAL_URL',
        title: this.resolveTitle(dto.title, url.value.host),
        description: parseOptionalText(dto.description) ?? null,
        externalUrl: url.value.url,
        // No stored object: file metadata stays NULL rather than being faked.
        fileName: null,
        fileUrl: null,
        storageKey: null,
        mimeType: null,
        sizeBytes: null,
        currentVersion: 1,
        tags: parseDocumentTags(dto.tags),
        isConfidential: dto.isConfidential ?? false,
        uploadedById: actor.id ?? null,
      })
      .returning();

    if (!created) {
      throw new BadRequestException('Failed to create document reference');
    }

    await this.activityService.createEvent({
      module: ACTIVITY_MODULE,
      entityType: created.entityType,
      entityId: created.entityId,
      eventType: 'DOCUMENT_EXTERNAL_REFERENCE_CREATED',
      description: `Added external reference ${url.value.host} for ${created.entityType}`,
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: {
        documentId: created.id,
        title: created.title,
        externalUrl: url.value.url,
        externalUrlHost: url.value.host,
        documentType,
      },
      userId: actor.id,
      userEmail: actor.email,
    });

    await this.auditService.record({
      action: 'DOCUMENT_EXTERNAL_REFERENCE_CREATE',
      category: ACTIVITY_MODULE,
      userId: actor.id,
      userEmail: actor.email,
      details: {
        documentId: created.id,
        externalUrl: url.value.url,
        entityType: created.entityType,
        entityId: created.entityId,
        documentType,
      },
    });

    return this.toRecord(created);
  }

  async getEntityDocuments(
    entityType: string,
    entityId: string,
  ): Promise<DocumentationRecord[]> {
    if (!isSupportedDocumentEntityType(entityType)) {
      throw new BadRequestException(
        `Unsupported entity type "${entityType}". Supported: ${SUPPORTED_DOCUMENT_ENTITY_TYPES.join(', ')}.`,
      );
    }

    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.entityType, entityType),
          eq(documents.entityId, entityId),
        ),
      )
      .orderBy(desc(documents.createdAt));

    return rows.map((row) => this.toRecord(row));
  }

  async getDocument(id: string): Promise<DocumentationRecord> {
    return this.toRecord(await this.getDocumentRow(id));
  }

  async getDocumentVersions(id: string) {
    const document = await this.getDocumentRow(id);

    if (readDocumentSourceType(document.sourceType) !== 'UPLOADED_FILE') {
      // An external reference has no bytes and therefore no revisions. This is
      // an empty result rather than an error so callers can render uniformly.
      return [];
    }

    return db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.versionNumber));
  }

  /**
   * Resolves the bytes to serve for a download or preview.
   *
   * `version` selects a historical revision; without it the current file is
   * returned. External references are refused: they must be opened at their own
   * location rather than proxied through Ananya.
   */
  async resolveFileContent(
    id: string,
    version?: number,
  ): Promise<DocumentFileContent> {
    const document = await this.getDocumentRow(id);

    if (readDocumentSourceType(document.sourceType) !== 'UPLOADED_FILE') {
      throw new BadRequestException(
        'This documentation entry is an external reference. Open it at its external URL instead of downloading it from Ananya.',
      );
    }

    let storageKey = document.storageKey;
    let fileName = document.fileName;
    let mimeType = document.mimeType;
    let sizeBytes = document.sizeBytes;

    if (version !== undefined) {
      const [revision] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, id),
            eq(documentVersions.versionNumber, version),
          ),
        )
        .limit(1);

      if (!revision) {
        throw new NotFoundException(
          `Version ${version} of document #${id} was not found`,
        );
      }

      storageKey = revision.storageKey;
      fileName = revision.fileName;
      mimeType = revision.mimeType;
      sizeBytes = revision.sizeBytes;
    }

    if (!storageKey) {
      throw new NotFoundException(
        `Document #${id} has no stored file. The record may predate file storage.`,
      );
    }

    try {
      const buffer = await this.storageService.readFile(storageKey);
      return {
        buffer,
        fileName: fileName ?? 'document',
        mimeType: mimeType ?? 'application/octet-stream',
        sizeBytes: sizeBytes ?? buffer.length,
      };
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) {
        this.logger.warn(
          `Document #${id} points at missing storage object "${storageKey}".`,
        );
        throw new NotFoundException(
          'The stored file for this document is no longer available on the server.',
        );
      }
      throw error;
    }
  }

  async createVersion(
    id: string,
    dto: CreateDocumentVersionDto,
    file: UploadedDocumentFile | undefined,
    actor: DocumentActor,
  ): Promise<DocumentationRecord> {
    const existing = await this.getDocumentRow(id);
    if (readDocumentSourceType(existing.sourceType) !== 'UPLOADED_FILE') {
      throw new ConflictException(
        'External references do not have file versions. Update the link instead.',
      );
    }

    const uploaded = this.validateUploadedFile(file);
    const fileName = sanitizeDocumentFileName(uploaded.originalname);
    const storageKey = buildDocumentStorageKey({
      entityType: existing.entityType,
      entityId: existing.entityId,
      uniqueSuffix: randomUUID(),
      fileName,
    });

    const stored = await this.storageService.storeFile(
      storageKey,
      uploaded.buffer,
    );

    try {
      const updated = await db.transaction(async (tx) => {
        // Serialises concurrent version creation for this document: the second
        // writer blocks here, then reads the version number the first one
        // committed, so numbering can never collide or skip.
        const [locked] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, id))
          .for('update');

        if (!locked) {
          throw new NotFoundException(`Document #${id} not found`);
        }

        const nextVersion = locked.currentVersion + 1;

        await tx.insert(documentVersions).values({
          documentId: id,
          versionNumber: nextVersion,
          fileName,
          fileUrl: this.downloadPath(id, nextVersion),
          storageKey: stored.storageKey,
          mimeType: uploaded.mimeType,
          sizeBytes: stored.sizeBytes,
          changelog:
            parseOptionalText(dto.changelog) ??
            `Updated to version ${nextVersion}`,
          uploadedById: actor.id ?? null,
        });

        const [row] = await tx
          .update(documents)
          .set({
            fileName,
            fileUrl: this.downloadPath(id),
            storageKey: stored.storageKey,
            mimeType: uploaded.mimeType,
            sizeBytes: stored.sizeBytes,
            currentVersion: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, id))
          .returning();

        return row;
      });

      if (!updated) {
        throw new NotFoundException(`Document #${id} not found`);
      }

      await this.activityService.createEvent({
        module: ACTIVITY_MODULE,
        entityType: updated.entityType,
        entityId: updated.entityId,
        eventType: 'DOCUMENT_VERSION_CREATED',
        description: `Created version v${updated.currentVersion} for ${fileName}`,
        severity: 'INFO',
        status: 'COMPLETED',
        metadata: {
          documentId: updated.id,
          version: updated.currentVersion,
          previousVersion: updated.currentVersion - 1,
          fileName,
        },
        userId: actor.id,
        userEmail: actor.email,
      });

      await this.auditService.record({
        action: 'DOCUMENT_VERSION_CREATE',
        category: ACTIVITY_MODULE,
        userId: actor.id,
        userEmail: actor.email,
        details: {
          documentId: updated.id,
          version: updated.currentVersion,
          fileName,
        },
      });

      return this.toRecord(updated);
    } catch (error) {
      await this.removeStoredFile(stored.storageKey);
      throw error;
    }
  }

  async updateMetadata(
    id: string,
    dto: UpdateDocumentMetadataDto,
    actor: DocumentActor,
  ): Promise<DocumentationRecord> {
    const existing = await this.getDocumentRow(id);

    const changes: Record<string, unknown> = { updatedAt: new Date() };

    if (dto.title !== undefined) {
      const title = parseOptionalText(dto.title);
      if (!title) {
        throw new BadRequestException('Title cannot be empty.');
      }
      changes.title = title;
    }

    if (dto.description !== undefined) {
      changes.description = parseOptionalText(dto.description) ?? null;
    }

    if (dto.documentType !== undefined) {
      changes.documentType = this.requireDocumentType(dto.documentType);
    }

    if (dto.tags !== undefined) {
      changes.tags = parseDocumentTags(dto.tags);
    }

    if (dto.isConfidential !== undefined) {
      changes.isConfidential = dto.isConfidential;
    }

    if (dto.externalUrl !== undefined) {
      if (readDocumentSourceType(existing.sourceType) !== 'EXTERNAL_URL') {
        throw new BadRequestException(
          'Only external references have a link to update. Uploaded files are replaced by uploading a new version.',
        );
      }
      const url = validateExternalUrl(dto.externalUrl);
      if (!url.ok) {
        throw new BadRequestException(url.message);
      }
      changes.externalUrl = url.value.url;
    }

    const [updated] = await db
      .update(documents)
      .set(changes)
      .where(eq(documents.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Document #${id} not found`);
    }

    const changedFields = Object.keys(changes).filter(
      (key) => key !== 'updatedAt',
    );

    await this.activityService.createEvent({
      module: ACTIVITY_MODULE,
      entityType: updated.entityType,
      entityId: updated.entityId,
      eventType: 'DOCUMENT_UPDATED',
      description: `Updated documentation ${updated.title}`,
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: {
        documentId: updated.id,
        changedFields,
        documentType: readDocumentType(updated.documentType),
      },
      userId: actor.id,
      userEmail: actor.email,
    });

    await this.auditService.record({
      action: 'DOCUMENT_METADATA_UPDATE',
      category: ACTIVITY_MODULE,
      userId: actor.id,
      userEmail: actor.email,
      details: { documentId: updated.id, changedFields },
    });

    return this.toRecord(updated);
  }

  /**
   * Deletes a documentation record.
   *
   * Storage objects are removed **before** the database row so a failure can
   * never leave an untracked file behind. If the row deletion then fails, the
   * record is still visible and the deletion can simply be retried — removing
   * an already-absent object is a no-op.
   *
   * Revision rows are removed by the `document_versions` foreign key cascade,
   * so no orphaned versions survive their document. Historical activity and
   * security-audit entries are deliberately preserved.
   */
  async deleteDocument(
    id: string,
    actor: DocumentActor,
  ): Promise<{ success: true; id: string }> {
    const existing = await this.getDocumentRow(id);

    const storageKeys = await this.collectStorageKeys(id);
    for (const key of storageKeys) {
      await this.storageService.deleteFile(key);
    }

    await db.delete(documents).where(eq(documents.id, id));

    await this.activityService.createEvent({
      module: ACTIVITY_MODULE,
      entityType: existing.entityType,
      entityId: existing.entityId,
      eventType: 'DOCUMENT_DELETED',
      description: `Deleted document ${existing.title}`,
      severity: 'WARN',
      status: 'COMPLETED',
      metadata: {
        documentId: id,
        title: existing.title,
        sourceType: readDocumentSourceType(existing.sourceType),
        removedObjects: storageKeys.length,
      },
      userId: actor.id,
      userEmail: actor.email,
    });

    await this.auditService.record({
      action: 'DOCUMENT_DELETE',
      category: ACTIVITY_MODULE,
      userId: actor.id,
      userEmail: actor.email,
      details: {
        documentId: id,
        title: existing.title,
        entityType: existing.entityType,
        entityId: existing.entityId,
        removedObjects: storageKeys.length,
      },
    });

    return { success: true, id };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async getDocumentRow(id: string) {
    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Document #${id} not found`);
    }

    return row;
  }

  /** Every storage object belonging to a document, including revisions. */
  private async collectStorageKeys(id: string): Promise<string[]> {
    const keys: string[] = [];

    const [current] = await db
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    if (current?.storageKey) keys.push(current.storageKey);

    const revisions = await db
      .select({ storageKey: documentVersions.storageKey })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id));
    for (const revision of revisions) {
      if (revision.storageKey) keys.push(revision.storageKey);
    }

    return Array.from(new Set(keys));
  }

  private validateUploadedFile(file: UploadedDocumentFile | undefined): {
    originalname: string;
    buffer: Buffer;
    size: number;
    mimeType: string;
  } {
    if (!file || !file.buffer) {
      throw new BadRequestException(
        'A file is required. Send it as multipart/form-data under the "file" field.',
      );
    }

    const size = file.size ?? file.buffer.length;
    if (size <= 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    if (size > MAX_DOCUMENT_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds the maximum upload size of ${formatDocumentBytes(MAX_DOCUMENT_UPLOAD_BYTES)}.`,
      );
    }

    const mime = resolveDocumentMimeType(file.originalname, file.mimetype);
    if (!mime.ok) {
      throw new BadRequestException(mime.message);
    }

    return {
      originalname: file.originalname,
      buffer: file.buffer,
      size,
      mimeType: mime.mimeType,
    };
  }

  /**
   * Confirms the documented record exists, so documentation cannot be orphaned.
   *
   * Existence only: whether the entity is retired for *operational* activity is
   * a different rule owned by the component lifecycle guard, and filing
   * documentation is not an inventory transaction.
   */
  private async assertEntityExists(
    entityType: string,
    entityId: string,
  ): Promise<void> {
    if (!isSupportedDocumentEntityType(entityType)) {
      throw new BadRequestException(
        `Unsupported entity type "${entityType}". Supported: ${SUPPORTED_DOCUMENT_ENTITY_TYPES.join(', ')}.`,
      );
    }

    if (entityType === COMPONENT_DOCUMENT_ENTITY_TYPE) {
      const [component] = await db
        .select({ id: components.id })
        .from(components)
        .where(eq(components.id, entityId))
        .limit(1);

      if (!component) {
        throw new NotFoundException(`Component #${entityId} not found`);
      }
    }
  }

  private requireDocumentType(value: unknown): DocumentType {
    const type = normalizeDocumentType(value);
    if (!type) {
      throw new BadRequestException('A valid document type is required.');
    }
    return type;
  }

  /** Falls back to a readable default so a record is never untitled. */
  private resolveTitle(title: unknown, fallback: string): string {
    const provided = parseOptionalText(title);
    if (provided) return provided.slice(0, 255);

    const withoutExtension = fallback.replace(/\.[a-z0-9_]{1,16}$/i, '');
    const candidate =
      withoutExtension.trim().length > 0 ? withoutExtension.trim() : fallback;
    return candidate.slice(0, 255);
  }

  private downloadPath(documentId: string, version?: number): string {
    return version === undefined
      ? `/documents/${documentId}/download`
      : `/documents/${documentId}/download?version=${version}`;
  }

  private async removeStoredFile(storageKey: string): Promise<void> {
    try {
      await this.storageService.deleteFile(storageKey);
    } catch (error) {
      // Cleanup failure must not mask the original error.
      this.logger.error(
        `Failed to clean up stored file "${storageKey}" after an error: ${String(error)}`,
      );
    }
  }

  private toRecord(row: {
    id: string;
    entityType: string;
    entityId: string;
    documentType: string | null;
    sourceType: string;
    title: string;
    description: string | null;
    externalUrl: string | null;
    fileName: string | null;
    fileUrl: string | null;
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    currentVersion: number;
    tags: string[] | null;
    isConfidential: boolean;
    uploadedById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): DocumentationRecord {
    const sourceType = readDocumentSourceType(row.sourceType);
    const isUploadedFile = sourceType === 'UPLOADED_FILE';

    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      documentType: readDocumentType(row.documentType),
      sourceType,
      title: row.title,
      description: row.description,
      tags: row.tags ?? [],
      isConfidential: row.isConfidential,
      externalUrl: row.externalUrl,
      externalUrlHost: externalUrlHost(row.externalUrl),
      fileName: isUploadedFile ? row.fileName : null,
      fileUrl: row.fileUrl,
      mimeType: isUploadedFile ? row.mimeType : null,
      sizeBytes: isUploadedFile ? row.sizeBytes : null,
      currentVersion: row.currentVersion,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      downloadPath: isUploadedFile ? this.downloadPath(row.id) : null,
      previewPath: isUploadedFile ? `/documents/${row.id}/preview` : null,
    };
  }
}
