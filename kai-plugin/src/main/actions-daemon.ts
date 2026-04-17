import type { PluginAPI, DaemonResult } from './types';
import { daemonJson } from './daemon-client';
import { getPluginConfig } from './config';
import { runDoctorChecks } from './doctor';
import { cleanText } from './utils';

/**
 * Handle daemon CRUD actions dispatched from the renderer.
 *
 * Returns `null` when the action is not recognised so the caller can fall
 * through to other handling, or a `DaemonResult` when the action was handled.
 */
export async function handleDaemonCrudAction(
  api: PluginAPI,
  action: string,
  data: Record<string, unknown> | undefined,
): Promise<DaemonResult | null> {
  switch (action) {
    // ------------------------------------------------------------------ //
    // Daemon settings                                                     //
    // ------------------------------------------------------------------ //
    case 'daemon-settings-get':
      return daemonJson(api, '/api/settings');

    case 'daemon-settings-update':
      return daemonJson(api, '/api/settings', {
        method: 'PUT',
        body: data?.settings ?? data,
      });

    // ------------------------------------------------------------------ //
    // Extensions                                                          //
    // ------------------------------------------------------------------ //
    case 'extensions-list':
      return daemonJson(api, '/api/extensions');

    case 'extensions-get':
      return daemonJson(api, `/api/extensions/${enc(data?.id)}`);

    case 'extensions-install':
      return daemonJson(api, '/api/extensions/install', {
        method: 'POST',
        body: data as Record<string, unknown>,
        timeoutMs: 60_000,
      });

    case 'extensions-uninstall':
      return daemonJson(api, `/api/extensions/${enc(data?.id)}`, { method: 'DELETE' });

    case 'extensions-enable':
      return daemonJson(api, `/api/extensions/${enc(data?.id)}/enable`, { method: 'POST' });

    case 'extensions-disable':
      return daemonJson(api, `/api/extensions/${enc(data?.id)}/disable`, { method: 'POST' });

    case 'extensions-config-get':
      return daemonJson(api, `/api/extensions/${enc(data?.id)}/config`);

    case 'extensions-config-update':
      return daemonJson(api, `/api/extensions/${enc(data?.id)}/config`, {
        method: 'PUT',
        body: data?.config ?? data,
      });

    // ------------------------------------------------------------------ //
    // Tasks                                                               //
    // ------------------------------------------------------------------ //
    case 'tasks-list':
      return daemonJson(api, '/api/tasks', { query: buildQuery(data) });

    case 'tasks-get':
      return daemonJson(api, `/api/tasks/${enc(data?.id)}`);

    case 'tasks-create':
      return daemonJson(api, '/api/tasks', { method: 'POST', body: data as Record<string, unknown> });

    case 'tasks-cancel':
      return daemonJson(api, `/api/tasks/${enc(data?.id)}/cancel`, { method: 'POST' });

    case 'tasks-retry':
      return daemonJson(api, `/api/tasks/${enc(data?.id)}/retry`, { method: 'POST' });

    case 'tasks-delete':
      return daemonJson(api, `/api/tasks/${enc(data?.id)}`, { method: 'DELETE' });

    // ------------------------------------------------------------------ //
    // Workers                                                             //
    // ------------------------------------------------------------------ //
    case 'workers-list':
      return daemonJson(api, '/api/workers');

    case 'workers-get':
      return daemonJson(api, `/api/workers/${enc(data?.id)}`);

    case 'workers-drain':
      return daemonJson(api, `/api/workers/${enc(data?.id)}/drain`, { method: 'POST' });

    case 'workers-resume':
      return daemonJson(api, `/api/workers/${enc(data?.id)}/resume`, { method: 'POST' });

    // ------------------------------------------------------------------ //
    // Schedules                                                           //
    // ------------------------------------------------------------------ //
    case 'schedules-list':
      return daemonJson(api, '/api/schedules');

    case 'schedules-get':
      return daemonJson(api, `/api/schedules/${enc(data?.id)}`);

    case 'schedules-create':
      return daemonJson(api, '/api/schedules', { method: 'POST', body: data as Record<string, unknown> });

    case 'schedules-update':
      return daemonJson(api, `/api/schedules/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'schedules-delete':
      return daemonJson(api, `/api/schedules/${enc(data?.id)}`, { method: 'DELETE' });

    case 'schedules-pause':
      return daemonJson(api, `/api/schedules/${enc(data?.id)}/pause`, { method: 'POST' });

    case 'schedules-resume':
      return daemonJson(api, `/api/schedules/${enc(data?.id)}/resume`, { method: 'POST' });

    // ------------------------------------------------------------------ //
    // Triggers                                                            //
    // ------------------------------------------------------------------ //
    case 'triggers-list':
      return daemonJson(api, '/api/triggers');

    case 'triggers-get':
      return daemonJson(api, `/api/triggers/${enc(data?.id)}`);

    case 'triggers-create':
      return daemonJson(api, '/api/triggers', { method: 'POST', body: data as Record<string, unknown> });

    case 'triggers-update':
      return daemonJson(api, `/api/triggers/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'triggers-delete':
      return daemonJson(api, `/api/triggers/${enc(data?.id)}`, { method: 'DELETE' });

    case 'triggers-enable':
      return daemonJson(api, `/api/triggers/${enc(data?.id)}/enable`, { method: 'POST' });

    case 'triggers-disable':
      return daemonJson(api, `/api/triggers/${enc(data?.id)}/disable`, { method: 'POST' });

    case 'triggers-test':
      return daemonJson(api, '/api/triggers/test', {
        method: 'POST',
        body: data as Record<string, unknown>,
        timeoutMs: 30_000,
      });

    // ------------------------------------------------------------------ //
    // Memory                                                              //
    // ------------------------------------------------------------------ //
    case 'memory-search':
      return daemonJson(api, '/api/memory/search', {
        method: 'POST',
        body: data as Record<string, unknown>,
      });

    case 'memory-list':
      return daemonJson(api, '/api/memory', { query: buildQuery(data) });

    case 'memory-get':
      return daemonJson(api, `/api/memory/${enc(data?.id)}`);

    case 'memory-delete':
      return daemonJson(api, `/api/memory/${enc(data?.id)}`, { method: 'DELETE' });

    case 'memory-clear':
      return daemonJson(api, '/api/memory/clear', { method: 'POST' });

    // ------------------------------------------------------------------ //
    // Audit                                                               //
    // ------------------------------------------------------------------ //
    case 'audit-list':
      return daemonJson(api, '/api/audit', { query: buildQuery(data) });

    case 'audit-get':
      return daemonJson(api, `/api/audit/${enc(data?.id)}`);

    case 'audit-verify':
      return daemonJson(api, '/api/audit/verify');

    case 'audit-export':
      return daemonJson(api, '/api/audit/export', { query: buildQuery(data) });

    // ------------------------------------------------------------------ //
    // Transport                                                           //
    // ------------------------------------------------------------------ //
    case 'transport-status':
      return daemonJson(api, '/api/transport');

    case 'transport-peers':
      return daemonJson(api, '/api/transport/peers');

    case 'transport-reconnect':
      return daemonJson(api, '/api/transport/reconnect', { method: 'POST' });

    // ------------------------------------------------------------------ //
    // Prompts                                                             //
    // ------------------------------------------------------------------ //
    case 'prompts-list':
      return daemonJson(api, '/api/prompts');

    case 'prompts-get':
      return daemonJson(api, `/api/prompts/${enc(data?.id)}`);

    case 'prompts-create':
      return daemonJson(api, '/api/prompts', { method: 'POST', body: data as Record<string, unknown> });

    case 'prompts-update':
      return daemonJson(api, `/api/prompts/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'prompts-delete':
      return daemonJson(api, `/api/prompts/${enc(data?.id)}`, { method: 'DELETE' });

    // ------------------------------------------------------------------ //
    // Webhooks                                                            //
    // ------------------------------------------------------------------ //
    case 'webhooks-list':
      return daemonJson(api, '/api/webhooks');

    case 'webhooks-get':
      return daemonJson(api, `/api/webhooks/${enc(data?.id)}`);

    case 'webhooks-create':
      return daemonJson(api, '/api/webhooks', { method: 'POST', body: data as Record<string, unknown> });

    case 'webhooks-update':
      return daemonJson(api, `/api/webhooks/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'webhooks-delete':
      return daemonJson(api, `/api/webhooks/${enc(data?.id)}`, { method: 'DELETE' });

    case 'webhooks-test':
      return daemonJson(api, `/api/webhooks/${enc(data?.id)}/test`, { method: 'POST' });

    // ------------------------------------------------------------------ //
    // Tenants                                                             //
    // ------------------------------------------------------------------ //
    case 'tenants-list':
      return daemonJson(api, '/api/tenants');

    case 'tenants-get':
      return daemonJson(api, `/api/tenants/${enc(data?.id)}`);

    case 'tenants-create':
      return daemonJson(api, '/api/tenants', { method: 'POST', body: data as Record<string, unknown> });

    case 'tenants-update':
      return daemonJson(api, `/api/tenants/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'tenants-delete':
      return daemonJson(api, `/api/tenants/${enc(data?.id)}`, { method: 'DELETE' });

    // ------------------------------------------------------------------ //
    // Governance                                                          //
    // ------------------------------------------------------------------ //
    case 'governance-status':
      return daemonJson(api, '/api/governance');

    case 'governance-policies':
      return daemonJson(api, '/api/governance/policies');

    case 'governance-policy-get':
      return daemonJson(api, `/api/governance/policies/${enc(data?.id)}`);

    case 'governance-policy-create':
      return daemonJson(api, '/api/governance/policies', { method: 'POST', body: data as Record<string, unknown> });

    case 'governance-policy-update':
      return daemonJson(api, `/api/governance/policies/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'governance-policy-delete':
      return daemonJson(api, `/api/governance/policies/${enc(data?.id)}`, { method: 'DELETE' });

    case 'governance-approvals':
      return daemonJson(api, '/api/governance/approvals');

    case 'governance-approve':
      return daemonJson(api, `/api/governance/approvals/${enc(data?.id)}/approve`, { method: 'POST', body: data as Record<string, unknown> });

    case 'governance-reject':
      return daemonJson(api, `/api/governance/approvals/${enc(data?.id)}/reject`, { method: 'POST', body: data as Record<string, unknown> });

    // ------------------------------------------------------------------ //
    // Capacity                                                            //
    // ------------------------------------------------------------------ //
    case 'capacity-status':
      return daemonJson(api, '/api/capacity');

    case 'capacity-scale':
      return daemonJson(api, '/api/capacity/scale', { method: 'POST', body: data as Record<string, unknown> });

    case 'capacity-limits':
      return daemonJson(api, '/api/capacity/limits');

    case 'capacity-limits-update':
      return daemonJson(api, '/api/capacity/limits', { method: 'PUT', body: data as Record<string, unknown> });

    // ------------------------------------------------------------------ //
    // RBAC                                                                //
    // ------------------------------------------------------------------ //
    case 'rbac-roles':
      return daemonJson(api, '/api/rbac/roles');

    case 'rbac-role-get':
      return daemonJson(api, `/api/rbac/roles/${enc(data?.id)}`);

    case 'rbac-role-create':
      return daemonJson(api, '/api/rbac/roles', { method: 'POST', body: data as Record<string, unknown> });

    case 'rbac-role-update':
      return daemonJson(api, `/api/rbac/roles/${enc(data?.id)}`, { method: 'PUT', body: data as Record<string, unknown> });

    case 'rbac-role-delete':
      return daemonJson(api, `/api/rbac/roles/${enc(data?.id)}`, { method: 'DELETE' });

    case 'rbac-assignments':
      return daemonJson(api, '/api/rbac/assignments');

    case 'rbac-assign':
      return daemonJson(api, '/api/rbac/assignments', { method: 'POST', body: data as Record<string, unknown> });

    case 'rbac-unassign':
      return daemonJson(api, `/api/rbac/assignments/${enc(data?.id)}`, { method: 'DELETE' });

    // ------------------------------------------------------------------ //
    // GAIA                                                                //
    // ------------------------------------------------------------------ //
    case 'gaia-status':
      return daemonJson(api, '/api/gaia/status');

    case 'gaia-buffer':
      return daemonJson(api, '/api/gaia/buffer', { method: 'POST', body: data as Record<string, unknown> });

    case 'gaia-observations':
      return daemonJson(api, '/api/gaia/observations', { query: buildQuery(data) });

    case 'gaia-config':
      return daemonJson(api, '/api/gaia/config');

    case 'gaia-config-update':
      return daemonJson(api, '/api/gaia/config', { method: 'PUT', body: data as Record<string, unknown> });

    // ------------------------------------------------------------------ //
    // Metering                                                            //
    // ------------------------------------------------------------------ //
    case 'metering-summary':
      return daemonJson(api, '/api/metering');

    case 'metering-usage':
      return daemonJson(api, '/api/metering/usage', { query: buildQuery(data) });

    case 'metering-reset':
      return daemonJson(api, '/api/metering/reset', { method: 'POST' });

    // ------------------------------------------------------------------ //
    // Mesh                                                                //
    // ------------------------------------------------------------------ //
    case 'mesh-status':
      return daemonJson(api, '/api/mesh');

    case 'mesh-peers':
      return daemonJson(api, '/api/mesh/peers');

    case 'mesh-peer-get':
      return daemonJson(api, `/api/mesh/peers/${enc(data?.id)}`);

    case 'mesh-join':
      return daemonJson(api, '/api/mesh/join', { method: 'POST', body: data as Record<string, unknown> });

    case 'mesh-leave':
      return daemonJson(api, '/api/mesh/leave', { method: 'POST' });

    // ------------------------------------------------------------------ //
    // LLM                                                                 //
    // ------------------------------------------------------------------ //
    case 'llm-models':
      return daemonJson(api, '/api/llm/models');

    case 'llm-providers':
      return daemonJson(api, '/api/llm/providers');

    case 'llm-config':
      return daemonJson(api, '/api/llm/config');

    case 'llm-config-update':
      return daemonJson(api, '/api/llm/config', { method: 'PUT', body: data as Record<string, unknown> });

    // ------------------------------------------------------------------ //
    // Structural                                                          //
    // ------------------------------------------------------------------ //
    case 'structural-index':
      return daemonJson(api, '/api/structural/index', {
        method: 'POST',
        body: data as Record<string, unknown>,
        timeoutMs: 60_000,
      });

    // ------------------------------------------------------------------ //
    // Tool audit                                                          //
    // ------------------------------------------------------------------ //
    case 'tool-audit':
      return daemonJson(api, '/api/tools/audit', { query: buildQuery(data) });

    // ------------------------------------------------------------------ //
    // State diff                                                          //
    // ------------------------------------------------------------------ //
    case 'state-diff-snapshot':
      return daemonJson(api, '/api/state/snapshot');

    case 'state-diff-compare':
      return daemonJson(api, '/api/state/diff', {
        method: 'POST',
        body: data as Record<string, unknown>,
      });

    // ------------------------------------------------------------------ //
    // Sessions                                                            //
    // ------------------------------------------------------------------ //
    case 'sessions-search':
      return daemonJson(api, '/api/sessions/search', {
        method: 'POST',
        body: data as Record<string, unknown>,
      });

    // ------------------------------------------------------------------ //
    // Health / Ready / Metrics / Doctor                                   //
    // ------------------------------------------------------------------ //
    case 'health':
      return daemonJson(api, getPluginConfig(api).healthPath);

    case 'ready':
      return daemonJson(api, getPluginConfig(api).readyPath);

    case 'metrics':
      return daemonJson(api, '/api/metrics');

    case 'doctor':
      return runDoctorChecks(api);

    // ------------------------------------------------------------------ //
    // Nodes                                                               //
    // ------------------------------------------------------------------ //
    case 'nodes-list':
      return daemonJson(api, '/api/nodes');

    // ------------------------------------------------------------------ //
    // GitHub                                                              //
    // ------------------------------------------------------------------ //
    case 'github-status':
      return daemonJson(api, '/api/github/status');

    case 'github-repos':
      return daemonJson(api, '/api/github/repos');

    case 'github-repo-get':
      return daemonJson(api, `/api/github/repos/${enc(data?.owner)}/${enc(data?.repo)}`);

    case 'github-pulls':
      return daemonJson(api, `/api/github/repos/${enc(data?.owner)}/${enc(data?.repo)}/pulls`, { query: buildQuery(data) });

    case 'github-issues':
      return daemonJson(api, `/api/github/repos/${enc(data?.owner)}/${enc(data?.repo)}/issues`, { query: buildQuery(data) });

    case 'github-webhooks':
      return daemonJson(api, '/api/github/webhooks');

    case 'github-webhook-create':
      return daemonJson(api, '/api/github/webhooks', { method: 'POST', body: data as Record<string, unknown> });

    case 'github-webhook-delete':
      return daemonJson(api, `/api/github/webhooks/${enc(data?.id)}`, { method: 'DELETE' });

    // ------------------------------------------------------------------ //
    // Catalog                                                             //
    // ------------------------------------------------------------------ //
    case 'catalog':
      return daemonJson(api, '/api/catalog');

    // ------------------------------------------------------------------ //
    // Not recognised                                                      //
    // ------------------------------------------------------------------ //
    default:
      return null;
  }
}

// -------------------------------------------------------------------------- //
// Helpers                                                                     //
// -------------------------------------------------------------------------- //

/** Safely URL-encode a value extracted from action data. */
function enc(value: unknown): string {
  return encodeURIComponent(cleanText(value as string));
}

/** Build a query-string record from arbitrary action data. */
function buildQuery(data: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!data) return undefined;
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip body-like keys — only pass simple scalars as query params.
    if (key === 'id' || key === 'body' || key === 'config' || key === 'settings') continue;
    if (value == null || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      query[key] = String(value);
    }
  }
  return Object.keys(query).length > 0 ? query : undefined;
}
