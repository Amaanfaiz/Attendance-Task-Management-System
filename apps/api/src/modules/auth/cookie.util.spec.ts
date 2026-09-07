import { ConfigService } from '@nestjs/config';
import { cookieBaseOptions } from './cookie.util';

function configWith(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('cookieBaseOptions', () => {
  it('defaults to sameSite=lax and whatever COOKIE_SECURE says, for same-origin local dev', () => {
    const opts = cookieBaseOptions(
      configWith({ cookieSameSite: 'lax', cookieSecure: false }),
    );
    expect(opts).toEqual({ sameSite: 'lax', secure: false });
  });

  // Cross-origin deployments (Azure's separate app subdomains, this project's tunnel
  // demo) need sameSite=none, and browsers silently drop that cookie unless Secure is
  // also set — so this must hold even if COOKIE_SECURE is left at its dev-mode false.
  it('forces secure=true when sameSite=none, regardless of COOKIE_SECURE', () => {
    const opts = cookieBaseOptions(
      configWith({ cookieSameSite: 'none', cookieSecure: false }),
    );
    expect(opts).toEqual({ sameSite: 'none', secure: true });
  });

  it('does not downgrade secure when both none and COOKIE_SECURE=true are set', () => {
    const opts = cookieBaseOptions(
      configWith({ cookieSameSite: 'none', cookieSecure: true }),
    );
    expect(opts).toEqual({ sameSite: 'none', secure: true });
  });
});
