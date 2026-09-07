import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateTaskInput,
  UpdateTaskInput,
  UserRole,
  createTaskSchema,
  updateTaskSchema,
} from '@atms/shared';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput,
  ) {
    return this.tasksService.create(actor.id, actor.role, body);
  }

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('scope') scope?: 'mine' | 'all',
  ) {
    if (actor.role === UserRole.ADMINISTRATOR && scope === 'all') {
      return this.tasksService.listAll({ status, priority, assigneeId });
    }
    return this.tasksService.listForUser(actor.id, status, priority);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const task = await this.tasksService.findById(id);
    const actualMinutes = await this.tasksService.getActualMinutes(id);
    return { ...task, actualMinutes };
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ) {
    return this.tasksService.update(actor.id, actor.role, id, body);
  }
}
