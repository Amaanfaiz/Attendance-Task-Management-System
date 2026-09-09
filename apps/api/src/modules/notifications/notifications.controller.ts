import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.notificationsService.listForUser(userId);
  }

  @Patch(':id/read')
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationsService.markRead(userId, id);
  }
}
