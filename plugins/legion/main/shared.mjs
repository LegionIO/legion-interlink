import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export const SETTINGS_COMPONENT = 'LegionSettings';
export const PANEL_COMPONENT = 'LegionWorkspace';
export const BACKEND_KEY = 'legion';
export const BANNER_ID = 'legion-status';
export const THREAD_STATUS_ID = 'legion-runtime-status';
export const PROACTIVE_THREAD_ID = '__legion_proactive__';
export const STATUS_POLL_MIN_MS = 15_000;
export const STATUS_POLL_MAX_MS = 5 * 60_000;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const EVENT_RECONNECT_MIN_MS = 2_000;
export const EVENT_RECONNECT_MAX_MS = 60_000;
export const MAX_NOTIFICATIONS = 200;
export const MAX_WORKFLOWS = 100;
export const MAX_PROACTIVE_MESSAGES = 50;

export const PANEL_DEFINITIONS = [
  {
    id: 'dashboard',
    navId: 'legion-dashboard',
    title: 'Mission Control',
    icon: 'gauge',
    priority: 20,
    width: 'full',
    view: 'dashboard',
  },
  {
    id: 'notifications',
    navId: 'legion-notifications',
    title: 'Notifications',
    icon: 'bell',
    priority: 21,
    width: 'wide',
    view: 'notifications',
  },
  {
    id: 'operations',
    navId: 'legion-operations',
    title: 'Operations',
    icon: 'terminal',
    priority: 22,
    width: 'wide',
    view: 'operations',
  },
  {
    id: 'knowledge',
    navId: 'legion-knowledge',
    title: 'Knowledge',
    icon: 'database',
    priority: 23,
    width: 'full',
    view: 'knowledge',
  },
  {
    id: 'github',
    navId: 'legion-github',
    title: 'GitHub',
    icon: 'git',
    priority: 24,
    width: 'full',
    view: 'github',
  },
  {
    id: 'marketplace',
    navId: 'legion-marketplace',
    title: 'Marketplace',
    icon: 'puzzle',
    priority: 25,
    width: 'full',
    view: 'marketplace',
  },
  {
    id: 'workflows',
    navId: 'legion-workflows',
    title: 'Workflows',
    icon: 'activity',
    priority: 26,
    width: 'full',
    view: 'workflows',
  },
];

export const DEFAULTS = {
  enabled: true,
  daemonUrl: 'http://127.0.0.1:4567',
  configDir: '',
  apiKey: '',
  readyPath: '/api/ready',
  healthPath: '/api/health',
  streamPath: '/api/llm/inference',
  eventsPath: '/api/events',
  backendEnabled: true,
  daemonStreaming: true,
  notificationsEnabled: true,
  nativeNotifications: true,
  autoConnectEvents: true,
  openProactiveThread: false,
  healthPollMs: 60_000,
  eventsRecentCount: 50,
  sseReconnectMs: 5_000,
  workspaceThreadTitle: 'Legion Workspace',
  proactiveThreadTitle: 'GAIA Activity',
  bootstrapPrompt: 'Legion workspace ready. Use this thread for background coordination, backend-specific workflows, or plugin-triggered tasks.',
  proactivePromptPrefix: 'Proactive daemon activity',
  knowledgeRagEnabled: true,
  knowledgeCaptureEnabled: true,
  knowledgeScope: 'all',
  triggersEnabled: true,
  autoTriage: true,
  triageModel: '',
  maxConcurrentWorkflows: 3,
  triggerRules: [],
};

export const TOAST_TYPES = new Set([
  'task.completed',
  'task.failed',
  'task.error',
  'worker.error',
  'worker.degraded',
  'worker.offline',
  'extension.error',
  'extension.installed',
  'extension.uninstalled',
  'gaia.phase_change',
  'gaia.alert',
  'mesh.peer_joined',
  'mesh.peer_lost',
  'governance.approval_required',
  'health.degraded',
  'health.recovered',
  'alert',
  'error',
  'proactive.message',
  'proactive.insight',
  'proactive.check_in',
  'trigger.needs_input',
  'trigger.resolved',
]);

export const SEVERITY_MAP = {
  error: 'error',
  failure: 'error',
  failed: 'error',
  warning: 'warn',
  warn: 'warn',
  degraded: 'warn',
  success: 'success',
  completed: 'success',
  healthy: 'success',
};

export const workflowStore = new Map();
export const managedConversationIds = new Set();

export const runtimeState = {
  currentApi: null,
  statusPollTimer: null,
  backendRegistered: false,
  lastHealthStatus: 'unknown',
  eventsController: null,
  eventsReconnectTimer: null,
  zodToJsonSchemaModule: null,
  zodToJsonSchemaPromise: null,
};

