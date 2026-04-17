/**
 * Config management for the Legion plugin main process.
 * Reads, normalizes, and resolves plugin configuration with sensible defaults.
 * Ported from legion-plugin/main.mjs v0.2.0.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { cleanText, clampNumber } from './utils';
import type { PluginAPI, PluginConfig } from './types';
import {
  DEFAULTS,
  STATUS_POLL_MIN_MS,
  STATUS_POLL_MAX_MS,
  MAX_NOTIFICATIONS,
  EVENT_RECONNECT_MIN_MS,
  EVENT_RECONNECT_MAX_MS,
} from './constants';

/**
 * Reads plugin data from the API and normalizes every field against DEFAULTS.
 * Returns a fully-typed PluginConfig with guaranteed values for every field.
 */
export function getPluginConfig(api: PluginAPI): PluginConfig {
  const data = api.config.getPluginData() || {};
  return {
    ...DEFAULTS,
    ...data,
    enabled: data.enabled !== false,
    daemonUrl: cleanText(data.daemonUrl) || DEFAULTS.daemonUrl,
    configDir: typeof data.configDir === 'string' ? data.configDir.trim() : '',
    apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
    readyPath: cleanText(data.readyPath) || DEFAULTS.readyPath,
    healthPath: cleanText(data.healthPath) || DEFAULTS.healthPath,
    streamPath: cleanText(data.streamPath) || DEFAULTS.streamPath,
    eventsPath: cleanText(data.eventsPath) || DEFAULTS.eventsPath,
    backendEnabled: data.backendEnabled !== false,
    daemonStreaming: data.daemonStreaming !== false,
    notificationsEnabled: data.notificationsEnabled !== false,
    nativeNotifications: data.nativeNotifications !== false,
    autoConnectEvents: data.autoConnectEvents !== false,
    openProactiveThread: Boolean(data.openProactiveThread),
    healthPollMs: clampNumber(data.healthPollMs, STATUS_POLL_MIN_MS, STATUS_POLL_MAX_MS, DEFAULTS.healthPollMs),
    eventsRecentCount: clampNumber(data.eventsRecentCount, 1, MAX_NOTIFICATIONS, DEFAULTS.eventsRecentCount),
    sseReconnectMs: clampNumber(
      data.sseReconnectMs,
      EVENT_RECONNECT_MIN_MS,
      EVENT_RECONNECT_MAX_MS,
      DEFAULTS.sseReconnectMs,
    ),
    workspaceThreadTitle: cleanText(data.workspaceThreadTitle) || DEFAULTS.workspaceThreadTitle,
    proactiveThreadTitle: cleanText(data.proactiveThreadTitle) || DEFAULTS.proactiveThreadTitle,
    bootstrapPrompt:
      typeof data.bootstrapPrompt === 'string' ? data.bootstrapPrompt : DEFAULTS.bootstrapPrompt,
    proactivePromptPrefix: cleanText(data.proactivePromptPrefix) || DEFAULTS.proactivePromptPrefix,
    knowledgeRagEnabled: data.knowledgeRagEnabled !== false,
    knowledgeCaptureEnabled: data.knowledgeCaptureEnabled !== false,
    knowledgeScope: ['global', 'local', 'all'].includes(cleanText(data.knowledgeScope))
      ? cleanText(data.knowledgeScope)
      : DEFAULTS.knowledgeScope,
    triggersEnabled: data.triggersEnabled !== false,
    autoTriage: data.autoTriage !== false,
    triageModel: cleanText(data.triageModel),
    maxConcurrentWorkflows: clampNumber(data.maxConcurrentWorkflows, 1, 10, DEFAULTS.maxConcurrentWorkflows),
    triggerRules: Array.isArray(data.triggerRules)
      ? data.triggerRules.filter(
          (rule: unknown) => rule && typeof rule === 'object',
        )
      : [],
  };
}

/**
 * Resolves the config directory by checking a prioritized list of candidates.
 * Returns the first candidate that exists on disk, or the first candidate if none exist.
 */
export function getResolvedConfigDir(config: PluginConfig): string {
  const candidates: string[] = [];
  if (cleanText(config.configDir)) candidates.push(cleanText(config.configDir));
  candidates.push(join(homedir(), '.kai', 'settings'));
  candidates.push(join(homedir(), '.legion', 'settings'));
  candidates.push(join(homedir(), '.config', 'legion', 'settings'));

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

/**
 * Determines the auth source in use: 'api-key', 'crypt.json', or 'none'.
 */
export function resolveAuthSource(config: PluginConfig): string {
  if (cleanText(config.apiKey)) return 'api-key';
  return resolveAuthToken(config) ? 'crypt.json' : 'none';
}

/**
 * Resolves the auth token for daemon requests.
 * If an API key is configured it is returned directly.
 * Otherwise, attempts to generate a short-lived HS256 JWT from crypt.json's cluster_secret.
 * Returns null if no auth is available.
 */
export function resolveAuthToken(config: PluginConfig): string | null {
  if (cleanText(config.apiKey)) return cleanText(config.apiKey);

  const configDir = getResolvedConfigDir(config);
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
