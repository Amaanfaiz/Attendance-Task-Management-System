import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [ReconciliationModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
