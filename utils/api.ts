/**
 * API routing for VEER.
 *
 * The Android APK is served from capacitor://localhost, so relative /api
 * requests hit the WebView's local asset server and return index.html.
 * Always call the deployed VEER backend instead.
 */
const KNOWN_API_ORIGIN = 'https://veerhero-assistant.ai.studio';
const configuredOrigin = (import.meta.env.VITE_API_BASE_URL || '').trim();
const apiOrigin = (configuredOrigin || KNOWN_API_ORIGIN).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}

export function getApiOrigin(): string {
  return apiOrigin;
}
