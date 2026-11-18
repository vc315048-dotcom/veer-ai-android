/**
 * API routing for VEER.
 * Use the published VEER API server unless an explicit API origin is configured.
 * This keeps native Android WebView requests from accidentally resolving /api/*
 * against the local app origin and receiving the app's HTML instead of JSON.
 */

const KNOWN_API_ORIGIN =
  'https://veer-personal-ai-superhero-assistant.ai.studio';

const configuredOrigin = (import.meta.env.VITE_API_BASE_URL || '').trim();

const apiOrigin = (configuredOrigin || KNOWN_API_ORIGIN).replace(/\\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiOrigin}${normalizedPath}`;
}

export function getApiOrigin(): string {
  return apiOrigin;
}
