import { Capacitor } from '@capacitor/core';

/**
 * API routing for VEER.
 * Web builds use the same-origin Express server. Android builds use the known
 * Cloud Run API origin unless VITE_API_BASE_URL overrides it at build time.
 * Never put a Gemini API key in this client-side file.
 */
const KNOWN_ANDROID_API_ORIGIN =
  https://veer-personal-ai-superhero-assistant.ai.studio

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
