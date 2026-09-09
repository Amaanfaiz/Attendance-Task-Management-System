import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import {
  AuditAction,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserRole,
  UserStatus,
} from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { EmailService } from '../../common/services/email.service';
import { TokensService } from './tokens.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, AC-001-005-03

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly tokens: TokensService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const settings = await this.prisma.appSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    const status = settings.requireRegistrationApproval
      ? UserStatus.PENDING
      : UserStatus.ACTIVE;

    const user = await this.prisma.user.create({
      data: {
        firstName: input.firstName,
        surname: input.surname,
        email: input.email,
        phoneNumber: input.phoneNumber,
        passwordHash,
        role: UserRole.EMPLOYEE,
        status,
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: AuditAction.USER_CREATED,
      targetType: 'User',
      targetId: user.id,
      after: { email: user.email, status: user.status },
    });

    return { id: user.id, email: user.email, status: user.status };
  }

  async validateCredentials(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `Account is ${user.status.toLowerCase()}`,
      );
    }
    return user;
  }

  async issueSessionTokens(
    userId: string,
    email: string,
    role: string,
    status: string,
  ) {
    const accessToken = this.tokens.signAccessToken({
      sub: userId,
      email,
      role,
      status,
    });
    const refreshToken = await this.tokens.issueRefreshToken(userId);
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string | undefined) {
    const verified = await this.tokens.verifyRefreshToken(refreshToken);
    if (!verified) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: verified.userId },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    const newRefreshToken = await this.tokens.rotateRefreshToken(
      refreshToken,
      user.id,
    );
    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    });
    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.tokens.revokeRefreshToken(refreshToken);
    }
  }

  // Always sends when an email provider is configured (EmailService.isConfigured) -
  // unlike NotificationsService's email channel, this isn't gated by a settings
  // toggle, since it's the only way a user actually receives their reset link.
  // Still logs the link either way: the one reliable fallback when email isn't
  // configured yet, and handy for local dev without a Resend key.
  async createPasswordResetToken(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    this.logger.log(`Password set/reset link for ${email}: token=${token}`);

    const resetUrl = `${this.config.get<string>('webOrigin')}/reset-password?token=${token}`;
    await this.email.send(
      email,
      'Reset your ATMS password',
      `Use this link to set your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    );
  }

  // AC-001-005-02: response never reveals whether the account exists.
  async forgotPassword(input: ForgotPasswordInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (user) {
      await this.createPasswordResetToken(user.id, user.email);
    }
    return {
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = createHash('sha256').update(input.token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.tokens.revokeAllRefreshTokensForUser(record.userId);
    return { message: 'Password has been reset. Please log in again.' };
  }
}
