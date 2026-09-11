import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  RejectUserInput,
  UpdateOwnProfileInput,
  UserRole,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  rejectUserSchema,
  updateOwnProfileSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditorAllowed } from '../../common/decorators/auditor-allowed.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AuditorAllowed()
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findMe(userId);
  }

  @AuditorAllowed()
  @Patch('me')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateOwnProfileSchema))
    body: UpdateOwnProfileInput,
  ) {
    return this.usersService.updateOwnProfile(userId, body);
  }

  // RISK-015: also readable by Auditor - needed for the Reports page's
  // employee filter dropdown; still just a name/role/department list, no
  // write access to any of it.
  @Roles(UserRole.ADMINISTRATOR, UserRole.AUDITOR)
  @AuditorAllowed()
  @Get()
  list(
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.list({ status, role, departmentId, search });
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(adminCreateUserSchema))
    body: AdminCreateUserInput,
  ) {
    return this.usersService.adminCreate(actor.id, body);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateUserSchema))
    body: AdminUpdateUserInput,
  ) {
    return this.usersService.adminUpdate(actor.id, id, body);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/approve')
  approve(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.approve(actor.id, id);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/reject')
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectUserSchema)) body: RejectUserInput,
  ) {
    return this.usersService.reject(actor.id, id, body);
  }
}
