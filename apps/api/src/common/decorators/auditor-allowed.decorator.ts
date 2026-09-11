import { SetMetadata } from '@nestjs/common';

export const AUDITOR_ALLOWED_KEY = 'auditorAllowed';

// Marks a route as reachable by the read-only AUDITOR role. Only meaningful
// alongside AuditorScopeGuard, which default-denies AUDITOR on every route
// unless this is present - see that guard for why (most routes have no
// @Roles() at all today, which RolesGuard treats as "any authenticated
// user", so a new role needs an explicit allowlist rather than relying on
// existing decorators).
export const AuditorAllowed = () => SetMetadata(AUDITOR_ALLOWED_KEY, true);
