import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateDepartmentInput,
  UserRole,
  createDepartmentSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

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
