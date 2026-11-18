/**
 * API routing for VEER.
 *
 * In the Android APK, relative /api requests resolve against the local
 * WebView asset origin and can return index.html instead of JSON.
 * Use the deployed VEER backend origin for API calls.
 */
const API_ORIGIN = 'https://veerhero-assistant.ai.studio';

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return API_ORIGIN + normalizedPath;
}

export function getApiOrigin(): string {
  return API_ORIGIN;
}
