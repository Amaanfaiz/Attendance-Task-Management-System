import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateDepartmentInput,
  UserRole,
  createDepartmentSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditorAllowed } from '../../common/decorators/auditor-allowed.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  // No @Roles() - any authenticated user can already read this (it's just
  // department names for a filter dropdown, no sensitive data). Still needs
  // @AuditorAllowed() explicitly, since AuditorScopeGuard default-denies
  // AUDITOR on every route not marked, regardless of @Roles() being absent.
  @AuditorAllowed()
  @Get()
  list() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post()
  @UsePipes(new ZodValidationPipe(createDepartmentSchema))
  create(@Body() body: CreateDepartmentInput) {
    return this.prisma.department.create({ data: body });
  }
}
