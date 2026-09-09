import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';
import { EmailService } from './services/email.service';

@Global()
@Module({
  providers: [AuditService, EmailService],
  exports: [AuditService, EmailService],
})
export class CommonModule {}
