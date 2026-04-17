/**
 * kai-plugin-legion main entry point.
 *
 * Exports `activate` and `deactivate` as required by the Kai plugin API.
 * Houses the runtime sync loop, dashboard refresh, event loading, notification
 * management, command execution, sub-agent creation, and the generic daemon
 * action passthrough.
 */

import type { PluginAPI, PluginState, DaemonResult, Notification } from './types';
import { getPluginConfig } from './config';
import { getResolvedConfigDir, resolveAuthSource } from './config';
import { daemonJson } from './daemon-client';
import {
  getCurrentState,
  replaceState,
  updateState,
  normalizeNotifications,
  mergeNotifications,
  setNavigationUpdater,
  summarizeTasks,
  summarizeWorkers,
  extractCapabilities,
} from './state';
import { registerUi, updateNavigationItems, updateBanner, updateThreadDecoration, registerConversationDecoration } from './ui';
import { registerTools } from './tools';
import { registerActionHandlers } from './actions';
import { ensureBackendRegistration, isBackendRegistered, setBackendRegistered } from './backend';
import { ensureEventStream, stopEventStream } from './events';
import {
  hydrateManagedConversations,
  ensureProactiveConversation,
  createManagedConversation,
  managedConversationIds,
} from './conversations';
import { hydrateWorkflowStore, refreshWorkflowTasks } from './workflows';
import { BACKEND_KEY, MAX_NOTIFICATIONS } from './constants';
import { cleanText, clampNumber } from './utils';

// -------------------------------------------------------------------------- //
// Module-scoped state                                                         //
// -------------------------------------------------------------------------- //

let currentApi: PluginAPI | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let lastHealthStatus = 'unknown';

// -------------------------------------------------------------------------- //
// Activate / Deactivate                                                       //
// -------------------------------------------------------------------------- //

/**
 * Main plugin activation entry point called by the Kai plugin host.
 */
export async function activate(api: PluginAPI): Promise<void> {
  currentApi = api;
  api.log.info('Activating Legion plugin');

  // Wire navigation updater into state module (breaks circular dep).
  setNavigationUpdater(updateNavigationItems);

  registerUi(api);
  registerTools(api);
  registerActionHandlers(api);
  hydrateManagedConversations(api);
  hydrateWorkflowStore(api);
  await ensureProactiveConversation(api);

  await syncRuntime(api, { reason: 'activate', notify: false, recordHistory: false });
  await loadRecentEvents(api, { initial: true, count: getPluginConfig(api).eventsRecentCount });
  ensureEventStream(api);
  scheduleStatusPoll(api);

  api.config.onChanged(() => {
    scheduleStatusPoll(api);
    ensureEventStream(api);
    void syncRuntime(api, { reason: 'config-changed', notify: false, recordHistory: false });
  });
}

/**
 * Plugin deactivation — clean up timers, event streams, and backend registration.
 */
export async function deactivate(): Promise<void> {
  clearStatusPoll();
  stopEventStream();

  if (isBackendRegistered() && currentApi) {
    try {
      currentApi.agent.unregisterBackend(BACKEND_KEY);
    } catch {
      // Ignore unload-time cleanup failures.
    }
  }

  setBackendRegistered(false);
  currentApi = null;
}

// -------------------------------------------------------------------------- //
// Status poll                                                                 //
// -------------------------------------------------------------------------- //

/**
 * Schedule periodic runtime sync at the configured health-poll interval.
 * Replaces any existing timer.
 */
export function scheduleStatusPoll(api: PluginAPI): void {
  clearStatusPoll();
  const config = getPluginConfig(api);
  if (!config.enabled) return;

  statusPollTimer = setInterval(() => {
    void syncRuntime(api, {
      reason: 'poll',
      notify: false,
      recordHistory: false,
    });
  }, config.healthPollMs);
}

/**
 * Clear the active status poll timer.
 */
