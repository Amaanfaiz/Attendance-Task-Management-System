export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    refreshTtlMs: 7 * 24 * 60 * 60 * 1000,
  },
});
