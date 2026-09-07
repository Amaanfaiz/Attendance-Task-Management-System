import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

export const ACCESS_COOKIE = 'atms_access';
export const REFRESH_COOKIE = 'atms_refresh';

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  accessToken: string,
  refreshToken: string,
) {
  const secure = config.get<boolean>('cookieSecure');
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: config.get<number>('jwt.refreshTtlMs'),
  });
}

export function clearAuthCookies(res: Response, config: ConfigService) {
  const secure = config.get<boolean>('cookieSecure');
  res.clearCookie(ACCESS_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
}