export function clearStatusPoll(): void {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

// -------------------------------------------------------------------------- //
// Runtime sync                                                                //
// -------------------------------------------------------------------------- //

export type SyncRuntimeOptions = {
  reason?: string;
  notify?: boolean;
  recordHistory?: boolean;
};

/**
 * The main runtime sync function.  Checks daemon readiness, refreshes the
 * dashboard snapshot and workflow state, updates banner/thread decorations,
 * and emits health-change notifications.
 */
export async function syncRuntime(
  api: PluginAPI,
  options: SyncRuntimeOptions = {},
): Promise<PluginState> {
  const config = getPluginConfig(api);
  ensureBackendRegistration(api, config);

  // --- Plugin disabled ---
  if (!config.enabled) {
    stopEventStream();
    const state = replaceState(api, {
      status: 'disabled',
      configured: false,
      serviceUrl: config.daemonUrl,
      resolvedConfigDir: getResolvedConfigDir(config),
      authSource: resolveAuthSource(config),
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      dashboard: null,
      eventsConnected: false,
      managedConversationIds: [...managedConversationIds],
    }, options);
    updateBanner(api, config, state);
    updateThreadDecoration(api, state, config);
    return state;
  }

  // --- No daemon URL configured ---
  if (!config.daemonUrl) {
    stopEventStream();
    const state = replaceState(api, {
      status: 'unconfigured',
      configured: false,
      serviceUrl: '',
      resolvedConfigDir: getResolvedConfigDir(config),
      authSource: resolveAuthSource(config),
      lastCheckedAt: new Date().toISOString(),
      lastError: 'Legion daemon URL is not configured.',
      dashboard: null,
      eventsConnected: false,
      managedConversationIds: [...managedConversationIds],
    }, options);
    updateBanner(api, config, state);
    updateThreadDecoration(api, state, config);
    return state;
  }

  // --- Checking ---
  replaceState(api, {
    status: 'checking',
    configured: true,
    serviceUrl: config.daemonUrl,
    resolvedConfigDir: getResolvedConfigDir(config),
    authSource: resolveAuthSource(config),
    managedConversationIds: [...managedConversationIds],
  }, {
    reason: options.reason,
    recordHistory: false,
  });

  const dashboardResult = await refreshDashboardSnapshot(api, { persist: false });
  const workflowsResult = await refreshWorkflowTasks(api, { quiet: true });
  const isOnline = Boolean(
    dashboardResult.ok &&
    dashboardResult.snapshot &&
    (dashboardResult.snapshot.readyOk || dashboardResult.snapshot.healthOk),
  );

  const nextState = replaceState(api, {
    status: isOnline ? 'online' : 'offline',
    configured: true,
    serviceUrl: config.daemonUrl,
    resolvedConfigDir: getResolvedConfigDir(config),
    authSource: resolveAuthSource(config),
    lastCheckedAt: new Date().toISOString(),
    lastError: dashboardResult.ok ? null : dashboardResult.error,
    dashboard: dashboardResult.snapshot || null,
    managedConversationIds: [...managedConversationIds],
    workflowRefreshAt: workflowsResult.ok
      ? new Date().toISOString()
      : (getCurrentState(api).workflowRefreshAt ?? null),
  }, options);

  // Health-change notification
  if (
    options.notify !== false &&
    config.notificationsEnabled &&
    lastHealthStatus !== 'unknown' &&
    lastHealthStatus !== (nextState as Record<string, unknown>).status
  ) {
    const status = (nextState as Record<string, unknown>).status as string;
    api.notifications.show({
      id: `daemon-health-${Date.now()}`,
      title: status === 'online' ? 'Legion daemon is online' : 'Legion daemon is offline',
      body: status === 'online'
        ? 'The Legion daemon responded successfully.'
        : ((nextState as Record<string, unknown>).lastError as string || 'The Legion daemon health check failed.'),
      level: status === 'online' ? 'success' : 'warning',
      native: config.nativeNotifications,
      autoDismissMs: 5_000,
      target: { type: 'panel', panelId: 'dashboard' },
    });
  }

  lastHealthStatus = (nextState as Record<string, unknown>).status as string;
  updateBanner(api, config, nextState);
  updateThreadDecoration(api, nextState, config);
  ensureEventStream(api);
  return nextState;
}

// -------------------------------------------------------------------------- //
// Dashboard snapshot                                                          //
// -------------------------------------------------------------------------- //

export type DashboardSnapshot = {
  updatedAt: string;
  readyOk: boolean;
  healthOk: boolean;
  ready: unknown;
  health: unknown;
  tasksSummary: ReturnType<typeof summarizeTasks>;
  workersSummary: ReturnType<typeof summarizeWorkers>;
  extensionsCount: number;
  gaia: unknown;
  metering: unknown;
  capabilities: unknown[];
  githubStatus: unknown;
  knowledgeStatus: unknown;
};

/**
 * Fetch all dashboard endpoints in parallel and build a snapshot.
 * Optionally persists the snapshot into plugin state.
 */
export async function refreshDashboardSnapshot(
  api: PluginAPI,
  options: { persist?: boolean } = {},
): Promise<{ ok: boolean; error?: string; snapshot: DashboardSnapshot | null }> {
  const config = getPluginConfig(api);

  const [
    readyResult,
    healthResult,
    tasksResult,
    workersResult,
    extensionsResult,
    gaiaResult,
    meteringResult,
    capabilitiesResult,
    githubStatusResult,
    knowledgeStatusResult,
  ] = await Promise.all([
    daemonJson(api, config.readyPath, { quiet: true }),
    daemonJson(api, config.healthPath, { quiet: true }),
    daemonJson(api, '/api/tasks', { quiet: true }),
    daemonJson(api, '/api/workers', { quiet: true }),
    daemonJson(api, '/api/extensions', { quiet: true }),
    daemonJson(api, '/api/gaia/status', { quiet: true }),
    daemonJson(api, '/api/metering', { quiet: true }),
    daemonJson(api, '/api/capabilities', { quiet: true }),
    daemonJson(api, '/api/github/status', { quiet: true }),
    daemonJson(api, '/api/apollo/status', { quiet: true }),
  ]);

  const snapshot: DashboardSnapshot = {
    updatedAt: new Date().toISOString(),
    readyOk: Boolean(readyResult.ok),
    healthOk: Boolean(healthResult.ok),
    ready: readyResult.data ?? null,
    health: healthResult.data ?? null,
    tasksSummary: summarizeTasks(tasksResult.data),
    workersSummary: summarizeWorkers(workersResult.data),
    extensionsCount: Array.isArray(extensionsResult.data) ? extensionsResult.data.length : 0,
    gaia: gaiaResult.data ?? null,
    metering: meteringResult.data ?? null,
    capabilities: extractCapabilities(capabilitiesResult.data),
    githubStatus: githubStatusResult.data ?? null,
    knowledgeStatus: knowledgeStatusResult.data ?? null,
  };

  const ok = snapshot.readyOk || snapshot.healthOk;
  const error =
    readyResult.error || healthResult.error || tasksResult.error || workersResult.error || undefined;

  if (options.persist !== false) {
    replaceState(api, { dashboard: snapshot });
  }

  return { ok, error, snapshot };
}

// -------------------------------------------------------------------------- //
// Recent events                                                               //
// -------------------------------------------------------------------------- //

/**
 * Fetch recent events from the daemon and merge them into the notification list.
 */
export async function loadRecentEvents(
  api: PluginAPI,
  options: { initial?: boolean; count?: number } = {},
): Promise<DaemonResult> {
  const config = getPluginConfig(api);
  const count = clampNumber(options.count, 1, MAX_NOTIFICATIONS, config.eventsRecentCount);

  const result = await daemonJson(api, '/api/events/recent', {
    quiet: options.initial === true,
    query: { count: String(count) },
  });

  if (!result.ok) return result;

  const rawItems = Array.isArray(result.data)
    ? result.data
    : Array.isArray((result.data as Record<string, unknown> | undefined)?.events)
      ? (result.data as Record<string, unknown>).events as unknown[]
      : [];

  // Lazy import to avoid circular dep at module init.
  const { classifyDaemonEvent } = await import('./events-classify');

  const incoming: Notification[] = rawItems.map((event) => ({
    ...classifyDaemonEvent(event),
    read: options.initial === true,
  }));

  const state = updateState(api, (previous) => ({
    ...previous,
    notifications: mergeNotifications(previous.notifications, incoming),
  }), {
    reason: options.initial === true ? 'events-hydrated' : 'events-refreshed',
    recordHistory: false,
  });

  return { ok: true, data: (state as Record<string, unknown>).notifications };
}

// -------------------------------------------------------------------------- //
// Daemon command execution                                                    //
// -------------------------------------------------------------------------- //

/**
 * Send a natural-language command to the daemon router (`/api/do`).
 */
export async function executeDaemonCommand(
  api: PluginAPI,
  input: string,
): Promise<DaemonResult> {
  if (!input) return { ok: false, error: 'Command text is required.' };

  const result = await daemonJson(api, '/api/do', {
    method: 'POST',
    body: { input },
  });

  replaceState(api, {
    lastCommandResult: {
      input,
      result: result.data ?? null,
      error: result.error || null,
      completedAt: new Date().toISOString(),
    },
  });

  return result;
}

// -------------------------------------------------------------------------- //
// Sub-agent creation                                                          //
// -------------------------------------------------------------------------- //

/**
 * Create a daemon sub-agent via the LLM inference endpoint.
 * On success, creates a managed conversation decorated with the task status.
 */
export async function createDaemonSubAgent(
  api: PluginAPI,
  options: { message: string; model?: string; parentConversationId?: string },
): Promise<DaemonResult> {
  if (!options.message) return { ok: false, error: 'A message is required.' };

  const result = await daemonJson(api, '/api/llm/inference', {
    method: 'POST',
    body: {
      messages: [{ role: 'user', content: options.message }],
      ...(options.model ? { model: options.model } : {}),
      sub_agent: true,
      parent_id: options.parentConversationId || undefined,
    },
    timeoutMs: 30_000,
  });

  if (result.ok && result.data) {
    const data = result.data as Record<string, unknown>;
    const taskId = data.task_id as string | undefined;
    const taskStatus = data.status as string | undefined;

    if (taskId) {
      const conversation = await createManagedConversation(api, {
        title: `Sub-agent: ${taskId.slice(0, 8)}`,
        kind: 'subagent',
        open: false,
      });
      const conversationId = conversation.conversationId as string;
      if (conversationId) {
        const statusLabel = taskStatus
          ? `Legion \u00b7 sub-agent \u00b7 ${taskStatus}`
          : 'Legion \u00b7 sub-agent';
        registerConversationDecoration(api, conversationId, statusLabel);
      }
    }
  }

  return result;
}

// -------------------------------------------------------------------------- //
// Notification helpers                                                        //
// -------------------------------------------------------------------------- //

/**
 * Mark all notifications as read.
 */
export async function markAllNotificationsRead(api: PluginAPI): Promise<DaemonResult> {
  const state = replaceState(api, {
    notifications: normalizeNotifications(
      (getCurrentState(api) as Record<string, unknown>).notifications,
    ).map((notification) => ({
      ...notification,
      read: true,
    })),
  }, {
    reason: 'notifications-read',
    recordHistory: false,
  });
  return { ok: true, data: (state as Record<string, unknown>).notifications };
}

/**
 * Clear all notifications.
 */
export async function clearNotifications(api: PluginAPI): Promise<DaemonResult> {
  const state = replaceState(api, {
    notifications: [],
  }, {
    reason: 'notifications-cleared',
    recordHistory: false,
  });
  return { ok: true, data: (state as Record<string, unknown>).notifications };
}

/**
 * Set the read state of a single notification by ID.
 */
export async function setNotificationReadState(
  api: PluginAPI,
  id: string,
  read: boolean,
): Promise<DaemonResult> {
  if (!id) return { ok: false, error: 'Notification id is required.' };

  const state = replaceState(api, {
    notifications: normalizeNotifications(
      (getCurrentState(api) as Record<string, unknown>).notifications,
    ).map((notification) =>
      notification.id === id ? { ...notification, read } : notification,
    ),
  }, {
    reason: 'notification-updated',
    recordHistory: false,
  });

  return { ok: true, data: (state as Record<string, unknown>).notifications };
}

// -------------------------------------------------------------------------- //
// Generic daemon action passthrough                                           //
// -------------------------------------------------------------------------- //

/**
 * Execute a generic daemon call with path, method, query, and body.
 * Optionally triggers a runtime refresh after success.
 */
export async function daemonAction(
  api: PluginAPI,
  data: Record<string, unknown> | undefined,
): Promise<DaemonResult> {
  const path = cleanText(data?.path as string);
  if (!path) return { ok: false, error: 'A daemon path is required.' };

  const result = await daemonJson(api, path, {
    method: cleanText(data?.method as string).toUpperCase() || 'GET',
    query: data?.query && typeof data.query === 'object'
      ? data.query as Record<string, string>
      : undefined,
    body: data?.body,
    fallbackPath: cleanText(data?.fallbackPath as string) || undefined,
    timeoutMs: clampNumber(data?.timeoutMs, 1_000, 120_000, 15_000),
    expectText: Boolean(data?.expectText),
    quiet: Boolean(data?.quiet),
  });

  if (result.ok && data?.refreshRuntime) {
    void syncRuntime(api, { reason: 'daemon-call-refresh', notify: false, recordHistory: false });
  }

  return result;
}
