import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('state')
  getState(@CurrentUser('id') userId: string) {
    return this.attendanceService.getCurrentState(userId);
  }

  @Post('clock-in')
  @HttpCode(200)
  clockIn(@CurrentUser('id') userId: string) {
    return this.attendanceService.clockIn(userId);
  }

  @Post('clock-out')
  @HttpCode(200)
  clockOut(
    @CurrentUser('id') userId: string,
    @Body('confirm') confirm?: boolean,
  ) {
    return this.attendanceService.clockOut(userId, Boolean(confirm));
  }

  @Get('me')
  getMyHistory(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendanceService.getMyHistory(userId, from, to);
  }

  @Get(':id')
  getDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attendanceService.getSessionDetail(
      user.id,
      id,
      user.role === UserRole.ADMINISTRATOR,
    );
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Get('admin/live')
  getLive() {
    return this.attendanceService.getLive();
  }
}
