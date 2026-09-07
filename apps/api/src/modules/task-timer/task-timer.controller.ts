import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  StartTaskTimerInput,
  SwitchTaskInput,
  startTaskTimerSchema,
  switchTaskSchema,
} from '@atms/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TaskTimerService } from './task-timer.service';

@ApiTags('task-timers')
@Controller('task-timers')
export class TaskTimerController {
  constructor(private readonly taskTimerService: TaskTimerService) {}

  @Post('start')
  start(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(startTaskTimerSchema))
    body: StartTaskTimerInput,
  ) {
    return this.taskTimerService.start(userId, body.taskId);
  }

  @Post('resume')
  resume(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(startTaskTimerSchema))
    body: StartTaskTimerInput,
  ) {
    return this.taskTimerService.resume(userId, body.taskId);
  }

  @Post('pause')
  @HttpCode(200)
  pause(@CurrentUser('id') userId: string) {
    return this.taskTimerService.pause(userId);
  }

  @Post('stop')
  @HttpCode(200)
  stop(@CurrentUser('id') userId: string) {
    return this.taskTimerService.stop(userId);
  }

  @Post('switch')
  switchTask(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(switchTaskSchema)) body: SwitchTaskInput,
  ) {
    return this.taskTimerService.switchTask(userId, body.taskId);
  }

  @Get('daily-log')
  dailyLog(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    return this.taskTimerService.getDailyLog(
      userId,
      date ?? new Date().toISOString(),
    );
  }
}
