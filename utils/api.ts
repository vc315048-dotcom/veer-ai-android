import { Capacitor } from '@capacitor/core';

/**
 * API routing for VEER.
 *
 * Browser / AI Studio builds use the same-origin Express API so preview and
 * deployed web requests reach the backend attached to this project.
 * Native Android builds use the verified Cloud Run health endpoint.
 * VITE_API_BASE_URL can override the Android backend at build time.
 *
 * Never put a Gemini API key in this client-side file.
 */
const KNOWN_ANDROID_API_ORIGIN = 'https://227133.asia-east1.run.app';

const configuredOrigin = (import.meta.env.VITE_API_BASE_URL || '').trim();
const isNativeAndroid =
  typeof window !== 'undefined' &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android';

const apiOrigin = (configuredOrigin || (isNativeAndroid ? KNOWN_ANDROID_API_ORIGIN : ''))
  .replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}

export function getApiOrigin(): string {
  return apiOrigin;
}
