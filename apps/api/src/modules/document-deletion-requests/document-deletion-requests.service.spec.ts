import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditAction, DocumentDeletionStatus } from '@atms/shared';
import { DocumentDeletionRequestsService } from './document-deletion-requests.service';

describe('DocumentDeletionRequestsService', () => {
  const baseRequest = {
    id: 'req-1',
    documentId: 'doc-1',
    requestedById: 'employee-1',
    reason: 'Wrong file uploaded',
    status: DocumentDeletionStatus.PENDING,
    decidedById: null,
    decidedAt: null,
    decisionComment: null,
    createdAt: new Date(),
  };

  function buildService(overrides: { findUnique?: unknown } = {}) {
    const prisma = {
      documentDeletionRequest: {
        findMany: jest.fn(),
        findUnique:
          overrides.findUnique !== undefined
            ? jest.fn().mockResolvedValue(overrides.findUnique)
            : jest.fn().mockResolvedValue(baseRequest),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...baseRequest,
          ...data,
        })),
      },
    };
    const audit = { record: jest.fn() };
    const documentsService = { remove: jest.fn() };

    const service = new DocumentDeletionRequestsService(
      prisma as never,
      audit as never,
      documentsService as never,
    );
    return { service, prisma, audit, documentsService };
  }

  it('rejects a request without touching the document', async () => {
    const { service, audit, documentsService } = buildService();

    const result = await service.decide('admin-1', 'req-1', {
      approve: false,
      comment: 'Keep it, still needed',
    });

    expect(result.status).toBe(DocumentDeletionStatus.REJECTED);
    expect(documentsService.remove).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DOCUMENT_DELETION_REJECTED,
        targetId: 'doc-1',
      }),
    );
  });

  it('approves a request by delegating to DocumentsService.remove and marking it APPROVED', async () => {
    const { service, audit, documentsService } = buildService();

    const result = await service.decide('admin-1', 'req-1', {
      approve: true,
      comment: 'Confirmed with employee',
    });

    expect(documentsService.remove).toHaveBeenCalledWith('admin-1', 'doc-1');
    expect(result.status).toBe(DocumentDeletionStatus.APPROVED);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DOCUMENT_DELETION_APPROVED,
        targetId: 'doc-1',
      }),
    );
  });

  it('throws NotFoundException for a request id that does not exist', async () => {
    const { service } = buildService({ findUnique: null });

    await expect(
      service.decide('admin-1', 'missing', { approve: true }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the request was already decided', async () => {
    const { service } = buildService({
      findUnique: { ...baseRequest, status: DocumentDeletionStatus.APPROVED },
    });

    await expect(
      service.decide('admin-1', 'req-1', { approve: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists only PENDING requests, joined with document and requester details', async () => {
    const { service, prisma } = buildService();
    prisma.documentDeletionRequest.findMany.mockResolvedValue([baseRequest]);

    const result = await service.listPending();

    expect(prisma.documentDeletionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: DocumentDeletionStatus.PENDING },
      }),
    );
    expect(result).toEqual([baseRequest]);
  });
});
