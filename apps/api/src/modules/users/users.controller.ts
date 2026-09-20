import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  BulkImportUserRow,
  RejectUserInput,
  UpdateOwnProfileInput,
  UserRole,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  bulkImportUserRowSchema,
  rejectUserSchema,
  updateOwnProfileSchema,
} from '@atms/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditorAllowed } from '../../common/decorators/auditor-allowed.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

// Column headers accepted in the uploaded sheet, matched case-insensitively so
// "Department" / "department" / " Department " all work - a human fills this
// sheet, not code. Order doesn't matter; only these labels do.
const BULK_IMPORT_HEADERS = {
  firstName: ['first name', 'firstname'],
  surname: ['surname', 'last name', 'lastname'],
  email: ['email'],
  phoneNumber: ['phone number', 'phone', 'phonenumber'],
  role: ['role'],
  departmentName: ['department'],
  employeeNumber: ['employee number', 'employeenumber'],
} as const;

// Excel silently turns a typed email address into a hyperlink cell
// ({ text, hyperlink }) rather than a plain string - a sheet of email
// addresses (exactly what this import is for) hits that on nearly every row.
// A naive String(value) on that object yields "[object Object]", which would
// have rejected every single row. Handles hyperlink cells, rich text, and
// formula results; falls back to a plain String() for everything else.
function cellText(value: ExcelJS.CellValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string')
      return value.text.trim();
    if ('richText' in value)
      return value.richText
        .map((t) => t.text)
        .join('')
        .trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function matchHeader(cell: unknown): string | null {
  const text = (cellText(cell as ExcelJS.CellValue) ?? '').toLowerCase();
  for (const [field, aliases] of Object.entries(BULK_IMPORT_HEADERS)) {
    if ((aliases as readonly string[]).includes(text)) return field;
  }
  return null;
}

// Returns one { row, data | error } entry per data row, in sheet order, so the
// caller can report exactly which spreadsheet row a validation error came from
// (row 1 is the header, so data starts at row 2).
async function parseBulkImportWorkbook(
  buffer: Buffer,
): Promise<{ row: number; data?: BulkImportUserRow; error?: string }[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new BadRequestException(
      'Could not read this file - upload a .xlsx spreadsheet',
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('The spreadsheet has no sheets');

  const headerRow = sheet.getRow(1);
  const columnByIndex = new Map<number, string>();
  headerRow.eachCell((cell, colNumber) => {
    const field = matchHeader(cell.value);
    if (field) columnByIndex.set(colNumber, field);
  });
  if (!columnByIndex.size) {
    throw new BadRequestException(
      'No recognised columns found - expected headers like "First Name", "Surname", "Email", "Phone Number", "Role", "Department", "Employee Number"',
    );
  }

  const results: { row: number; data?: BulkImportUserRow; error?: string }[] =
    [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const raw: Record<string, unknown> = {};
    columnByIndex.forEach((field, colNumber) => {
      raw[field] = cellText(row.getCell(colNumber).value);
    });
    // Role is a strict enum match (EMPLOYEE/ADMINISTRATOR/AUDITOR) - a human
    // typing "employee" or leaving the cell blank shouldn't fail the whole row.
    if (typeof raw.role === 'string') {
      raw.role = raw.role.toUpperCase() || undefined;
    }
    // A fully blank row (e.g. trailing empty rows Excel sometimes keeps) isn't an
    // error to report, just nothing to import.
    if (Object.values(raw).every((v) => !v)) continue;

    const parsed = bulkImportUserRowSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({
        row: rowNumber,
        error: parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    } else {
      results.push({ row: rowNumber, data: parsed.data });
    }
  }
  return results;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AuditorAllowed()
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findMe(userId);
  }

  @AuditorAllowed()
  @Patch('me')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateOwnProfileSchema))
    body: UpdateOwnProfileInput,
  ) {
    return this.usersService.updateOwnProfile(userId, body);
  }

  // RISK-015: also readable by Auditor - needed for the Reports page's
  // employee filter dropdown; still just a name/role/department list, no
  // write access to any of it.
  @Roles(UserRole.ADMINISTRATOR, UserRole.AUDITOR)
  @AuditorAllowed()
  @Get()
  list(
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.list({ status, role, departmentId, search });
  }

  // Declared before the ':id' route below - 'bulk-import' would otherwise be
  // captured as an :id path param instead of reaching this handler.
  @Roles(UserRole.ADMINISTRATOR)
  @Get('bulk-import/template')
  async downloadBulkImportTemplate(@Res() res: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Users');
    sheet.columns = [
      { header: 'First Name', key: 'firstName', width: 18 },
      { header: 'Surname', key: 'surname', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone Number', key: 'phoneNumber', width: 18 },
      { header: 'Role', key: 'role', width: 16 },
      { header: 'Department', key: 'departmentName', width: 20 },
      { header: 'Employee Number', key: 'employeeNumber', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({
      firstName: 'Jane',
      surname: 'Doe',
      email: 'jane.doe@example.com',
      phoneNumber: '+1 555 0100',
      role: UserRole.EMPLOYEE,
      departmentName: '',
      employeeNumber: '',
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="atms-user-import-template.xlsx"',
    );
    await workbook.xlsx.write(res);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // EP-012: self-or-admin, no @AuditorAllowed() - Auditor is blocked from
  // Personal Details/Emergency Contact same as Documents.
  @Get(':id/employee-profile')
  getEmployeeProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.usersService.getEmployeeProfile(
      actor.id,
      id,
      actor.role === UserRole.ADMINISTRATOR,
    );
  }

  @Get(':id/emergency-contact')
  getEmergencyContact(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.usersService.getEmergencyContact(
      actor.id,
      id,
      actor.role === UserRole.ADMINISTRATOR,
    );
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(adminCreateUserSchema))
    body: AdminCreateUserInput,
  ) {
    return this.usersService.adminCreate(actor.id, body);
  }

  // US-002-001 extension: same account-creation path as create() above, one row
  // per user, from an uploaded .xlsx instead of the manual form. 5MB is far more
  // than any real headcount sheet needs and keeps a mis-uploaded file cheap to
  // reject.
  @Roles(UserRole.ADMINISTRATOR)
  @Post('bulk-import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async bulkImport(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const parsedRows = await parseBulkImportWorkbook(file.buffer);

    const validRows = parsedRows.filter(
      (r): r is { row: number; data: BulkImportUserRow } => !!r.data,
    );
    const parseErrors = parsedRows
      .filter((r) => r.error)
      .map((r) => ({ row: r.row, message: r.error! }));

    if (!validRows.length && !parseErrors.length) {
      throw new BadRequestException('The spreadsheet has no data rows');
    }

    const result = await this.usersService.bulkImport(actor.id, validRows);
    return {
      createdCount: result.createdCount,
      created: result.created,
      errors: [...parseErrors, ...result.errors].sort((a, b) => a.row - b.row),
    };
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminUpdateUserSchema))
    body: AdminUpdateUserInput,
  ) {
    return this.usersService.adminUpdate(actor.id, id, body);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/approve')
  approve(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.approve(actor.id, id);
  }

  @Roles(UserRole.ADMINISTRATOR)
  @Post(':id/reject')
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectUserSchema)) body: RejectUserInput,
  ) {
    return this.usersService.reject(actor.id, id, body);
  }
}
