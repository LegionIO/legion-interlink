import type { PluginAPI } from './types.js';
import type { PluginConfig, PluginState, Notification, Workflow, ProactiveMessage } from './types.js';
import {
  BACKEND_KEY,
  MAX_NOTIFICATIONS,
  MAX_WORKFLOWS,
  MAX_PROACTIVE_MESSAGES,
} from './constants.js';
import { cleanText } from './utils.js';

// ---------------------------------------------------------------------------
// Module-scoped stores
// ---------------------------------------------------------------------------

const workflowStore: Map<string, Workflow> = new Map();
const managedConversationIds: Set<string> = new Set();

// ---------------------------------------------------------------------------
// Store accessors
// ---------------------------------------------------------------------------

export function getWorkflowStore(): Map<string, Workflow> {
  return workflowStore;
}

export function getManagedConversationIds(): Set<string> {
  return managedConversationIds;
}

// ---------------------------------------------------------------------------
// State read / write
// ---------------------------------------------------------------------------

export function getCurrentState(api: PluginAPI): PluginState {
  return (api.state.get() || {}) as PluginState;
}

export type ReplaceStateOptions = {
  reason?: string;
  recordHistory?: boolean;
};

/**
 * Merge `nextState` into the current plugin state, normalize derived fields,
 * persist via the plugin API, and update navigation badges.
 *
 * To avoid a direct circular import with `ui.ts`, the navigation-item updater
 * is injected at module init time via {@link setNavigationUpdater}.
 */
export function replaceState(
  api: PluginAPI,
  nextState: Partial<PluginState>,
  options: ReplaceStateOptions = {},
): PluginState {
  const previous = getCurrentState(api);
  const next: PluginState = {
    ...previous,
    ...nextState,
  };

  // Normalize collections --------------------------------------------------
  next.notifications = normalizeNotifications(next.notifications);
  next.unreadNotificationCount = (next.notifications as Notification[]).filter(
    (item) => !item.read,
  ).length;
  next.recentEvents = (next.notifications as Notification[]).slice(0, 12).map((notification) => ({
    id: notification.id,
    timestamp: notification.timestamp,
    reason: notification.type,
    status: notification.severity,
    summary: notification.title,
  }));
  next.workflows = normalizeWorkflows(next.workflows);
  next.workflowCounts = summarizeWorkflows(next.workflows as Workflow[]);
  next.proactiveMessages = normalizeProactiveMessages(next.proactiveMessages);
  next.managedConversationIds = [
    ...new Set(
      Array.isArray(next.managedConversationIds)
        ? (next.managedConversationIds as string[])
        : [],
    ),
  ];
  next.backendRegistered = (next as Record<string, unknown>).backendRegistered as boolean | undefined;
  next.backendKey = BACKEND_KEY;
  next.lastUpdatedAt = new Date().toISOString();

  api.state.replace(next as Record<string, unknown>);

  if (options.reason) {
    api.state.emitEvent('runtime-updated', {
      reason: options.reason,
      state: next,
    });
  }

  // Update navigation badges via injected callback -------------------------
  if (_navigationUpdater) {
    _navigationUpdater(api, next);
  }

  return next;
}

export function updateState(
  api: PluginAPI,
  updater: (prev: PluginState) => PluginState,
  options: ReplaceStateOptions = {},
): PluginState {
  const previous = getCurrentState(api);
  const next = updater(previous);
  return replaceState(api, next, options);
}

// ---------------------------------------------------------------------------
// Navigation updater injection (avoids circular dep with ui.ts)
// ---------------------------------------------------------------------------

type NavigationUpdater = (api: PluginAPI, state: PluginState) => void;
let _navigationUpdater: NavigationUpdater | null = null;

export function setNavigationUpdater(fn: NavigationUpdater): void {
  _navigationUpdater = fn;
}

// ---------------------------------------------------------------------------
// Normalize helpers
// ---------------------------------------------------------------------------

