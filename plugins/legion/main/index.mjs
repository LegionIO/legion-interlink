import {
  BACKEND_KEY,
  MAX_NOTIFICATIONS,
  PANEL_DEFINITIONS,
  SETTINGS_COMPONENT,
  cleanText,
  clampNumber,
  getPluginConfig,
  runtimeState,
} from './shared.mjs';
import {
  createDaemonSubAgent,
  daemonAction,
  daemonJson,
  executeDaemonCommand,
  knowledgeBrowse,
  knowledgeDelete,
  knowledgeIngestContent,
  knowledgeIngestFile,
  knowledgeMonitorAdd,
  knowledgeMonitorRemove,
  knowledgeMonitorsList,
  knowledgeMonitorScan,
  knowledgeQuery,
  runDoctorChecks,
} from './daemon-backend.mjs';
import {
  clearNotifications,
  clearStatusPoll,
  createManagedConversation,
  ensureEventStream,
  ensureProactiveConversation,
  hydrateManagedConversations,
  hydrateWorkflowStore,
  loadRecentEvents,
  markAllNotificationsRead,
  openProactiveConversation,
  refreshDashboardSnapshot,
  refreshWorkflowTasks,
  registerUi,
  scheduleStatusPoll,
  setNotificationReadState,
  stopEventStream,
  syncRuntime,
} from './runtime.mjs';

export async function activate(api) {
  runtimeState.currentApi = api;
  api.log.info('Activating Legion plugin');

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

export async function deactivate() {
  clearStatusPoll();
  stopEventStream();

  if (runtimeState.backendRegistered && runtimeState.currentApi) {
    try {
      runtimeState.currentApi.agent.unregisterBackend(BACKEND_KEY);
    } catch {}
  }

  runtimeState.backendRegistered = false;
  runtimeState.currentApi = null;
  runtimeState.lastHealthStatus = 'unknown';
}

function registerTools(api) {
  api.tools.register([
    {
      name: 'refresh_status',
      description: 'Refresh Legion daemon health, dashboard state, workflows, and plugin status.',
      inputSchema: {
        type: 'object',
        properties: {
          notify: { type: 'boolean', default: false },
        },
      },
      execute: async ({ notify = false }) => {
        const state = await syncRuntime(api, {
          reason: 'tool-refresh',
          notify,
          recordHistory: true,
        });
        return { ok: true, state };
      },
    },
    {
      name: 'create_thread',
      description: 'Create a Legion-managed conversation, optionally opening it immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          prompt: { type: 'string' },
          open: { type: 'boolean', default: true },
        },
      },
      execute: async ({ title, prompt, open = true }) => createManagedConversation(api, {
        title,
        prompt,
        open,
        kind: 'workspace',
      }),
    },
    {
      name: 'open_panel',
      description: 'Open a Legion control panel in Kai.',
      inputSchema: {
        type: 'object',
        properties: {
          panelId: {
            type: 'string',
            default: PANEL_DEFINITIONS[0].id,
          },
        },
      },
      execute: async ({ panelId = PANEL_DEFINITIONS[0].id }) => {
        api.navigation.open({ type: 'panel', panelId });
        return { ok: true, panelId };
      },
    },
    {
      name: 'execute_command',
      description: 'Send a natural language command to the Legion daemon router.',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        required: ['input'],
      },
      execute: async ({ input }) => executeDaemonCommand(api, input),
    },
    {
      name: 'knowledge_query',
      description: 'Query Legion knowledge / Apollo for relevant entries.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
      execute: async ({ query, limit = 10 }) => knowledgeQuery(api, query, limit),
    },
  ]);
}

