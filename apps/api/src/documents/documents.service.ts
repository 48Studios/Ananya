import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '@ananya/database';
import { documents, documentVersions } from '@ananya/database/schema';
import { eq, and, desc } from '@ananya/database/query';
import { StorageService } from './storage.service';
import { ActivityService } from '../activity/activity.service';
import { SecurityAuditService } from '../security-audit/security-audit.service';
import {
  UploadDocumentDto,
  CreateDocumentVersionDto,
  UpdateDocumentMetadataDto,
} from './dtos';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly storageService: StorageService,
    private readonly activityService: ActivityService,
    private readonly auditService: SecurityAuditService,
  ) {}

  async uploadDocument(dto: UploadDocumentDto, userId?: string) {
    if (dto.sizeBytes > 50 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds maximum 50MB limit');
    }

    if (dto.mimeType && !ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw new BadRequestException(`Unsupported MIME type: ${dto.mimeType}`);
    }

    const storageKey = `${dto.entityType}_${dto.entityId}_${Date.now()}_${dto.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const fileBuffer = Buffer.from(dto.fileContent, 'base64');
    const fileUrl = await this.storageService.storeFile(storageKey, fileBuffer);

    const [doc] = await db
      .insert(documents)
      .values({
        entityType: dto.entityType,
        entityId: dto.entityId,
        title: dto.title,
        description: dto.description || '',
        fileName: dto.fileName,
        fileUrl,
        storageKey,
        mimeType: dto.mimeType || 'application/octet-stream',
        sizeBytes: dto.sizeBytes || fileBuffer.length,
        currentVersion: 1,
        tags: dto.tags || [],
        isConfidential: dto.isConfidential || false,
        uploadedById: userId || null,
      })
      .returning();

    if (!doc) {
      throw new BadRequestException('Failed to create document record');
    }

    // Save Initial Version (v1)
    await db.insert(documentVersions).values({
      documentId: doc.id,
      versionNumber: 1,
      fileName: dto.fileName,
      fileUrl,
      storageKey,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      changelog: 'Initial upload (v1)',
      uploadedById: userId || null,
    });

    // Record Activity
    await this.activityService.createEvent({
      module: 'Documents',
      entityType: dto.entityType,
      entityId: dto.entityId,
      eventType: 'DOCUMENT_UPLOADED',
      description: `Uploaded document ${dto.fileName} for ${dto.entityType}`,
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: {
        documentId: doc.id,
        fileName: dto.fileName,
        title: dto.title,
      },
      userId,
    });

    // Record Audit
    await this.auditService.record({
      action: 'DOCUMENT_UPLOAD',
      category: 'Documents',
      userId,
      details: {
        documentId: doc.id,
        fileName: dto.fileName,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
    });

    return doc;
  }

  async getEntityDocuments(entityType: string, entityId: string) {
    return db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.entityType, entityType),
          eq(documents.entityId, entityId),
        ),
      )
      .orderBy(desc(documents.createdAt));
  }

  async getDocument(id: string) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) {
      throw new NotFoundException(`Document #${id} not found`);
    }
    return doc;
  }

  async createVersion(
    id: string,
    dto: CreateDocumentVersionDto,
    userId?: string,
  ) {
    const doc = await this.getDocument(id);
    const newVersionNum = doc.currentVersion + 1;

    const storageKey = `${doc.entityType}_${doc.entityId}_v${newVersionNum}_${Date.now()}_${dto.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const fileBuffer = Buffer.from(dto.fileContent, 'base64');
    const fileUrl = await this.storageService.storeFile(storageKey, fileBuffer);

    // Save Version Record
    await db.insert(documentVersions).values({
      documentId: doc.id,
      versionNumber: newVersionNum,
      fileName: dto.fileName,
      fileUrl,
      storageKey,
      mimeType: dto.mimeType || doc.mimeType,
      sizeBytes: dto.sizeBytes || fileBuffer.length,
      changelog: dto.changelog || `Updated to version ${newVersionNum}`,
      uploadedById: userId || null,
    });

    // Update Master Document Record
    const [updatedDoc] = await db
      .update(documents)
      .set({
        fileName: dto.fileName,
        fileUrl,
        storageKey,
        mimeType: dto.mimeType || doc.mimeType,
        sizeBytes: dto.sizeBytes || fileBuffer.length,
        currentVersion: newVersionNum,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id))
      .returning();

    // Record Activity & Audit
    await this.activityService.createEvent({
      module: 'Documents',
      entityType: doc.entityType,
      entityId: doc.entityId,
      eventType: 'DOCUMENT_VERSION_CREATED',
      description: `Created version v${newVersionNum} for ${dto.fileName}`,
      severity: 'INFO',
      status: 'COMPLETED',
      metadata: {
        documentId: doc.id,
        version: newVersionNum,
        fileName: dto.fileName,
      },
      userId,
    });

    return updatedDoc;
  }

  async getDocumentVersions(id: string) {
    await this.getDocument(id);
    return db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.versionNumber));
  }

  async updateMetadata(
    id: string,
    dto: UpdateDocumentMetadataDto,
    userId?: string,
  ) {
    const doc = await this.getDocument(id);

    const [updated] = await db
      .update(documents)
      .set({
        title: dto.title !== undefined ? dto.title : doc.title,
        description:
          dto.description !== undefined ? dto.description : doc.description,
        tags: dto.tags !== undefined ? dto.tags : doc.tags,
        isConfidential:
          dto.isConfidential !== undefined
            ? dto.isConfidential
            : doc.isConfidential,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, id))
      .returning();

    await this.auditService.record({
      action: 'DOCUMENT_METADATA_UPDATE',
      category: 'Documents',
      userId,
      details: { documentId: doc.id, fileName: doc.fileName },
    });

    return updated;
  }

  async deleteDocument(id: string, userId?: string) {
    const doc = await this.getDocument(id);
    await this.storageService.deleteFile(doc.storageKey);
    await db.delete(documents).where(eq(documents.id, id));

    await this.activityService.createEvent({
      module: 'Documents',
      entityType: doc.entityType,
      entityId: doc.entityId,
      eventType: 'DOCUMENT_DELETED',
      description: `Deleted document ${doc.fileName}`,
      severity: 'WARN',
      status: 'COMPLETED',
      metadata: { documentId: doc.id, fileName: doc.fileName },
      userId,
    });

    return { success: true, id };
  }
}
