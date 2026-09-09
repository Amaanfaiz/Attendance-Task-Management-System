export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAME_SITE ?? 'lax',
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    refreshTtlMs: 7 * 24 * 60 * 60 * 1000,
  },
  email: {
    // Unset in dev/test on purpose - NotificationsService treats a missing key as
    // "email channel not configured" and skips sending rather than throwing, so the
    // rest of the app never depends on this being present (AC-011-001-01: email is
    // one of two channels, gated by settings, not a hard requirement).
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM ?? 'ATMS <onboarding@resend.dev>',
  },
});