function registerActionHandlers(api) {
  const handleAction = async (action, data) => {
    switch (action) {
      case 'refresh-status':
        return syncRuntime(api, { reason: 'manual-refresh', notify: false, recordHistory: true });

      case 'refresh-dashboard':
        return refreshDashboardSnapshot(api, { persist: true });

      case 'run-doctor':
        return runDoctorChecks(api);

      case 'open-panel':
        api.navigation.open({
          type: 'panel',
          panelId: cleanText(data?.panelId) || PANEL_DEFINITIONS[0].id,
        });
        return { ok: true };

      case 'create-thread':
        return createManagedConversation(api, {
          title: data?.title,
          prompt: data?.prompt,
          open: data?.open !== false,
          kind: cleanText(data?.kind) || 'workspace',
        });

      case 'open-proactive-thread':
        return openProactiveConversation(api);

      case 'load-recent-events':
        return loadRecentEvents(api, {
          count: clampNumber(data?.count, 1, MAX_NOTIFICATIONS, getPluginConfig(api).eventsRecentCount),
        });

      case 'notification-mark-read':
        return setNotificationReadState(api, cleanText(data?.id), true);

      case 'notification-mark-all-read':
        return markAllNotificationsRead(api);

      case 'notification-clear':
        return clearNotifications(api);

      case 'execute-command':
        return executeDaemonCommand(api, cleanText(data?.input));

      case 'create-subagent':
        return createDaemonSubAgent(api, {
          message: cleanText(data?.message),
          model: cleanText(data?.model) || undefined,
          parentConversationId: cleanText(data?.parentConversationId) || undefined,
        });

      case 'refresh-workflows':
        return refreshWorkflowTasks(api);

      case 'open-external':
        if (!cleanText(data?.url)) {
          return { ok: false, error: 'A URL is required.' };
        }
        await api.shell.openExternal(String(data.url));
        return { ok: true };

      case 'daemon-call':
        return daemonAction(api, data, {
          onRefreshRuntime: () => syncRuntime(api, { reason: 'daemon-call-refresh', notify: false, recordHistory: false }),
        });

      case 'knowledge-query':
        return knowledgeQuery(api, cleanText(data?.query), clampNumber(data?.limit, 1, 100, 10));

      case 'knowledge-browse':
        return knowledgeBrowse(api, data?.filters || {});

      case 'knowledge-ingest-content':
        return knowledgeIngestContent(api, cleanText(data?.content), data?.metadata || {});

      case 'knowledge-ingest-file':
        return knowledgeIngestFile(api, cleanText(data?.filePath));

      case 'knowledge-delete':
        return knowledgeDelete(api, cleanText(data?.id));

      case 'knowledge-monitors-list':
        return knowledgeMonitorsList(api);

      case 'knowledge-monitor-add':
        return knowledgeMonitorAdd(api, cleanText(data?.path));

      case 'knowledge-monitor-remove':
        return knowledgeMonitorRemove(api, cleanText(data?.id));

      case 'knowledge-monitor-scan':
        return knowledgeMonitorScan(api, cleanText(data?.id));

      case 'knowledge-health':
        return daemonJson(api, '/api/apollo/stats');

      case 'knowledge-status':
        return daemonJson(api, '/api/apollo/status');

      case 'knowledge-maintain':
        return daemonJson(api, '/api/apollo/maintenance', {
          method: 'POST',
          body: { action: 'decay_cycle' },
        });

      case 'absorber-resolve':
        return daemonJson(api, '/api/absorbers/resolve', {
          method: 'POST',
          body: { input: cleanText(data?.input) },
        });

      case 'absorber-dispatch':
        return daemonJson(api, '/api/absorbers/dispatch', {
          method: 'POST',
          body: {
            input: cleanText(data?.input),
            scope: cleanText(data?.scope) || undefined,
          },
        });

      case 'absorber-job':
        return daemonJson(api, `/api/absorbers/jobs/${encodeURIComponent(cleanText(data?.jobId))}`);

      default:
        api.log.warn('Unknown Legion action', action, data);
        return { ok: false, error: `Unknown action: ${action}` };
    }
  };

  api.onAction(`settings:${SETTINGS_COMPONENT}`, handleAction);
  for (const panel of PANEL_DEFINITIONS) {
    api.onAction(`panel:${panel.id}`, handleAction);
  }
}
