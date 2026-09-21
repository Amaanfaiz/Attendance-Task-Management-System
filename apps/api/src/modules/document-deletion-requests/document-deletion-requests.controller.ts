import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  DecideDocumentDeletionInput,
  UserRole,
  decideDocumentDeletionSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DocumentDeletionRequestsService } from './document-deletion-requests.service';

// Admin-only review queue for employee-requested document deletions - the
// employee-facing "request" endpoint itself lives on DocumentsController,
// next to the rest of the document routes. No @AuditorAllowed() anywhere
// here - AuditorScopeGuard default-denies the AUDITOR role on every route
// below.
@ApiTags('document-deletion-requests')
@Controller('document-deletion-requests')
export class DocumentDeletionRequestsController {
  constructor(
    private readonly documentDeletionRequestsService: DocumentDeletionRequestsService,
  ) {}

  @Roles(UserRole.ADMINISTRATOR)
  @Get('pending')
  listPending() {
    return this.documentDeletionRequestsService.listPending();
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/decide')
  decide(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decideDocumentDeletionSchema))
    body: DecideDocumentDeletionInput,
  ) {
    return this.documentDeletionRequestsService.decide(actorId, id, body);
  }
}
