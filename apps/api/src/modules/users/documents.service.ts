import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AuditAction,
  DocumentType,
  DocumentDeletionStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { BlobStorageService } from '../../common/services/blob-storage.service';

// Checked together (defense in depth against a renamed executable declaring a
// false mimetype) - anything outside this pair for a given extension is
// rejected before touching blob storage.
const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

function assertAllowedFile(fileName: string, mimeType: string): void {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  const allowedExts = ALLOWED_TYPES[mimeType];
  if (!allowedExts || !allowedExts.includes(ext)) {
    throw new BadRequestException(
      'Only PDF, JPEG or PNG files are accepted for document uploads',
    );
  }
}

// Blob path names can't contain characters like /, \, or control characters -
// a document's own original filename is untrusted input, so it's sanitized
// before becoming part of the path rather than trusted as-is.
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-150);
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  private assertCanAct(actorId: string, userId: string, canActAny: boolean) {
    if (!canActAny && actorId !== userId) {
      throw new ForbiddenException("Not this user's documents");
    }
  }

  // Append-only: a re-upload is always a fresh row/blob, never an overwrite of
  // an existing one - real compliance value for UK right-to-work/visa
  // documents needing periodic re-verification (history is the point).
  async upload(
    actorId: string,
    userId: string,
    canActAny: boolean,
    type: DocumentType,
    file: Express.Multer.File,
  ) {
    this.assertCanAct(actorId, userId, canActAny);
    assertAllowedFile(file.originalname, file.mimetype);

    const documentId = randomUUID();
    const safeName = sanitizeFileName(file.originalname);
    const blobPath = `documents/${userId}/${documentId}/${safeName}`;
    await this.blobStorage.upload(blobPath, file.buffer, file.mimetype);

    const document = await this.prisma.document.create({
      data: {
        id: documentId,
        userId,
        type,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        blobPath,
        uploadedById: actorId,
      },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.DOCUMENT_UPLOADED,
      targetType: 'Document',
      targetId: document.id,
      metadata: { userId, type, fileName: file.originalname },
    });
    return document;
  }

  async list(actorId: string, userId: string, canActAny: boolean) {
    this.assertCanAct(actorId, userId, canActAny);
    const documents = await this.prisma.document.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        type: true,
        fileName: true,
        mimeType: true,
        fileSizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { id: true, firstName: true, surname: true } },
        deletionRequests: {
          where: { status: DocumentDeletionStatus.PENDING },
          select: { id: true, reason: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Prisma returns the relation as an array even though at most one PENDING
    // request can exist per document (enforced in requestDeletion below) -
    // collapsed to a single object here so the frontend doesn't have to.
    return documents.map(({ deletionRequests, ...doc }) => ({
      ...doc,
      pendingDeletionRequest: deletionRequests[0] ?? null,
    }));
  }

  // Self-only - an admin already has direct delete and doesn't need to
  // request. Owner is checked against the document's userId (not
  // uploadedById), matching assertCanAct's convention - an admin may have
  // uploaded on the employee's behalf, and the employee should still be able
  // to request its removal.
  async requestDeletion(actorId: string, documentId: string, reason: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (document.userId !== actorId) {
      throw new ForbiddenException("Not this user's documents");
    }

    const existingPending = await this.prisma.documentDeletionRequest.findFirst(
      {
        where: { documentId, status: DocumentDeletionStatus.PENDING },
      },
    );
    if (existingPending) {
      throw new BadRequestException(
        'A deletion request is already pending for this document',
      );
    }

    const request = await this.prisma.documentDeletionRequest.create({
      data: { documentId, requestedById: actorId, reason },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.DOCUMENT_DELETION_REQUESTED,
      targetType: 'Document',
      targetId: document.id,
      metadata: { userId: document.userId, fileName: document.fileName },
    });
    return request;
  }

  // Every access to a passport/eVisa/NI-number scan is security-relevant, not
  // just every write - audited the same as the upload itself.
  async download(
    actorId: string,
    userId: string,
    canActAny: boolean,
    documentId: string,
  ) {
    this.assertCanAct(actorId, userId, canActAny);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId, deletedAt: null },
    });
    if (!document) throw new NotFoundException('Document not found');

    const stream = await this.blobStorage.download(document.blobPath);
    await this.audit.record({
      actorId,
      action: AuditAction.DOCUMENT_DOWNLOADED,
      targetType: 'Document',
      targetId: document.id,
      metadata: { userId, type: document.type, fileName: document.fileName },
    });
    return { document, stream };
  }

  // Admin-only (enforced by the controller's @Roles guard, not this method) -
  // preserves compliance-document integrity: an employee can add a
  // replacement via a new upload but can't remove history themselves. Soft
  // delete keeps the row (and its audit trail) - this app never hard-deletes
  // anywhere - but the underlying blob bytes ARE purged immediately, so
  // sensitive file content doesn't linger past an explicit admin delete.
  async remove(actorId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!document) throw new NotFoundException('Document not found');

    await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    await this.blobStorage.delete(document.blobPath);
    await this.audit.record({
      actorId,
      action: AuditAction.DOCUMENT_DELETED,
      targetType: 'Document',
      targetId: document.id,
      before: { fileName: document.fileName, type: document.type },
      metadata: { userId: document.userId },
    });

    // A direct admin delete can bypass a pending deletion request entirely -
    // resolve it here so it never sits PENDING forever pointing at a document
    // that no longer exists. Harmless if decide() below also updates the same
    // row right after (approving through the review queue calls remove()
    // internally too) - decide() overwrites this with the real decidedById.
    await this.prisma.documentDeletionRequest.updateMany({
      where: { documentId, status: DocumentDeletionStatus.PENDING },
      data: {
        status: DocumentDeletionStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
        decisionComment: 'Resolved via direct admin deletion',
      },
    });
  }
}
