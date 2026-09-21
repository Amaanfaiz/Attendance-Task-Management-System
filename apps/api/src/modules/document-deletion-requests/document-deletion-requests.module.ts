import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { DocumentDeletionRequestsController } from './document-deletion-requests.controller';
import { DocumentDeletionRequestsService } from './document-deletion-requests.service';

@Module({
  imports: [UsersModule], // for DocumentsService, reused by decide()'s approve path
  controllers: [DocumentDeletionRequestsController],
  providers: [DocumentDeletionRequestsService],
})
export class DocumentDeletionRequestsModule {}
