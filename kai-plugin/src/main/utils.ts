/**
 * Pure utility functions used across the Legion plugin main process.
 * Ported from legion-plugin/main.mjs v0.2.0.
 */

/**
 * Trims a string value, returning '' for non-strings.
 */
export function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Clamps a numeric value between min and max, returning fallback if not finite.
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

/**
 * Joins a base URL and a relative path, normalizing trailing/leading slashes.
 */
export function joinUrl(baseUrl: string, relativePath: string): string {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedPath = String(relativePath || '').startsWith('/')
    ? String(relativePath || '')
    : `/${String(relativePath || '')}`;
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Safe JSON.stringify that falls back to String(value) on circular references or other errors.
 */
export function safeStringify(value: unknown, spacing?: number): string {
  try {
    return JSON.stringify(value, null, spacing);
  } catch {
    return String(value);
  }
}

/**
 * Returns a promise that resolves after the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple glob matching with `*` wildcard support.
 * `*` matches any sequence of characters. Non-wildcard patterns require exact match.
 */
export function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === value;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

/**
 * Converts a value to an ISO 8601 timestamp string, or returns undefined if not parseable.
 * Accepts numbers (epoch ms), numeric strings, and date strings.
 */
export function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return new Date(numeric).toISOString();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

/**
 * Converts a value to a finite number, or returns undefined.
 */
export function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Stringifies a value (JSON for objects, identity for strings), truncating to maxLength.
 */
export function stringifyValue(value: unknown, maxLength: number = 2_000): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof text !== 'string') return String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value);
  }
}
