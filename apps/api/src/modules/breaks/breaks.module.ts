import { Module } from '@nestjs/common';
import { BreaksController } from './breaks.controller';
import { BreaksService } from './breaks.service';

@Module({
  controllers: [BreaksController],
  providers: [BreaksService],
})
export class BreaksModule {}
