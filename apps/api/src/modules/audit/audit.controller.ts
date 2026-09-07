import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@atms/shared';
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
    return this.prisma.auditLog.findMany({
      where: {
        actorId,
        action,
        createdAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
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
