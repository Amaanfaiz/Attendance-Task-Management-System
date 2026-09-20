import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AdminDirectProfileUpdateInput,
  DecideProfileChangeInput,
  RequestProfileChangeInput,
  UserRole,
  adminDirectProfileUpdateSchema,
  decideProfileChangeSchema,
  requestProfileChangeSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProfileChangesService } from './profile-changes.service';

// EP-012: request/pending/decide/direct mirrors corrections.controller.ts's
// route shape exactly. No @AuditorAllowed() anywhere here - AuditorScopeGuard
// default-denies the AUDITOR role on every route below.
@ApiTags('profile-changes')
@Controller('profile-changes')
export class ProfileChangesController {
  constructor(private readonly profileChangesService: ProfileChangesService) {}

  @Post()
  request(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(requestProfileChangeSchema))
    body: RequestProfileChangeInput,
  ) {
    return this.profileChangesService.request(userId, body);
  }

  @Get('mine')
  listMine(@CurrentUser('id') userId: string) {
    return this.profileChangesService.listMine(userId);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Get('pending')
  listPending() {
    return this.profileChangesService.listPending();
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/decide')
  decide(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decideProfileChangeSchema))
    body: DecideProfileChangeInput,
  ) {
    return this.profileChangesService.decide(actor.id, id, body);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post('direct')
  directUpdate(
    @CurrentUser('id') actorId: string,
    @Body(new ZodValidationPipe(adminDirectProfileUpdateSchema))
    body: AdminDirectProfileUpdateInput,
  ) {
    return this.profileChangesService.adminDirectUpdate(actorId, body);
  }
}
