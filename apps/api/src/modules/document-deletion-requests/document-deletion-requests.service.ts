import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  DecideDocumentDeletionInput,
  DocumentDeletionStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { DocumentsService } from '../users/documents.service';

@Injectable()
export class DocumentDeletionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly documentsService: DocumentsService,
  ) {}

  // No current-vs-proposed diff needed here, unlike profile changes - this is
  // just "delete this file, yes/no", so the document's identity and the
  // employee's stated reason is all a reviewer needs.
  listPending() {
    return this.prisma.documentDeletionRequest.findMany({
      where: { status: DocumentDeletionStatus.PENDING },
      include: {
        document: {
          select: { id: true, fileName: true, type: true, userId: true },
        },
        requestedBy: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async decide(
    actorId: string,
    requestId: string,
    input: DecideDocumentDeletionInput,
  ) {
    const request = await this.prisma.documentDeletionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Document deletion request not found');
    }
    if (request.status !== DocumentDeletionStatus.PENDING) {
      throw new BadRequestException('This request has already been decided');
    }

    if (!input.approve) {
      const rejected = await this.prisma.documentDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: DocumentDeletionStatus.REJECTED,
          decidedById: actorId,
          decidedAt: new Date(),
          decisionComment: input.comment,
        },
      });
      await this.audit.record({
        actorId,
        action: AuditAction.DOCUMENT_DELETION_REJECTED,
        targetType: 'Document',
        targetId: request.documentId,
        metadata: {
          documentDeletionRequestId: request.id,
          comment: input.comment,
        },
      });
      return rejected;
    }

    // Reuses the existing soft-delete + blob-purge + DOCUMENT_DELETED audit
    // logic as-is, rather than duplicating it. That method's own
    // orphan-resolution step will also flip this same row to APPROVED first -
    // harmless, since it's immediately overwritten below with the real
    // decidedById/comment from this decision.
    await this.documentsService.remove(actorId, request.documentId);

    const approved = await this.prisma.documentDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: DocumentDeletionStatus.APPROVED,
        decidedById: actorId,
        decidedAt: new Date(),
        decisionComment: input.comment,
      },
    });
    await this.audit.record({
      actorId,
      action: AuditAction.DOCUMENT_DELETION_APPROVED,
      targetType: 'Document',
      targetId: request.documentId,
      metadata: { documentDeletionRequestId: request.id },
    });
    return approved;
  }
}
