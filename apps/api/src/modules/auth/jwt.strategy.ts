import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '@atms/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload } from './tokens.service';

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.atms_access ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractFromCookie]),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret'),
    });
  }

  // AC-001-003-04: inactive/suspended/rejected accounts must be blocked even with a
  // still-valid access token, so we re-check current status on every request.
  async validate(payload: AccessTokenPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
    return { id: user.id, email: user.email, role: user.role, status: user.status };
  }
}
