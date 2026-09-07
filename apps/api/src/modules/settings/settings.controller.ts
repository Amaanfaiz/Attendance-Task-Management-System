import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get() {
    return this.prisma.appSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Patch()
  update(
    @Body()
    body: Partial<{
      requireRegistrationApproval: boolean;
      employeesCanCreateTasks: boolean;
      sessionInactivityTimeoutMinutes: number;
      missingClockOutThresholdMinutes: number;
      longRunningTimerThresholdMinutes: number;
    }>,
  ) {
    return this.prisma.appSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...body },
      update: body,
    });
  }
}
