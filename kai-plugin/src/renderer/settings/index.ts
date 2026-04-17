/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState } from '../lib/react.js';
import { cx, parseJson } from '../lib/utils.js';
import { useDraftConfig } from '../lib/hooks.js';
import { Badge, ActionButton } from '../components/index.js';
import { ConnectionTab } from './ConnectionTab.js';
import { BehaviorTab } from './BehaviorTab.js';
import { ThreadsTab } from './ThreadsTab.js';
import { RuntimeTab } from './RuntimeTab.js';
import { DoctorTab } from './DoctorTab.js';
import { ExtensionsTab } from './ExtensionsTab.js';
import { TasksTab } from './TasksTab.js';
import { WorkersTab } from './WorkersTab.js';
import { GaiaTab } from './GaiaTab.js';
import { SchedulesTab } from './SchedulesTab.js';
import { LlmTab } from './LlmTab.js';
import { TriggersTab } from './TriggersTab.js';
import { DaemonConfigTab } from './DaemonConfigTab.js';
import { MetricsTab } from './MetricsTab.js';
import { AuditTab } from './AuditTab.js';
import { MemoryTab } from './MemoryTab.js';
import { TopologyTab } from './TopologyTab.js';
import { MeshTab } from './MeshTab.js';
import { CapacityTab } from './CapacityTab.js';
import { CostsTab } from './CostsTab.js';
import { PromptsTab } from './PromptsTab.js';
import { WebhooksTab } from './WebhooksTab.js';
import { TenantsTab } from './TenantsTab.js';
import { GovernanceTab } from './GovernanceTab.js';
import { EventsTab } from './EventsTab.js';

type SectionEntry = { key: string; label: string; group: string };

const sections: SectionEntry[] = [
  // Plugin Config
  { key: 'connection', label: 'Connection', group: 'Plugin Config' },
  { key: 'behavior', label: 'Behavior', group: 'Plugin Config' },
  { key: 'threads', label: 'Threads & Rules', group: 'Plugin Config' },
  // Daemon Management
  { key: 'extensions', label: 'Extensions', group: 'Daemon Management' },
  { key: 'tasks', label: 'Tasks', group: 'Daemon Management' },
  { key: 'workers', label: 'Workers', group: 'Daemon Management' },
  { key: 'gaia', label: 'GAIA', group: 'Daemon Management' },
  { key: 'schedules', label: 'Schedules', group: 'Daemon Management' },
  { key: 'llm', label: 'LLM', group: 'Daemon Management' },
  { key: 'triggers', label: 'Triggers', group: 'Daemon Management' },
  { key: 'daemon-config', label: 'Daemon Config', group: 'Daemon Management' },
  { key: 'metrics', label: 'Metrics', group: 'Daemon Management' },
  { key: 'audit', label: 'Audit', group: 'Daemon Management' },
  { key: 'events', label: 'Events', group: 'Daemon Management' },
  { key: 'memory', label: 'Memory', group: 'Daemon Management' },
  { key: 'topology', label: 'Topology', group: 'Daemon Management' },
  { key: 'mesh', label: 'Mesh', group: 'Daemon Management' },
  { key: 'capacity', label: 'Capacity', group: 'Daemon Management' },
  { key: 'costs', label: 'Costs', group: 'Daemon Management' },
  { key: 'prompts', label: 'Prompts', group: 'Daemon Management' },
  { key: 'webhooks', label: 'Webhooks', group: 'Daemon Management' },
  { key: 'tenants', label: 'Tenants', group: 'Daemon Management' },
  { key: 'governance', label: 'Governance', group: 'Daemon Management' },
  // Diagnostics
  { key: 'doctor', label: 'Doctor', group: 'Diagnostics' },
  { key: 'runtime', label: 'Runtime', group: 'Diagnostics' },
];

const daemonTabMap: Record<string, any> = {
  extensions: ExtensionsTab,
  tasks: TasksTab,
  workers: WorkersTab,
  gaia: GaiaTab,
  schedules: SchedulesTab,
  llm: LlmTab,
  triggers: TriggersTab,
  'daemon-config': DaemonConfigTab,
  metrics: MetricsTab,
  audit: AuditTab,
  events: EventsTab,
  memory: MemoryTab,
  topology: TopologyTab,
  mesh: MeshTab,
  capacity: CapacityTab,
  costs: CostsTab,
  prompts: PromptsTab,
  webhooks: WebhooksTab,
  tenants: TenantsTab,
  governance: GovernanceTab,
};

