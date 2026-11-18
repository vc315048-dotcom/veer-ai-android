import { Capacitor } from '@capacitor/core';

/**
 * API routing for VEER.
 * Web builds use the same-origin Express server. Android builds use the
 * deployed VEER backend so API calls do not hit the local WebView asset server.
 * Never put a Gemini API key in this client-side file.
 */
const KNOWN_ANDROID_API_ORIGIN = 'https://veerhero-assistant.ai.studio';

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
