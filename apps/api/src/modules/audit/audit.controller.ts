import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole, getUtcDayRange } from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  // AC-009-005-02/03: administrator-only, filterable by user/date/action.
  @Roles(UserRole.ADMINISTRATOR)
  @Get()
  list(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // `to` must include the whole of its calendar day, not just its 00:00 UTC
    // instant - same bug class as attendance.service.ts's getMyHistory, found
    // live via AC testing (from=to=today returned zero attendance records).
    return this.prisma.auditLog.findMany({
      where: {
        actorId,
        action,
        createdAt: {
          gte: from ? getUtcDayRange(from).start : undefined,
          lte: to ? new Date(getUtcDayRange(to).end.getTime() - 1) : undefined,
        },
      },
      include: {
        actor: {
          select: { id: true, firstName: true, surname: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
}
