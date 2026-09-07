import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

/** AC-009-005-01: every material action is captured with actor, action, timestamp, object and change details. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        beforeJson: entry.before as never,
        afterJson: entry.after as never,
        metadataJson: entry.metadata as never,
      },
    });
  }
}
