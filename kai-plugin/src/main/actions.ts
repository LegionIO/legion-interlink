import type { PluginAPI, DaemonResult } from './types';
import { getPluginConfig } from './config';
import { daemonJson } from './daemon-client';
import {
  knowledgeQuery,
  knowledgeBrowse,
  knowledgeIngestContent,
  knowledgeIngestFile,
  knowledgeDelete,
  knowledgeMonitorsList,
  knowledgeMonitorAdd,
  knowledgeMonitorRemove,
  knowledgeMonitorScan,
} from './knowledge';
import { runDoctorChecks } from './doctor';
import { createManagedConversation, openProactiveConversation } from './conversations';
import { refreshWorkflowTasks } from './workflows';
import {
  SETTINGS_COMPONENT,
  PANEL_DEFINITIONS,
  BANNER_ID,
  MAX_NOTIFICATIONS,
} from './constants';
import { cleanText, clampNumber } from './utils';
import { handleDaemonCrudAction } from './actions-daemon';

/**
 * Register action handlers for the settings component and all panel components.
 *
 * Renderer panels and the settings section dispatch `{ action, data }` payloads
 * via `api.onAction(...)`. This function wires up a single dispatcher that
 * routes each action string to the correct handler.
 */
export function registerActionHandlers(api: PluginAPI): void {
  const handleAction = async (
    action: string,
    data?: Record<string, unknown>,
  ): Promise<DaemonResult | unknown> => {
    switch (action) {
      // -------------------------------------------------------------- //
      // Runtime / dashboard                                             //
      // -------------------------------------------------------------- //
      case 'refresh-status': {
        const { syncRuntime } = await import('./index');
        return syncRuntime(api, { reason: 'manual-refresh', notify: false, recordHistory: true });
      }

      case 'refresh-dashboard': {
        const { refreshDashboardSnapshot } = await import('./index');
        return refreshDashboardSnapshot(api, { persist: true });
      }

      case 'run-doctor':
        return runDoctorChecks(api);

      // -------------------------------------------------------------- //
      // Navigation                                                      //
      // -------------------------------------------------------------- //
      case 'open-panel':
        api.navigation.open({
          type: 'panel',
          panelId: cleanText(data?.panelId as string) || PANEL_DEFINITIONS[0].id,
        });
        return { ok: true };

      // -------------------------------------------------------------- //
      // Conversations                                                   //
      // -------------------------------------------------------------- //
      case 'create-thread':
        return createManagedConversation(api, {
          title: data?.title as string | undefined,
          prompt: data?.prompt as string | undefined,
          open: data?.open !== false,
          kind: cleanText(data?.kind as string) || 'workspace',
        });

      case 'open-proactive-thread':
        return openProactiveConversation(api);

      // -------------------------------------------------------------- //
      // Events / notifications                                          //
      // -------------------------------------------------------------- //
      case 'load-recent-events': {
        const { loadRecentEvents } = await import('./index');
        return loadRecentEvents(api, {
          count: clampNumber(data?.count as number, 1, MAX_NOTIFICATIONS, getPluginConfig(api).eventsRecentCount),
        });
      }

      case 'notification-mark-read': {
        const { setNotificationReadState } = await import('./index');
        return setNotificationReadState(api, cleanText(data?.id as string), true);
      }

      case 'notification-mark-all-read': {
        const { markAllNotificationsRead } = await import('./index');
        return markAllNotificationsRead(api);
      }

      case 'notification-clear': {
        const { clearNotifications } = await import('./index');
        return clearNotifications(api);
      }

      // -------------------------------------------------------------- //
      // Daemon command / sub-agent                                      //
      // -------------------------------------------------------------- //
      case 'execute-command': {
        const { executeDaemonCommand } = await import('./index');
        return executeDaemonCommand(api, cleanText(data?.input as string));
      }

      case 'create-subagent': {
        const { createDaemonSubAgent } = await import('./index');
        return createDaemonSubAgent(api, {
          message: cleanText(data?.message as string),
          model: cleanText(data?.model as string) || undefined,
          parentConversationId: cleanText(data?.parentConversationId as string) || undefined,
        });
      }

      // -------------------------------------------------------------- //
      // Workflows                                                       //
      // -------------------------------------------------------------- //
      case 'refresh-workflows':
        return refreshWorkflowTasks(api);

      // -------------------------------------------------------------- //
      // Shell / external                                                //
      // -------------------------------------------------------------- //
      case 'open-external': {
        const url = cleanText(data?.url as string);
        if (!url) return { ok: false, error: 'A URL is required.' };
        await api.shell.openExternal(url);
        return { ok: true };
      }

      // -------------------------------------------------------------- //
      // Generic daemon call                                             //
      // -------------------------------------------------------------- //
      case 'daemon-call': {
        const { daemonAction } = await import('./index');
        return daemonAction(api, data);
      }

      // -------------------------------------------------------------- //
      // Knowledge                                                       //
      // -------------------------------------------------------------- //
      case 'knowledge-query':
        return knowledgeQuery(
          api,
          cleanText(data?.query as string),
          clampNumber(data?.limit as number, 1, 100, 10),
        );

      case 'knowledge-browse':
        return knowledgeBrowse(api, (data?.filters as Record<string, unknown>) || {});

      case 'knowledge-ingest-content':
        return knowledgeIngestContent(
          api,
          cleanText(data?.content as string),
          (data?.metadata as Record<string, unknown>) || {},
        );

      case 'knowledge-ingest-file':
        return knowledgeIngestFile(api, cleanText(data?.filePath as string));

      case 'knowledge-delete':
        return knowledgeDelete(api, cleanText(data?.id as string));

      case 'knowledge-monitors-list':
        return knowledgeMonitorsList(api);

      case 'knowledge-monitor-add':
        return knowledgeMonitorAdd(api, cleanText(data?.path as string));

      case 'knowledge-monitor-remove':
        return knowledgeMonitorRemove(api, cleanText(data?.id as string));

      case 'knowledge-monitor-scan':
        return knowledgeMonitorScan(api, cleanText(data?.id as string));

      case 'knowledge-health':
        return daemonJson(api, '/api/apollo/stats');

      case 'knowledge-status':
        return daemonJson(api, '/api/apollo/status');

      case 'knowledge-maintain':
        return daemonJson(api, '/api/apollo/maintenance', {
          method: 'POST',
          body: { action: 'decay_cycle' },
        });

      // -------------------------------------------------------------- //
      // Absorber                                                        //
      // -------------------------------------------------------------- //
      case 'absorber-resolve':
        return daemonJson(api, '/api/absorbers/resolve', {
          method: 'POST',
          body: { input: cleanText(data?.input as string) },
        });

      case 'absorber-dispatch':
        return daemonJson(api, '/api/absorbers/dispatch', {
          method: 'POST',
          body: {
            input: cleanText(data?.input as string),
            scope: cleanText(data?.scope as string) || undefined,
          },
        });

      case 'absorber-job':
        return daemonJson(
          api,
          `/api/absorbers/jobs/${encodeURIComponent(cleanText(data?.jobId as string))}`,
        );

      // -------------------------------------------------------------- //
      // Daemon CRUD (extensions, tasks, workers, schedules, etc.)       //
      // -------------------------------------------------------------- //
      default: {
        const crudResult = await handleDaemonCrudAction(api, action, data);
        if (crudResult !== null) return crudResult;

        api.log.warn('Unknown Legion action', action, data);
        return { ok: false, error: `Unknown action: ${action}` };
      }
    }
  };

  // Bind the dispatcher to the settings component, every panel, and the banner.
  api.onAction(`settings:${SETTINGS_COMPONENT}`, handleAction);
  for (const panel of PANEL_DEFINITIONS) {
    api.onAction(`panel:${panel.id}`, handleAction);
  }
  api.onAction(BANNER_ID, handleAction);
}
