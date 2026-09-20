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
    acsConnectionString: process.env.ACS_EMAIL_CONNECTION_STRING,
    // ACS's senderAddress is a bare address string (no "Display Name <addr>" form
    // like Resend accepted) - a value with a display name fails with
    // RestError: Request body validation error. See property 'senderAddress'.
    from: process.env.EMAIL_FROM ?? 'DoNotReply@azurecomm.net',
  },
  storage: {
    // Unset in dev/test on purpose, same reasoning as email.acsConnectionString -
    // but BlobStorageService.upload()/download() throw rather than no-op if this
    // is missing (unlike email), since a silently-discarded document upload would
    // be a compliance failure, not a recoverable missed notification.
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? 'documents',
  },
});
