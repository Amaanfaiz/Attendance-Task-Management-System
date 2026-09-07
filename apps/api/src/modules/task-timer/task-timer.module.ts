import { Module } from '@nestjs/common';
import { TaskTimerController } from './task-timer.controller';
import { TaskTimerService } from './task-timer.service';

@Module({
  controllers: [TaskTimerController],
  providers: [TaskTimerService],
})
export class TaskTimerModule {}
