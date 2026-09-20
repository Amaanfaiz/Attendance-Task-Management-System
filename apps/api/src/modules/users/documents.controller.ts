import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole, uploadDocumentMetadataSchema } from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DocumentsService } from './documents.service';

// EP-013: self-or-admin on list/upload/download, admin-only on delete. No
// @AuditorAllowed() anywhere - AuditorScopeGuard default-denies AUDITOR on
// every route below.
@ApiTags('documents')
@Controller('users/:id/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.documentsService.list(
      actor.id,
      id,
      actor.role === UserRole.ADMINISTRATOR,
    );
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async upload(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const { type } = new ZodValidationPipe(uploadDocumentMetadataSchema).transform(
      body,
    );
    return this.documentsService.upload(
      actor.id,
      id,
      actor.role === UserRole.ADMINISTRATOR,
      type,
      file,
    );
  }

  @Get(':documentId/download')
  async download(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { document, stream } = await this.documentsService.download(
      actor.id,
      id,
      actor.role === UserRole.ADMINISTRATOR,
      documentId,
    );
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.fileName.replace(/"/g, '')}"`,
    );
    stream.pipe(res);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Delete(':documentId')
  remove(
    @CurrentUser('id') actorId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.remove(actorId, documentId);
  }
}
