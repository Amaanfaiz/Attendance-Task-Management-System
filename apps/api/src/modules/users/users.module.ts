import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DepartmentsController } from './departments.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, DepartmentsController, DocumentsController],
  providers: [UsersService, DocumentsService],
  exports: [UsersService],
})
export class UsersModule {}
