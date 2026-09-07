import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DepartmentsController } from './departments.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, DepartmentsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
