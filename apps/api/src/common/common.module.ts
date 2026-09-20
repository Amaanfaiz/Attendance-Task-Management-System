import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { EmailService } from './services/email.service';
import { BlobStorageService } from './services/blob-storage.service';

@Global()
@Module({
  providers: [AuditService, EmailService, BlobStorageService],
  exports: [AuditService, EmailService, BlobStorageService],
})
export class CommonModule {}
