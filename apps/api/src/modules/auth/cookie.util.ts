import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'atms_access';
export const REFRESH_COOKIE = 'atms_refresh';

// Web and API are separate origins in every real deployment target (Azure Container
// Apps gives each app its own *.azurecontainerapps.io subdomain), so the auth cookies
// are cross-site from the browser's point of view. SameSite=Lax — fine for same-origin
// local dev — silently drops the cookie on cross-origin fetch/XHR, which breaks auth
// with no obvious error. SameSite=None requires Secure=true (browsers reject the
// combination otherwise), so COOKIE_SAME_SITE=none forces secure regardless of
// COOKIE_SECURE.
export function cookieBaseOptions(
  config: ConfigService,
): Pick<CookieOptions, 'secure' | 'sameSite'> {
  const sameSite = (config.get<string>('cookieSameSite') ?? 'lax') as
    'lax' | 'none' | 'strict';
  const secure =
    sameSite === 'none' ? true : config.get<boolean>('cookieSecure');
  return { secure, sameSite };
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  accessToken: string,
  refreshToken: string,
) {
  const base = cookieBaseOptions(config);
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    httpOnly: true,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    httpOnly: true,
    path: '/api/v1/auth',
    maxAge: config.get<number>('jwt.refreshTtlMs'),
  });
}

export function clearAuthCookies(res: Response, config: ConfigService) {
  const base = cookieBaseOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, {
    ...base,
    httpOnly: true,
    path: '/api/v1/auth',
  });
}