export function normalizeNotifications(value: unknown): Notification[] {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const next: Notification[] = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const id =
      typeof raw.id === 'string' && raw.id
        ? raw.id
        : `${raw.type || 'event'}-${raw.timestamp || Date.now()}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const severityCandidate = cleanText(raw.severity as string | undefined);
    const severity: Notification['severity'] =
      severityCandidate === 'error' ||
      severityCandidate === 'warn' ||
      severityCandidate === 'success' ||
      severityCandidate === 'info'
        ? severityCandidate
        : 'info';

    next.push({
      id,
      type: cleanText(raw.type as string | undefined) || 'event',
      severity,
      title:
        cleanText(raw.title as string | undefined) ||
        cleanText(raw.type as string | undefined) ||
        'Event',
      message: typeof raw.message === 'string' ? raw.message : '',
      source: cleanText(raw.source as string | undefined) || '',
      timestamp:
        cleanText(raw.timestamp as string | undefined) || new Date().toISOString(),
      read: Boolean(raw.read),
      raw: (raw.raw as unknown) ?? null,
    });
    if (next.length >= MAX_NOTIFICATIONS) break;
  }

  return next;
}

export function normalizeWorkflows(value: unknown): Workflow[] {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const next: Workflow[] = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== 'string') continue;
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    next.push({
      id: raw.id,
      source: cleanText(raw.source as string | undefined) || 'unknown',
      eventType: cleanText(raw.eventType as string | undefined) || 'event',
      action: cleanText(raw.action as string | undefined) || 'observe',
      status: cleanText(raw.status as string | undefined) || 'pending',
      startedAt:
        cleanText(raw.startedAt as string | undefined) || new Date().toISOString(),
      updatedAt:
        cleanText(raw.updatedAt as string | undefined) ||
        cleanText(raw.startedAt as string | undefined) ||
        new Date().toISOString(),
      taskId: cleanText(raw.taskId as string | undefined) || '',
      payload: (raw.payload as unknown) ?? null,
      summary: cleanText(raw.summary as string | undefined),
      error: cleanText(raw.error as string | undefined),
    });
    if (next.length >= MAX_WORKFLOWS) break;
  }

  return next.sort((left, right) =>
    String(right.updatedAt).localeCompare(String(left.updatedAt)),
  );
}

export function normalizeProactiveMessages(value: unknown): ProactiveMessage[] {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const next: ProactiveMessage[] = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const id =
      typeof raw.id === 'string' && raw.id
        ? raw.id
        : `${raw.timestamp || Date.now()}-${raw.intent || 'proactive'}`;
    if (seen.has(id)) continue;
    seen.add(id);

    next.push({
      id,
      intent: cleanText(raw.intent as string | undefined) || 'insight',
      content: typeof raw.content === 'string' ? raw.content : '',
      source: cleanText(raw.source as string | undefined) || 'daemon',
      timestamp:
        cleanText(raw.timestamp as string | undefined) || new Date().toISOString(),
      metadata:
        raw.metadata && typeof raw.metadata === 'object'
          ? (raw.metadata as Record<string, unknown>)
          : {},
    });
    if (next.length >= MAX_PROACTIVE_MESSAGES) break;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

export function summarizeWorkflows(workflows: Workflow[]): {
  total: number;
  active: number;
  needsInput: number;
  failed: number;
  resolved: number;
} {
  const summary = { total: 0, active: 0, needsInput: 0, failed: 0, resolved: 0 };
  for (const workflow of workflows) {
    summary.total += 1;
    if (workflow.status === 'pending' || workflow.status === 'running') summary.active += 1;
    if (workflow.status === 'needs-input') summary.needsInput += 1;
    if (workflow.status === 'failed') summary.failed += 1;
    if (workflow.status === 'resolved') summary.resolved += 1;
  }
  return summary;
}

export function summarizeTasks(data: unknown): {
  total: number;
  running: number;
  completed: number;
  failed: number;
} {
  const items = Array.isArray(data) ? data : [];
  return {
    total: items.length,
    running: items.filter((item) =>
      matchesAnyStatus((item as Record<string, unknown>)?.status, [
        'running',
        'active',
        'queued',
      ]),
    ).length,
    completed: items.filter((item) =>
      matchesAnyStatus((item as Record<string, unknown>)?.status, [
        'completed',
        'done',
        'resolved',
      ]),
    ).length,
    failed: items.filter((item) =>
      matchesAnyStatus((item as Record<string, unknown>)?.status, ['failed', 'error']),
    ).length,
  };
}

export function summarizeWorkers(data: unknown): {
  total: number;
  healthy: number;
  degraded: number;
} {
  const items = Array.isArray(data) ? data : [];
  return {
    total: items.length,
    healthy: items.filter((item) =>
      matchesAnyStatus((item as Record<string, unknown>)?.status, [
        'healthy',
        'active',
        'running',
      ]),
    ).length,
    degraded: items.filter((item) =>
      matchesAnyStatus((item as Record<string, unknown>)?.status, [
        'degraded',
        'unhealthy',
        'warning',
      ]),
    ).length,
  };
}

export function extractCapabilities(data: unknown): unknown[] {
  const asRecord = data as Record<string, unknown> | null | undefined;
  const items = Array.isArray(data)
    ? data
    : Array.isArray(asRecord?.capabilities)
      ? (asRecord!.capabilities as unknown[])
      : [];
  return items.slice(0, 20);
}

export function matchesAnyStatus(status: unknown, expected: string[]): boolean {
  const normalized = cleanText(status as string | undefined).toLowerCase();
  return expected.includes(normalized);
}

// ---------------------------------------------------------------------------
// Merge notifications (incoming first so newest appear on top, then dedup)
// ---------------------------------------------------------------------------

export function mergeNotifications(
  existing: unknown,
  incoming: unknown,
): Notification[] {
  const combined = [
    ...(Array.isArray(incoming) ? incoming : []),
    ...(Array.isArray(existing) ? existing : []),
  ];
  return normalizeNotifications(combined);
}
