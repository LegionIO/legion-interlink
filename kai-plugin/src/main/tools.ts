import type { PluginAPI, DaemonResult } from './types';
import { daemonJson } from './daemon-client';
import { createManagedConversation } from './conversations';
import { knowledgeQuery } from './knowledge';
import { PANEL_DEFINITIONS, DEFAULT_TIMEOUT_MS } from './constants';

/**
 * Register all Legion tools with the Kai plugin API.
 *
 * Tools:
 *   1. refresh_status   - Refresh daemon health, dashboard, workflows, and plugin state.
 *   2. create_thread    - Create a Legion-managed conversation.
 *   3. open_panel       - Open a Legion control panel in Kai.
 *   4. execute_command  - Send a natural-language command to the daemon router.
 *   5. knowledge_query  - Query Legion knowledge / Apollo.
 *   6. manage_triggers  - List, enable, disable, or test trigger rules.
 *   7. memory_search    - Search daemon memory stores.
 *   8. worker_status    - Fetch live status for one or all workers.
 */
export function registerTools(api: PluginAPI): void {
  api.tools.register([
    /* ------------------------------------------------------------------ */
    /* 1. refresh_status                                                   */
    /* ------------------------------------------------------------------ */
    {
      name: 'refresh_status',
      description:
        'Refresh Legion daemon health, dashboard state, workflows, and plugin status.',
      inputSchema: {
        type: 'object',
        properties: {
          notify: { type: 'boolean', default: false },
        },
      },
      execute: async ({ notify = false }: { notify?: boolean }): Promise<DaemonResult> => {
        // Lazy import to avoid circular dependency (index -> tools -> index).
        const { syncRuntime } = await import('./index');
        const state = await syncRuntime(api, {
          reason: 'tool-refresh',
          notify,
          recordHistory: true,
        });
        return { ok: true, state } as DaemonResult;
      },
    },

    /* ------------------------------------------------------------------ */
    /* 2. create_thread                                                    */
    /* ------------------------------------------------------------------ */
    {
      name: 'create_thread',
      description:
        'Create a Legion-managed conversation, optionally opening it immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          prompt: { type: 'string' },
          open: { type: 'boolean', default: true },
        },
      },
      execute: async ({
        title,
        prompt,
        open = true,
      }: {
        title?: string;
        prompt?: string;
        open?: boolean;
      }): Promise<DaemonResult> => {
        const result = await createManagedConversation(api, {
          title,
          prompt,
          open,
          kind: 'workspace',
        });
        return { ok: true, ...result };
      },
    },

    /* ------------------------------------------------------------------ */
    /* 3. open_panel                                                       */
    /* ------------------------------------------------------------------ */
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
      execute: async ({
        panelId = PANEL_DEFINITIONS[0].id,
      }: {
        panelId?: string;
      }): Promise<DaemonResult> => {
        api.navigation.open({ type: 'panel', panelId });
        return { ok: true, panelId } as DaemonResult;
      },
    },

    /* ------------------------------------------------------------------ */
    /* 4. execute_command                                                   */
    /* ------------------------------------------------------------------ */
    {
      name: 'execute_command',
      description:
        'Send a natural language command to the Legion daemon router.',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        required: ['input'],
      },
      execute: async ({ input }: { input: string }): Promise<DaemonResult> => {
        // Imported lazily to avoid circular dependency at registration time.
        const { executeDaemonCommand } = await import('./index');
        return executeDaemonCommand(api, input);
      },
    },

    /* ------------------------------------------------------------------ */
    /* 5. knowledge_query                                                  */
    /* ------------------------------------------------------------------ */
    {
      name: 'knowledge_query',
      description:
        'Query Legion knowledge / Apollo for relevant entries.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
      execute: async ({
        query,
        limit = 10,
      }: {
        query: string;
        limit?: number;
      }): Promise<DaemonResult> => {
        return knowledgeQuery(api, query, limit);
      },
    },

    /* ------------------------------------------------------------------ */
    /* 6. manage_triggers                                                  */
    /* ------------------------------------------------------------------ */
    {
      name: 'manage_triggers',
      description:
        'List, enable, disable, or test trigger rules on the Legion daemon.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'enable', 'disable', 'test'],
            default: 'list',
          },
          triggerId: { type: 'string' },
          payload: { type: 'object' },
        },
      },
      execute: async ({
        action = 'list',
        triggerId,
        payload,
      }: {
        action?: 'list' | 'enable' | 'disable' | 'test';
        triggerId?: string;
        payload?: Record<string, unknown>;
      }): Promise<DaemonResult> => {
        switch (action) {
          case 'list':
            return daemonJson(api, '/api/triggers');

          case 'enable':
            if (!triggerId) return { ok: false, error: 'triggerId is required to enable a trigger.' } as DaemonResult;
            return daemonJson(api, `/api/triggers/${encodeURIComponent(triggerId)}/enable`, {
              method: 'POST',
            });

          case 'disable':
            if (!triggerId) return { ok: false, error: 'triggerId is required to disable a trigger.' } as DaemonResult;
            return daemonJson(api, `/api/triggers/${encodeURIComponent(triggerId)}/disable`, {
              method: 'POST',
            });

          case 'test':
            return daemonJson(api, '/api/triggers/test', {
              method: 'POST',
              body: payload ?? {},
              timeoutMs: 30_000,
            });

          default:
            return { ok: false, error: `Unknown trigger action: ${action}` } as DaemonResult;
        }
      },
    },

    /* ------------------------------------------------------------------ */
    /* 7. memory_search                                                    */
    /* ------------------------------------------------------------------ */
    {
      name: 'memory_search',
      description:
        'Search daemon memory stores for relevant entries by query string.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 20 },
          scope: {
            type: 'string',
            enum: ['all', 'short', 'long', 'episodic'],
            default: 'all',
          },
        },
        required: ['query'],
      },
      execute: async ({
        query,
        limit = 20,
        scope = 'all',
      }: {
        query: string;
        limit?: number;
        scope?: string;
      }): Promise<DaemonResult> => {
        if (!query) return { ok: false, error: 'A search query is required.' } as DaemonResult;
        return daemonJson(api, '/api/memory/search', {
          method: 'POST',
          body: { query, limit, scope },
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });
      },
    },

    /* ------------------------------------------------------------------ */
    /* 8. worker_status                                                    */
    /* ------------------------------------------------------------------ */
    {
      name: 'worker_status',
      description:
        'Fetch live status for a single worker or all registered workers.',
      inputSchema: {
        type: 'object',
        properties: {
          workerId: { type: 'string' },
        },
      },
      execute: async ({
        workerId,
      }: {
        workerId?: string;
      }): Promise<DaemonResult> => {
        if (workerId) {
          return daemonJson(api, `/api/workers/${encodeURIComponent(workerId)}`);
        }
        return daemonJson(api, '/api/workers');
      },
    },
  ]);
}
