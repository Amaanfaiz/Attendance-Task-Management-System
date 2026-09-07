import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  DecideCorrectionInput,
  RequestCorrectionInput,
  UserRole,
  decideCorrectionSchema,
  requestCorrectionSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CorrectionsService } from './corrections.service';

@ApiTags('corrections')
@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly correctionsService: CorrectionsService) {}

  @Post()
  request(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(requestCorrectionSchema)) body: RequestCorrectionInput,
  ) {
    return this.correctionsService.request(userId, body);
  }

  @Get('mine')
  listMine(@CurrentUser('id') userId: string) {
    return this.correctionsService.listMine(userId);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Get('pending')
  listPending() {
    return this.correctionsService.listPending();
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/decide')
  decide(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decideCorrectionSchema)) body: DecideCorrectionInput,
  ) {
    return this.correctionsService.decide(actor.id, id, body);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post('direct')
  directCorrection(
    @CurrentUser('id') actorId: string,
    @Body(new ZodValidationPipe(requestCorrectionSchema)) body: RequestCorrectionInput,
  ) {
    return this.correctionsService.adminDirectCorrection(actorId, body);
  }
}
