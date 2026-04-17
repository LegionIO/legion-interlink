import type { PluginAPI } from './types.js';
import type { PluginConfig } from './types.js';
import { USER_AGENT, CIRCUIT_BREAKER_RECHECK_MS } from './constants.js';
import { cleanText, clampNumber, joinUrl } from './utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DaemonRequestOptions = {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  fallbackPath?: string;
  timeoutMs?: number;
  expectText?: boolean;
  quiet?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  accept?: string;
};

export type DaemonResult = {
  ok: boolean;
  status?: number;
  error?: string;
  data?: unknown;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Circuit breaker state
// ---------------------------------------------------------------------------

let daemonReachable = true;
let daemonLastCheckAt = 0;

export function markDaemonReachable(reachable: boolean): void {
  daemonReachable = reachable;
  daemonLastCheckAt = Date.now();
}

/**
 * Returns `true` when the daemon is known to be unreachable and the
 * re-check interval has not yet elapsed.  Health / ready endpoints are
 * always allowed through so we can detect recovery.
 */
export function shouldShortCircuit(path: string, config: PluginConfig): boolean {
  if (daemonReachable) return false;

  // Always let health-probing paths through so we can detect recovery.
  const healthPaths = [
    config.readyPath || '/api/ready',
    config.healthPath || '/api/health',
  ];
  if (healthPaths.some((hp) => path === hp || path.startsWith(hp + '?'))) {
    return false;
  }

  return Date.now() - daemonLastCheckAt < CIRCUIT_BREAKER_RECHECK_MS;
}

// ---------------------------------------------------------------------------
// Public daemon helpers
// ---------------------------------------------------------------------------

/**
 * High-level helper: resolves the current plugin config internally.
 */
export async function daemonJson(
  api: PluginAPI,
  path: string,
  options: DaemonRequestOptions = {},
): Promise<DaemonResult> {
  // Import getPluginConfig lazily to avoid hard circular deps at load time.
  // The caller (index.ts / action handlers) will already have set up config.
  const { getPluginConfig } = await import('./config.js');
  const config = getPluginConfig(api);
  return daemonRequest(api, config, path, options);
}

/**
 * Full daemon request with fallback-path retry on 404.
 */
export async function daemonRequest(
  api: PluginAPI,
  config: PluginConfig,
  path: string,
  options: DaemonRequestOptions = {},
): Promise<DaemonResult> {
  const primaryPath = path;
  const method = cleanText(options.method).toUpperCase() || 'GET';
  const accept = options.expectText
    ? 'application/json, text/plain'
    : 'application/json';

  if (shouldShortCircuit(primaryPath, config)) {
    return {
      ok: false,
      status: 0,
      error: 'Daemon unreachable (circuit breaker active)',
      data: null,
    };
  }

  let response = await daemonRequestOnce(api, config, primaryPath, {
    ...options,
    method,
    accept,
  });

  if (
    !response.ok &&
    response.status === 404 &&
    cleanText(options.fallbackPath)
  ) {
    response = await daemonRequestOnce(api, config, options.fallbackPath!, {
      ...options,
      method,
      accept,
      fallbackPath: undefined,
    });
  }

  // Track reachability for circuit breaker
  if (response.ok) {
    markDaemonReachable(true);
  } else if (response.status === 0) {
    // Network-level failure — mark unreachable
    markDaemonReachable(false);
  }

  if (!response.ok && !options.quiet) {
    // Lazy import to avoid circular dep
    const { replaceState } = await import('./state.js');
    replaceState(api, {
      lastError: response.error || `Request failed for ${primaryPath}`,
    } as Record<string, unknown>);
  }

  return response;
}

/**
 * Single attempt (no fallback path retry).
 */
export async function daemonRequestOnce(
  api: PluginAPI,
  config: PluginConfig,
  path: string,
  options: DaemonRequestOptions = {},
): Promise<DaemonResult> {
  const url = new URL(joinUrl(config.daemonUrl, path));
  const query =
    options.query && typeof options.query === 'object' ? options.query : {};
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const init: RequestInit = {
    method: options.method || 'GET',
    headers: buildDaemonHeaders(config, {
      accept: options.accept || 'application/json',
      ...(options.body !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...(options.headers && typeof options.headers === 'object'
        ? options.headers
        : {}),
    }),
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  };

  try {
    const response = await fetchWithTimeout(
      api,
      url.toString(),
      init,
      clampNumber(options.timeoutMs, 1_000, 120_000, DEFAULT_TIMEOUT_MS),
    );
    const data = await parseResponseBody(response, options.expectText);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractErrorMessage(data) || `HTTP ${response.status}`,
        data,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: unwrapResultData(data),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Header builder
// ---------------------------------------------------------------------------

export function buildDaemonHeaders(
  config: PluginConfig,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    ...extraHeaders,
  };

  const token = resolveAuthToken(config);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Auth token resolution
// ---------------------------------------------------------------------------

function resolveAuthToken(config: PluginConfig): string | null {
  if (cleanText(config.apiKey)) return cleanText(config.apiKey);
  return resolveClusterToken(config);
}

/**
 * Uses top-level node: imports for crypto/fs/path/os.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function resolveClusterToken(cfg: PluginConfig): string | null {
  const candidates: string[] = [];
  if (cleanText(cfg.configDir)) candidates.push(cleanText(cfg.configDir));
  candidates.push(join(homedir(), '.kai', 'settings'));
  candidates.push(join(homedir(), '.legion', 'settings'));
  candidates.push(join(homedir(), '.config', 'legion', 'settings'));
  const configDir = candidates.find((c: string) => existsSync(c)) || candidates[0];

  const cryptPath = join(configDir, 'crypt.json');
  if (!existsSync(cryptPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(cryptPath, 'utf-8'));
    const secret = cleanText(raw?.crypt?.cluster_secret);
    if (!secret) return null;

    const now = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: process.env.USER || process.env.USERNAME || 'kai',
        name: 'Kai Legion Plugin',
        roles: ['desktop'],
        scope: 'human',
        iss: 'kai-plugin',
        iat: now,
        exp: now + 3_600,
        jti: randomUUID(),
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

export async function fetchWithTimeout(
  api: PluginAPI,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(
    () => timeoutController.abort(new Error(`Timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    const signal = mergeAbortSignals(
      init.signal as AbortSignal | undefined,
      timeoutController.signal,
    );
    return await api.fetch(url, {
      ...init,
      signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Abort signal merging
// ---------------------------------------------------------------------------

export function mergeAbortSignals(
  primary?: AbortSignal,
  secondary?: AbortSignal,
): AbortSignal {
  if (!primary) return secondary!;
  if (!secondary) return primary;

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }

  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Response body parsing
// ---------------------------------------------------------------------------

export async function parseResponseBody(
  response: Response,
  expectText?: boolean,
): Promise<unknown> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (expectText && !contentType.includes('application/json')) {
    return response.text();
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Data unwrapping
// ---------------------------------------------------------------------------

export function unwrapResultData(data: unknown): unknown {
  if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>).data;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Error message extraction
// ---------------------------------------------------------------------------

export function extractErrorMessage(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;

  const obj = payload as Record<string, unknown>;
  if (typeof obj.error === 'string') return obj.error;
  if (
    obj.error &&
    typeof obj.error === 'object' &&
    typeof (obj.error as Record<string, unknown>).message === 'string'
  ) {
    return (obj.error as Record<string, unknown>).message as string;
  }
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.text === 'string') return obj.text;
  return null;
}