export function getPluginConfig(api) {
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
    sseReconnectMs: clampNumber(data.sseReconnectMs, EVENT_RECONNECT_MIN_MS, EVENT_RECONNECT_MAX_MS, DEFAULTS.sseReconnectMs),
    workspaceThreadTitle: cleanText(data.workspaceThreadTitle) || DEFAULTS.workspaceThreadTitle,
    proactiveThreadTitle: cleanText(data.proactiveThreadTitle) || DEFAULTS.proactiveThreadTitle,
    bootstrapPrompt: typeof data.bootstrapPrompt === 'string' ? data.bootstrapPrompt : DEFAULTS.bootstrapPrompt,
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
    triggerRules: Array.isArray(data.triggerRules) ? data.triggerRules.filter((rule) => rule && typeof rule === 'object') : [],
  };
}

export function getResolvedConfigDir(config) {
  const candidates = [];
  if (cleanText(config.configDir)) candidates.push(cleanText(config.configDir));
  candidates.push(join(homedir(), '.kai', 'settings'));
  candidates.push(join(homedir(), '.legion', 'settings'));
  candidates.push(join(homedir(), '.config', 'legion', 'settings'));

  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

export function getCurrentState(api) {
  return api.state.get() || {};
}

export function replaceState(api, nextState, options = {}) {
  const previous = getCurrentState(api);
  const next = {
    ...previous,
    ...nextState,
  };

  next.notifications = normalizeNotifications(next.notifications);
  next.unreadNotificationCount = next.notifications.filter((item) => !item.read).length;
  next.recentEvents = next.notifications.slice(0, 12).map((notification) => ({
    id: notification.id,
    timestamp: notification.timestamp,
    reason: notification.type,
    status: notification.severity,
    summary: notification.title,
  }));
  next.workflows = normalizeWorkflows(next.workflows);
  next.workflowCounts = summarizeWorkflows(next.workflows);
  next.proactiveMessages = normalizeProactiveMessages(next.proactiveMessages);
  next.managedConversationIds = [...new Set(Array.isArray(next.managedConversationIds) ? next.managedConversationIds : [])];
  next.backendRegistered = runtimeState.backendRegistered;
  next.backendKey = BACKEND_KEY;
  next.lastUpdatedAt = new Date().toISOString();

  api.state.replace(next);
  if (options.reason) {
    api.state.emitEvent('runtime-updated', {
      reason: options.reason,
      state: next,
    });
  }
  return next;
}

export function updateState(api, updater, options = {}) {
  const previous = getCurrentState(api);
  const next = updater(previous);
  return replaceState(api, next, options);
}

export function normalizeNotifications(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' && entry.id
      ? entry.id
      : `${entry.type || 'event'}-${entry.timestamp || Date.now()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      type: cleanText(entry.type) || 'event',
      severity: ['error', 'warn', 'success', 'info'].includes(cleanText(entry.severity)) ? cleanText(entry.severity) : 'info',
      title: cleanText(entry.title) || cleanText(entry.type) || 'Event',
      message: typeof entry.message === 'string' ? entry.message : '',
      source: cleanText(entry.source) || '',
      timestamp: cleanText(entry.timestamp) || new Date().toISOString(),
      read: Boolean(entry.read),
      raw: entry.raw ?? null,
    });
    if (next.length >= MAX_NOTIFICATIONS) break;
  }

  return next;
}

export function normalizeWorkflows(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    next.push({
      id: entry.id,
      source: cleanText(entry.source) || 'unknown',
      eventType: cleanText(entry.eventType) || 'event',
      action: cleanText(entry.action) || 'observe',
      status: cleanText(entry.status) || 'pending',
      startedAt: cleanText(entry.startedAt) || new Date().toISOString(),
      updatedAt: cleanText(entry.updatedAt) || cleanText(entry.startedAt) || new Date().toISOString(),
      taskId: cleanText(entry.taskId) || '',
      payload: entry.payload ?? null,
      summary: cleanText(entry.summary),
      error: cleanText(entry.error),
    });
    if (next.length >= MAX_WORKFLOWS) break;
  }

  return next.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export function normalizeProactiveMessages(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' && entry.id
      ? entry.id
      : `${entry.timestamp || Date.now()}-${entry.intent || 'proactive'}`;
    if (seen.has(id)) continue;
    seen.add(id);
    next.push({
      id,
      intent: cleanText(entry.intent) || 'insight',
      content: typeof entry.content === 'string' ? entry.content : '',
      source: cleanText(entry.source) || 'daemon',
      timestamp: cleanText(entry.timestamp) || new Date().toISOString(),
      metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {},
    });
    if (next.length >= MAX_PROACTIVE_MESSAGES) break;
  }

  return next;
}

export function summarizeWorkflows(workflows) {
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

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

export function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function safeStringify(value, spacing = 0) {
  try {
    return JSON.stringify(value, null, spacing);
  } catch {
    return String(value);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