export function LegionSettings({ pluginState, pluginConfig, setPluginConfig, onAction }: any): any {
  const [draft, setDraft] = useDraftConfig(pluginConfig);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState('');
  const [activeSection, setActiveSection] = useState('connection');

  const runAction = async (action: string, data?: any) => {
    setWorking(true);
    setNote('');
    try {
      const result = await Promise.resolve(onAction?.(action, data));
      if (result?.ok === false && result?.error) {
        setNote(result.error);
      } else {
        setNote('Action completed.');
      }
    } catch (error: any) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  };

  const saveDraft = async () => {
    if (!setPluginConfig) return;
    const parsedRules = parseJson(draft.triggerRules, []);
    if (parsedRules == null || !Array.isArray(parsedRules)) {
      setNote('Trigger rules must be valid JSON array data.');
      return;
    }

    setSaving(true);
    setNote('');
    try {
      await setPluginConfig('enabled', draft.enabled);
      await setPluginConfig('daemonUrl', draft.daemonUrl.trim());
      await setPluginConfig('configDir', draft.configDir.trim());
      await setPluginConfig('apiKey', draft.apiKey);
      await setPluginConfig('readyPath', draft.readyPath.trim() || '/api/ready');
      await setPluginConfig('healthPath', draft.healthPath.trim() || '/api/health');
      await setPluginConfig('streamPath', draft.streamPath.trim() || '/api/llm/inference');
      await setPluginConfig('eventsPath', draft.eventsPath.trim() || '/api/events');
      await setPluginConfig('backendEnabled', draft.backendEnabled);
      await setPluginConfig('daemonStreaming', draft.daemonStreaming);
      await setPluginConfig('notificationsEnabled', draft.notificationsEnabled);
      await setPluginConfig('nativeNotifications', draft.nativeNotifications);
      await setPluginConfig('autoConnectEvents', draft.autoConnectEvents);
      await setPluginConfig('openProactiveThread', draft.openProactiveThread);
      await setPluginConfig('healthPollMs', Math.max(Number(draft.healthPollMs) || 60000, 15000));
      await setPluginConfig('eventsRecentCount', Math.max(Number(draft.eventsRecentCount) || 50, 1));
      await setPluginConfig('sseReconnectMs', Math.max(Number(draft.sseReconnectMs) || 5000, 2000));
      await setPluginConfig('workspaceThreadTitle', draft.workspaceThreadTitle.trim() || 'Legion Workspace');
      await setPluginConfig('proactiveThreadTitle', draft.proactiveThreadTitle.trim() || 'GAIA Activity');
      await setPluginConfig('bootstrapPrompt', draft.bootstrapPrompt);
      await setPluginConfig('proactivePromptPrefix', draft.proactivePromptPrefix.trim() || 'Proactive daemon activity');
      await setPluginConfig('knowledgeRagEnabled', draft.knowledgeRagEnabled);
      await setPluginConfig('knowledgeCaptureEnabled', draft.knowledgeCaptureEnabled);
      await setPluginConfig('knowledgeScope', draft.knowledgeScope);
      await setPluginConfig('triggersEnabled', draft.triggersEnabled);
      await setPluginConfig('autoTriage', draft.autoTriage);
      await setPluginConfig('triageModel', draft.triageModel.trim());
      await setPluginConfig('maxConcurrentWorkflows', Math.max(Number(draft.maxConcurrentWorkflows) || 3, 1));
      await setPluginConfig('triggerRules', parsedRules);
      setNote('Legion config saved.');
    } catch (error: any) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const renderActiveSection = () => {
    // Plugin Config tabs
    if (activeSection === 'connection') {
      return h(ConnectionTab, { draft, setDraft });
    }
    if (activeSection === 'behavior') {
      return h(BehaviorTab, { draft, setDraft });
    }
    if (activeSection === 'threads') {
      return h(ThreadsTab, { draft, setDraft, saving, onSave: saveDraft });
    }

    // Diagnostics tabs
    if (activeSection === 'doctor') {
      return h(DoctorTab, { pluginState });
    }
    if (activeSection === 'runtime') {
      return h(RuntimeTab, { pluginState, draft });
    }

    // Daemon Management tabs
    const DaemonTab = daemonTabMap[activeSection];
    if (DaemonTab) {
      return h(DaemonTab, { onAction });
    }

    return null;
  };

  // Group sections for rendering
  const groups = ['Plugin Config', 'Daemon Management', 'Diagnostics'];

  return h(
    'div',
    { className: 'space-y-4' },
    // Header row: title + badge + action buttons
    h('div', { className: 'flex items-center justify-between gap-3' },
      h('div', { className: 'flex items-center gap-3' },
        h('h2', { className: 'text-base font-semibold' }, 'Legion'),
        h(Badge, { status: pluginState?.status }),
      ),
      h('div', { className: 'flex flex-wrap gap-1.5' },
        h(ActionButton, { label: saving ? 'Saving...' : 'Save', onClick: saveDraft, disabled: saving }),
        h(ActionButton, { label: working ? '...' : 'Refresh', onClick: () => runAction('refresh-status'), disabled: working, variant: 'secondary' }),
        h(ActionButton, { label: 'Doctor', onClick: () => runAction('run-doctor'), disabled: working, variant: 'secondary' }),
      ),
    ),
    // Status note
    note ? h('div', { className: 'rounded-xl border border-border/60 bg-background/45 px-3 py-2 text-xs' }, note) : null,
    // Tab strip — compact horizontal pills grouped with labels
    h('div', { className: 'space-y-2' },
      ...groups.map((group) => h(
        'div',
        { key: group },
        h('div', { className: 'mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70' }, group),
        h('div', { className: 'flex flex-wrap gap-1' },
          ...sections
            .filter((s) => s.group === group)
            .map((s) => h('button', {
              key: s.key,
              onClick: () => setActiveSection(s.key),
              className: cx(
                'rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
                activeSection === s.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              ),
            }, s.label)),
        ),
      )),
    ),
    // Content
    h('div', null, renderActiveSection()),
  );
}
