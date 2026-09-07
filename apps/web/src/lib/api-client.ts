// Empty by default: the browser calls the API through a same-origin relative path
// (/api/v1/...), which Next.js's own server proxies to the real API (see the
// `rewrites()` config in next.config.mjs). This keeps the auth cookie first-party
// from the browser's point of view — cross-origin cookies get blocked outright as
// "third-party cookies" by Safari/Firefox and an opt-in Chrome setting, independent
// of the SameSite attribute. Set NEXT_PUBLIC_API_URL only if you deliberately want
// the browser to call the API's own origin directly instead of proxying.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : 'Request failed');
  }
}

async function parseBody(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) qs.set(key, String(value));
    }
  }
  const qsString = qs.toString();
  return `${API_URL}/api/v1${path}${qsString ? `?${qsString}` : ''}`;
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.skipAuthRetry && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!res.ok) {
    const body = await parseBody(res);
    throw new ApiError(res.status, body);
  }

  return (await parseBody(res)) as T;
}

export const api = {
  get: <T = unknown>(path: string, query?: RequestOptions['query']) =>
    apiRequest<T>(path, { method: 'GET', query }),
  post: <T = unknown>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T = unknown>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body: body ?? {} }),
};

export function exportUrl(path: string, query: Record<string, string | number | boolean | undefined>) {
  return buildUrl(path, query);
}
