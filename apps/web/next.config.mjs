/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Proxy API calls through the Next.js server itself rather than having the browser
  // call the API's own origin directly. Cross-origin cookies (even with the correct
  // SameSite=None; Secure) are increasingly blocked outright as "third-party cookies"
  // by Safari/Firefox and an opt-in Chrome setting, independent of the SameSite
  // attribute — no amount of CORS/cookie-flag tuning on the API side fixes that from
  // the browser's side. Routing through this same-origin proxy makes the auth cookie
  // first-party from the browser's point of view, sidestepping the problem entirely.
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL;
    if (!apiInternalUrl) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiInternalUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
