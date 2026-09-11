import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@atms/shared';
import { AUDITOR_ALLOWED_KEY } from '../decorators/auditor-allowed.decorator';

// RISK-015: the SRS's Auditor/Management Viewer persona is "read authorised
// attendance/task/audit reports without editing operational records" (§3).
// Most routes in this API have no @Roles() decorator at all - RolesGuard
// treats that as "any authenticated user", which is fine for EMPLOYEE vs
// ADMINISTRATOR (both were meant to reach most of those), but would let a
// read-only auditor clock in, start task timers, or request corrections
// unless explicitly blocked. Rather than retrofit @Roles() onto every one of
// those write/self-service endpoints, this guard default-denies AUDITOR on
// everything except routes explicitly marked @AuditorAllowed() - a small,
// reviewable allowlist instead of a large, easy-to-miss blocklist. No-op for
// every other role.
@Injectable()
export class AuditorScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role !== UserRole.AUDITOR) {
      return true;
    }
    const isAllowed = this.reflector.getAllAndOverride<boolean>(
      AUDITOR_ALLOWED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!isAllowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
