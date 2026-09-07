import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('me')
  getMine(@CurrentUser('id') userId: string, @Query('date') date?: string) {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    return this.reconciliationService.getDailySummary(userId, targetDate);
  }
}
