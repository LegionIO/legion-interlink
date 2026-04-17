/* eslint-disable @typescript-eslint/no-explicit-any */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function parseJson(text: string, fallback: unknown): unknown {
  try {
    return text.trim() ? JSON.parse(text) : fallback;
  } catch {
    return null;
  }
}

export function asArray(value: unknown, nestedKey?: string): any[] {
  if (Array.isArray(value)) return value;
  if (nestedKey && value && typeof value === 'object' && Array.isArray((value as any)[nestedKey])) {
    return (value as any)[nestedKey];
  }
  if (value && typeof value === 'object') {
    for (const key of ['items', 'results', 'data', 'entries', 'records', 'repos', 'pulls', 'issues', 'commits', 'monitors']) {
      if (Array.isArray((value as any)[key])) return (value as any)[key];
    }
  }
  return [];
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return iso;
  if (diffMs < 60_000) return 'now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h`;
  return `${Math.floor(diffMs / 86_400_000)}d`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function fmtUptime(seconds: unknown): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
}

export function fmtNumber(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
}

export function fmtCurrency(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'n/a';
  return `$${number.toFixed(2)}`;
}
