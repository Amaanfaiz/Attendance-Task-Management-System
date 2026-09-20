import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  AuditAction,
  BulkImportUserRow,
  RejectUserInput,
  UpdateOwnProfileInput,
  UserStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { AuthService } from '../auth/auth.service';
import { maskProfileData } from '../../common/utils/mask-profile-data';

// AC-002-006-01: employeeNumber is unique at the DB level (nullable+unique) but had no
// pre-check like email does, so a duplicate fell through as an unhandled 500 instead of
// a clean conflict response. Translates the underlying Prisma unique-constraint error
// (P2002) into a proper ConflictException naming the actual field, rather than adding a
// one-off pre-check per field.
function rethrowAsConflict(err: unknown): never {
  const prismaErr = err as { code?: string; meta?: { target?: string[] } };
  if (prismaErr.code === 'P2002') {
    const field = prismaErr.meta?.target?.[0] ?? 'field';
    throw new ConflictException(`A user with this ${field} already exists`);
  }
  throw err;
}

const SELECT_SAFE_FIELDS = {
  id: true,
  firstName: true,
  surname: true,
  email: true,
  phoneNumber: true,
  role: true,
  status: true,
  employeeNumber: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  dateOfBirth: true,
  jobTitle: true,
  approvedById: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SELECT_SAFE_FIELDS,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // SCR-013 User Detail: admin-only lookup of any single user by id.
  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SELECT_SAFE_FIELDS,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // AC-002-003-02: role/status/department are administrator-only and never accepted here.
  async updateOwnProfile(userId: string, input: UpdateOwnProfileInput) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: input,
      select: SELECT_SAFE_FIELDS,
    });
    await this.audit.record({
      actorId: userId,
      action: AuditAction.USER_UPDATED,
      targetType: 'User',
      targetId: userId,
      after: input,
    });
    return user;
  }

  async list(filters: {
    status?: string;
    role?: string;
    departmentId?: string;
    search?: string;
  }) {
    return this.prisma.user.findMany({
      where: {
        status: filters.status as never,
        role: filters.role as never,
        departmentId: filters.departmentId,
        ...(filters.search
          ? {
              OR: [
                {
                  firstName: { contains: filters.search, mode: 'insensitive' },
                },
                { surname: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: SELECT_SAFE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  // US-002-001: administrator onboards a user directly; a set-password link replaces a
  // plaintext temp password so no secret ever passes through the admin's hands.
  // Shared by the manual "Create User" form and bulkImport() below - both need the
  // exact same account-creation + audit + welcome-email behaviour per user, just
  // reached from a different input source.
  private async createOne(
    actorId: string,
    input: {
      firstName: string;
      surname: string;
      email: string;
      phoneNumber: string;
      role: AdminCreateUserInput['role'];
      departmentId?: string;
      employeeNumber?: string;
      dateOfBirth?: string;
      jobTitle?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing)
      throw new ConflictException('An account with this email already exists');

    const placeholderPasswordHash = await argon2.hash(
      randomBytes(32).toString('hex'),
      {
        type: argon2.argon2id,
      },
    );

    const user = await this.prisma.user
      .create({
        data: {
          firstName: input.firstName,
          surname: input.surname,
          email: input.email,
          phoneNumber: input.phoneNumber,
          role: input.role,
          status: UserStatus.ACTIVE,
          departmentId: input.departmentId,
          employeeNumber: input.employeeNumber,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          jobTitle: input.jobTitle,
          passwordHash: placeholderPasswordHash,
          approvedById: actorId,
          approvedAt: new Date(),
        },
        select: SELECT_SAFE_FIELDS,
      })
      .catch(rethrowAsConflict);

    await this.authService.createPasswordResetToken(
      user.id,
      user.email,
      'welcome',
    );
    await this.audit.record({
      actorId,
      action: AuditAction.USER_CREATED,
      targetType: 'User',
      targetId: user.id,
      after: { email: user.email, role: user.role },
    });
    return user;
  }

  async adminCreate(actorId: string, input: AdminCreateUserInput) {
    return this.createOne(actorId, input);
  }

  // Bulk import from an uploaded spreadsheet (parsed by the controller into plain
  // rows before this is called - keeps ExcelJS/multipart concerns out of the
  // service). Each row is independent: one bad row (duplicate email, unknown
  // department, failed validation) is reported and skipped, it never aborts the
  // rest of the sheet - an admin importing 200 rows shouldn't lose 199 good ones
  // over 1 typo.
  async bulkImport(
    actorId: string,
    rows: { row: number; data: BulkImportUserRow }[],
  ) {
    const departments = await this.prisma.department.findMany();
    const departmentByName = new Map(
      departments.map((d) => [d.name.trim().toLowerCase(), d.id]),
    );

    const created: { row: number; email: string }[] = [];
    const errors: { row: number; email?: string; message: string }[] = [];

    for (const { row: rowNumber, data: row } of rows) {
      try {
        let departmentId: string | undefined;
        if (row.departmentName) {
          const match = departmentByName.get(
            row.departmentName.trim().toLowerCase(),
          );
          if (!match) {
            throw new BadRequestException(
              `Unknown department "${row.departmentName}"`,
            );
          }
          departmentId = match;
        }
        const user = await this.createOne(actorId, {
          firstName: row.firstName,
          surname: row.surname,
          email: row.email,
          phoneNumber: row.phoneNumber,
          role: row.role,
          departmentId,
          employeeNumber: row.employeeNumber,
        });
        created.push({ row: rowNumber, email: user.email });
      } catch (err) {
        errors.push({
          row: rowNumber,
          email: row.email,
          message:
            err instanceof Error ? err.message : 'Could not create this row',
        });
      }
    }

    return { createdCount: created.length, created, errors };
  }

  async adminUpdate(
    actorId: string,
    userId: string,
    input: AdminUpdateUserInput,
  ) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('User not found');

    if (input.email && input.email !== before.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existing) throw new ConflictException('Email already in use');
    }

    const user = await this.prisma.user
      .update({
        where: { id: userId },
        data: {
          ...input,
          dateOfBirth:
            input.dateOfBirth !== undefined
              ? input.dateOfBirth
                ? new Date(input.dateOfBirth)
                : null
              : undefined,
        },
        select: SELECT_SAFE_FIELDS,
      })
      .catch(rethrowAsConflict);

    if (input.role && input.role !== before.role) {
      await this.audit.record({
        actorId,
        action: AuditAction.USER_ROLE_CHANGED,
        targetType: 'User',
        targetId: userId,
        before: { role: before.role },
        after: { role: input.role },
      });
    }
    if (input.status && input.status !== before.status) {
      await this.audit.record({
        actorId,
        action: AuditAction.USER_STATUS_CHANGED,
        targetType: 'User',
        targetId: userId,
        before: { status: before.status },
        after: { status: input.status },
      });
    }
    // role/status changes are audited separately above with their own before/after -
    // this event covers the remaining profile fields only. Must list every one of
    // them on both sides: the profile form always submits the full field set on
    // every save (not just what the admin actually touched), so a `before` missing
    // any of these would show it as "changed from nothing" on every single save,
    // regardless of whether it was - found via a real Audit Log entry showing email
    // and departmentId as newly-set when neither had been touched.
    await this.audit.record({
      actorId,
      action: AuditAction.USER_UPDATED,
      targetType: 'User',
      targetId: userId,
      before: {
        firstName: before.firstName,
        surname: before.surname,
        email: before.email,
        phoneNumber: before.phoneNumber,
        departmentId: before.departmentId,
        employeeNumber: before.employeeNumber,
        dateOfBirth: before.dateOfBirth,
        jobTitle: before.jobTitle,
      },
      after: {
        firstName: input.firstName,
        surname: input.surname,
        email: input.email,
        phoneNumber: input.phoneNumber,
        departmentId: input.departmentId,
        employeeNumber: input.employeeNumber,
        dateOfBirth: input.dateOfBirth,
        jobTitle: input.jobTitle,
      },
    });

    return user;
  }

  // US-001-002: approving activates the account and records approver/date (AC-001-002-03).
  async approve(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Only pending users can be approved');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        approvedById: actorId,
        approvedAt: new Date(),
      },
      select: SELECT_SAFE_FIELDS,
    });
    await this.audit.record({
      actorId,
      action: AuditAction.USER_APPROVED,
      targetType: 'User',
      targetId: userId,
    });
    // Self-registered user already chose their own password at registration
    // (unlike adminCreate/bulkImport's placeholder-password accounts) - no
    // set-password link needed here, just confirmation the account is live.
    await this.authService.sendAccountApprovedEmail(updated.email);
    return updated;
  }

  // EP-013: self-or-admin read of the *current* live value - plain reads, no
  // request/approval involved (that's ProfileChangesService's concern).
  async getEmployeeProfile(
    actorId: string,
    userId: string,
    canViewAny: boolean,
  ) {
    if (!canViewAny && actorId !== userId) {
      throw new ForbiddenException('Not your profile');
    }
    const profile = await this.prisma.employeeProfile.findUnique({
      where: { userId },
    });
    return maskProfileData(profile);
  }

  async getEmergencyContact(
    actorId: string,
    userId: string,
    canViewAny: boolean,
  ) {
    if (!canViewAny && actorId !== userId) {
      throw new ForbiddenException('Not your emergency contact');
    }
    return this.prisma.emergencyContact.findUnique({ where: { userId } });
  }

  async reject(actorId: string, userId: string, input: RejectUserInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException('Only pending users can be rejected');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.REJECTED },
      select: SELECT_SAFE_FIELDS,
    });
    await this.audit.record({
      actorId,
      action: AuditAction.USER_REJECTED,
      targetType: 'User',
      targetId: userId,
      metadata: { reason: input.reason },
    });
    return updated;
  }
}
