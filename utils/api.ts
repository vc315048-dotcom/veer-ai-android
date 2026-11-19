/**
 * API routing for VEER.
 *
 * Android APK requests must reach the Cloud Run backend that was verified
 * from the user's device with /api/health. Web builds use the same API origin
 * so chat, TTS, transcription and live-token requests stay on one backend.
 * VITE_API_BASE_URL may override the backend at build time.
 * Never place a Gemini API key in this client-side file.
 */
const KNOWN_ANDROID_API_ORIGIN = 'https://227133.asia-east1.run.app';

const configuredOrigin = (import.meta.env.VITE_API_BASE_URL || '').trim();
const apiOrigin = (configuredOrigin || KNOWN_ANDROID_API_ORIGIN).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}

export function getApiOrigin(): string {
  return apiOrigin;
}
