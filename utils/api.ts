/**
 * API routing for VEER.
 *
 * Android APK requests must reach the deployed Express/Gemini backend.
 * Web builds keep using the same-origin /api routes handled by the server.
 * VITE_API_BASE_URL may override the Android backend at build time.
 * Never place a Gemini API key in this client-side file.
 */
const KNOWN_ANDROID_API_ORIGIN =
  'https://ais-dev-d6vx7fbb2gwwxyvoxvgwhp-982249227133.asia-east1.run.app';

const configuredOrigin = (import.meta.env.VITE_API_BASE_URL || '').trim();
const apiOrigin = (configuredOrigin || KNOWN_ANDROID_API_ORIGIN).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}

export function getApiOrigin(): string {
  return apiOrigin;
}
