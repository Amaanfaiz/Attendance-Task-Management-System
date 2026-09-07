import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  status: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get('jwt.accessSecret'),
      expiresIn: this.config.get('jwt.accessTtl'),
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Issues an opaque refresh token and stores only its hash, so a DB leak can't be replayed. */
  async issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(token);
    const ttlMs = this.config.get<number>('jwt.refreshTtlMs')!;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  /** AC-001-007-01/02: a refresh token unused past the configured inactivity window is treated as expired. */
  async verifyRefreshToken(token: string | undefined): Promise<{ userId: string; tokenId: string } | null> {
    if (!token) {
      return null;
    }
    const tokenHash = this.hashToken(token);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      return null;
    }
    const settings = await this.prisma.appSettings.findUnique({ where: { id: 'default' } });
    const inactivityMinutes = settings?.sessionInactivityTimeoutMinutes ?? 30;
    const inactiveMs = Date.now() - record.lastUsedAt.getTime();
    if (inactiveMs > inactivityMinutes * 60_000) {
      await this.revokeRefreshToken(token);
      return null;
    }
    return { userId: record.userId, tokenId: record.id };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Rotation: the presented token is revoked and a fresh one issued, so a stolen token has one use. */
  async rotateRefreshToken(oldToken: string, userId: string): Promise<string> {
    await this.revokeRefreshToken(oldToken);
    return this.issueRefreshToken(userId);
  }
}
