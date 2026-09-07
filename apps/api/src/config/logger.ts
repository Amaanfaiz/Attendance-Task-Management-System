import { randomUUID } from 'crypto';
import { Options } from 'pino-http';
import { IncomingMessage } from 'http';

// AC-012-004-01: every request carries a correlation id, taken from an inbound
// x-request-id header when present so it can be traced across services.
// AC-012-004-03: cookies, auth headers and password fields are redacted, never logged.
export const pinoHttpOptions: Options = {
  genReqId: (req: IncomingMessage) => {
    const existing = req.headers['x-request-id'];
    return (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
  },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.confirmPassword',
      'req.body.token',
    ],
    censor: '[REDACTED]',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) =>
      req.url === '/api/v1/health' || req.url === '/api/v1/ready',
  },
};
