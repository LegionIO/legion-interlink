/**
 * Constants for the Legion plugin main process.
 * Ported from legion-plugin/main.mjs v0.2.0.
 */

import type { PanelDefinition, PluginConfig, TriggerRule } from './types';

// ---------------------------------------------------------------------------
// Component & identifier constants
// ---------------------------------------------------------------------------

export const SETTINGS_COMPONENT = 'LegionSettings';
export const PANEL_COMPONENT = 'LegionWorkspace';
export const BANNER_COMPONENT = 'LegionStatusBanner';
export const BACKEND_KEY = 'legion';
export const BANNER_ID = 'legion-status';
export const THREAD_STATUS_ID = 'legion-runtime-status';
export const PROACTIVE_THREAD_ID = '__legion_proactive__';

// ---------------------------------------------------------------------------
// Timing constants
// ---------------------------------------------------------------------------

export const STATUS_POLL_MIN_MS = 15_000;
export const STATUS_POLL_MAX_MS = 5 * 60_000;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const EVENT_RECONNECT_MIN_MS = 2_000;
export const EVENT_RECONNECT_MAX_MS = 60_000;

// ---------------------------------------------------------------------------
// Max limits
// ---------------------------------------------------------------------------

export const MAX_NOTIFICATIONS = 200;
export const MAX_WORKFLOWS = 100;
export const MAX_PROACTIVE_MESSAGES = 50;

// ---------------------------------------------------------------------------
// Circuit breaker recheck interval (ms)
// ---------------------------------------------------------------------------

export const CIRCUIT_BREAKER_RECHECK_MS = 30_000;

// ---------------------------------------------------------------------------
// User-agent string
// ---------------------------------------------------------------------------

export const USER_AGENT = 'kai-legion-plugin/1.0';

// ---------------------------------------------------------------------------
// Panel definitions (8 panels including subagents)
// ---------------------------------------------------------------------------

export const PANEL_DEFINITIONS: PanelDefinition[] = [
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
  {
    id: 'subagents',
    navId: 'legion-subagents',
    title: 'Sub-Agents',
    icon: 'bot',
    priority: 27,
    width: 'full',
    view: 'subagents',
  },
];

// ---------------------------------------------------------------------------
// Toast types — event types that should trigger a toast notification
// ---------------------------------------------------------------------------

export const TOAST_TYPES: Set<string> = new Set([
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

// ---------------------------------------------------------------------------
// Severity mapping — daemon severity strings to normalized severity levels
// ---------------------------------------------------------------------------

export const SEVERITY_MAP: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Default config values (all 28 fields)
// ---------------------------------------------------------------------------

export const DEFAULTS: Omit<PluginConfig, 'triggerRules'> & { triggerRules: TriggerRule[] } = {
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
  bootstrapPrompt:
    'Legion workspace ready. Use this thread for background coordination, backend-specific workflows, or plugin-triggered tasks.',
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
