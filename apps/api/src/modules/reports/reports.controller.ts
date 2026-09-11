import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole, getUtcDayRange } from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditorAllowed } from '../../common/decorators/auditor-allowed.decorator';
import { ReportsService } from './reports.service';
import { sendCsv, sendXlsx } from './export.util';

type Format = 'json' | 'csv' | 'xlsx';

// RISK-015: reports are read-only and exactly what the SRS's Auditor persona
// is meant to see ("read authorised attendance/task/audit reports").
@ApiTags('reports')
@Roles(UserRole.ADMINISTRATOR, UserRole.AUDITOR)
@AuditorAllowed()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // `to` must include the whole of its calendar day, not just its 00:00 UTC instant —
  // otherwise every report silently drops all of its own end date (caught via manual
  // browser testing: a same-day report came back empty).
  private parseRange(from?: string, to?: string) {
    if (!from || !to) {
      throw new BadRequestException(
        'from and to query parameters are required (ISO date)',
      );
    }
    return { from: getUtcDayRange(from).start, to: getUtcDayRange(to).end };
  }

  private async respond(
    res: Response,
    format: Format | undefined,
    title: string,
    filename: string,
    from: string,
    to: string,
    rows: Record<string, unknown>[],
  ) {
    if (format === 'csv')
      return sendCsv(res, filename, rows, {
        title,
        periodFrom: from,
        periodTo: to,
      });
    if (format === 'xlsx')
      return sendXlsx(res, filename, rows, {
        title,
        periodFrom: from,
        periodTo: to,
      });
    return res.json({
      title,
      periodFrom: from,
      periodTo: to,
      generatedAt: new Date().toISOString(),
      rows,
    });
  }

  @Get('attendance')
  async attendance(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('format') format?: Format,
  ) {
    const range = this.parseRange(from, to);
    const rows = await this.reportsService.attendanceReport({
      ...range,
      userId,
      departmentId,
    });
    return this.respond(
      res,
      format,
      'Attendance Report',
      'attendance-report',
      from,
      to,
      rows,
    );
  }

  @Get('task-time')
  async taskTime(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
    @Query('taskId') taskId?: string,
    @Query('format') format?: Format,
  ) {
    const range = this.parseRange(from, to);
    const rows = await this.reportsService.taskTimeReport({
      ...range,
      userId,
      taskId,
    });
    return this.respond(
      res,
      format,
      'Task Time Report',
      'task-time-report',
      from,
      to,
      rows,
    );
  }

  @Get('unallocated')
  async unallocated(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
    @Query('format') format?: Format,
  ) {
    const range = this.parseRange(from, to);
    const rows = await this.reportsService.unallocatedReport({
      ...range,
      userId,
    });
    return this.respond(
      res,
      format,
      'Unallocated Time Report',
      'unallocated-report',
      from,
      to,
      rows,
    );
  }

  @Get('breaks')
  async breaks(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
    @Query('format') format?: Format,
  ) {
    const range = this.parseRange(from, to);
    const rows = await this.reportsService.breaksReport({ ...range, userId });
    return this.respond(
      res,
      format,
      'Break Report',
      'break-report',
      from,
      to,
      rows,
    );
  }
}
