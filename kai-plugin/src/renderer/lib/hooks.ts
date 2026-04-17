/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from './react.js';
import { safeJson } from './utils.js';

/**
 * Generic hook for fetching daemon data. Calls onAction on mount and returns
 * { data, loading, error, refresh }.
 */
export function useDaemonData(
  onAction: ((action: string, data?: any) => any) | undefined,
  action: string,
  actionData?: any,
  deps: any[] = [],
): { data: any; loading: boolean; error: string; refresh: () => void } {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await Promise.resolve(onAction?.(action, actionData));
      if (result?.ok === false) {
        setError(result.error || 'Request failed.');
        setData(null);
      } else {
        setData(result?.data ?? result);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, deps);

  return { data, loading, error, refresh: load };
}

/**
 * Draft config state that syncs from pluginConfig and provides a local draft
 * for editing before saving.
 */
export function useDraftConfig(pluginConfig: any): [any, (updater: any) => void] {
  const [draft, setDraft] = useState(() => buildDraft(pluginConfig));

  useEffect(() => {
    setDraft(buildDraft(pluginConfig));
  }, [
    pluginConfig?.enabled,
    pluginConfig?.daemonUrl,
    pluginConfig?.configDir,
    pluginConfig?.apiKey,
    pluginConfig?.readyPath,
    pluginConfig?.healthPath,
    pluginConfig?.streamPath,
    pluginConfig?.eventsPath,
    pluginConfig?.backendEnabled,
    pluginConfig?.daemonStreaming,
    pluginConfig?.notificationsEnabled,
    pluginConfig?.nativeNotifications,
    pluginConfig?.autoConnectEvents,
    pluginConfig?.openProactiveThread,
    pluginConfig?.healthPollMs,
    pluginConfig?.eventsRecentCount,
    pluginConfig?.sseReconnectMs,
    pluginConfig?.workspaceThreadTitle,
    pluginConfig?.proactiveThreadTitle,
    pluginConfig?.bootstrapPrompt,
    pluginConfig?.proactivePromptPrefix,
    pluginConfig?.knowledgeRagEnabled,
    pluginConfig?.knowledgeCaptureEnabled,
    pluginConfig?.knowledgeScope,
    pluginConfig?.triggersEnabled,
    pluginConfig?.autoTriage,
    pluginConfig?.triageModel,
    pluginConfig?.maxConcurrentWorkflows,
    safeJson(pluginConfig?.triggerRules || []),
  ]);

  return [draft, setDraft];
}

function buildDraft(pluginConfig: any): any {
  return {
    enabled: pluginConfig?.enabled !== false,
    daemonUrl: pluginConfig?.daemonUrl || 'http://127.0.0.1:4567',
    configDir: pluginConfig?.configDir || '',
    apiKey: pluginConfig?.apiKey || '',
    readyPath: pluginConfig?.readyPath || '/api/ready',
    healthPath: pluginConfig?.healthPath || '/api/health',
    streamPath: pluginConfig?.streamPath || '/api/llm/inference',
    eventsPath: pluginConfig?.eventsPath || '/api/events',
    backendEnabled: pluginConfig?.backendEnabled !== false,
    daemonStreaming: pluginConfig?.daemonStreaming !== false,
    notificationsEnabled: pluginConfig?.notificationsEnabled !== false,
    nativeNotifications: pluginConfig?.nativeNotifications !== false,
    autoConnectEvents: pluginConfig?.autoConnectEvents !== false,
    openProactiveThread: Boolean(pluginConfig?.openProactiveThread),
    healthPollMs: String(pluginConfig?.healthPollMs || 60000),
    eventsRecentCount: String(pluginConfig?.eventsRecentCount || 50),
    sseReconnectMs: String(pluginConfig?.sseReconnectMs || 5000),
    workspaceThreadTitle: pluginConfig?.workspaceThreadTitle || 'Legion Workspace',
    proactiveThreadTitle: pluginConfig?.proactiveThreadTitle || 'GAIA Activity',
    bootstrapPrompt: pluginConfig?.bootstrapPrompt || '',
    proactivePromptPrefix: pluginConfig?.proactivePromptPrefix || 'Proactive daemon activity',
    knowledgeRagEnabled: pluginConfig?.knowledgeRagEnabled !== false,
    knowledgeCaptureEnabled: pluginConfig?.knowledgeCaptureEnabled !== false,
    knowledgeScope: pluginConfig?.knowledgeScope || 'all',
    triggersEnabled: pluginConfig?.triggersEnabled !== false,
    autoTriage: pluginConfig?.autoTriage !== false,
    triageModel: pluginConfig?.triageModel || '',
    maxConcurrentWorkflows: String(pluginConfig?.maxConcurrentWorkflows || 3),
    triggerRules: safeJson(pluginConfig?.triggerRules || []),
  };
}
