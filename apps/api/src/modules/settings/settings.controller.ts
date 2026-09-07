import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  UpdateAppSettingsInput,
  UserRole,
  updateAppSettingsSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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
    @Body(new ZodValidationPipe(updateAppSettingsSchema))
    body: UpdateAppSettingsInput,
  ) {
    return this.prisma.appSettings.upsert({
      where: { id: 'default' },
      create: { ...body, id: 'default' },
      update: body,
    });
  }
}
