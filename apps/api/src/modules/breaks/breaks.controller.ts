import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BreaksService } from './breaks.service';

@ApiTags('breaks')
@Controller('breaks')
export class BreaksController {
  constructor(private readonly breaksService: BreaksService) {}

  @Post('start')
  @HttpCode(200)
  start(@CurrentUser('id') userId: string) {
    return this.breaksService.startBreak(userId);
  }

  @Post('end')
  @HttpCode(200)
  end(@CurrentUser('id') userId: string) {
    return this.breaksService.endBreak(userId);
  }
}
