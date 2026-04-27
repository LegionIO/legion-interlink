import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { XIcon, ChevronRightIcon } from 'lucide-react';
import { useConfig } from '@/providers/ConfigProvider';
import { EditableTextarea } from '@/components/EditableTextarea';
import { EditableInput } from '@/components/EditableInput';
import { ToolSettings } from './ToolSettings';
import { CliToolsSettings } from './CliToolsSettings';
import { McpSettings } from './McpSettings';
import { SkillSettings } from './SkillSettings';
import { AudioSettings } from './AudioSettings';
import { RealtimeSettings } from './RealtimeSettings';
import { ComputerUseSettings } from './ComputerUseSettings';
import { MediaGenerationSettings } from './MediaGenerationSettings';
import { DaemonSettings } from './DaemonSettings';
import { DaemonExtensions } from './DaemonExtensions';
import { DaemonTasks } from './DaemonTasks';
import { DaemonWorkers } from './DaemonWorkers';
import { DaemonEvents } from './DaemonEvents';
import { DaemonAudit } from './DaemonAudit';
import { DaemonPrompts } from './DaemonPrompts';
import { DaemonWebhooks } from './DaemonWebhooks';
import { DaemonTenants } from './DaemonTenants';
import { DaemonCapacity } from './DaemonCapacity';
import { DaemonGovernance } from './DaemonGovernance';
import { DaemonMetrics } from './DaemonMetrics';
import { DaemonDoctor } from './DaemonDoctor';
import { DaemonTopology } from './DaemonTopology';
import { DaemonMemoryInspector } from './DaemonMemoryInspector';
import { DaemonTaskGraph } from './DaemonTaskGraph';
import { DaemonGaia } from './DaemonGaia';
import { DaemonCostTracker } from './DaemonCostTracker';
import { DaemonMesh } from './DaemonMesh';
import { DaemonScheduleBuilder } from './DaemonScheduleBuilder';
import { TriggerSettings } from './TriggerSettings';
import { AppearanceSettings } from './AppearanceSettings';
import type { SettingsProps } from './shared';
import { usePluginSettingsSections } from '@/components/plugins/PluginSettingsSections';
import { getPluginComponent } from '@/components/plugins/PluginComponentRegistry';
import { usePlugins } from '@/providers/PluginProvider';

type SettingsSection =
  | 'appearance'
  | 'daemon' | 'extensions' | 'gaia' | 'tasks' | 'workers' | 'events'
  | 'prompts' | 'triggers' | 'webhooks' | 'tenants' | 'capacity' | 'governance'
  | 'metrics' | 'doctor' | 'topology' | 'memory-inspector' | 'task-graph'
  | 'cost-tracker' | 'mesh' | 'schedule-builder' | 'audit'
  | 'skills' | 'system-prompt' | 'tools' | 'cli-tools' | 'mcp'
  | 'audio' | 'realtime' | 'media-generation' | 'computer-use';

const sections: Array<{ key: SettingsSection; label: string }> = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'daemon', label: 'Daemon Config' },
  { key: 'extensions', label: 'Extensions' },
  { key: 'gaia', label: 'GAIA' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'task-graph', label: 'Task Graph' },
  { key: 'workers', label: 'Workers' },
  { key: 'events', label: 'Events' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'triggers', label: 'Triggers' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'tenants', label: 'Tenants' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'governance', label: 'Governance' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'doctor', label: 'Diagnostics' },
  { key: 'topology', label: 'Topology' },
  { key: 'memory-inspector', label: 'Knowledge' },
  { key: 'cost-tracker', label: 'Costs' },
  { key: 'mesh', label: 'Mesh' },
  { key: 'schedule-builder', label: 'Schedule Builder' },
  { key: 'audit', label: 'Audit' },
  { key: 'skills', label: 'Skills' },
  { key: 'system-prompt', label: 'System Prompt' },
  { key: 'tools', label: 'Tools' },
  { key: 'cli-tools', label: 'CLI Tools' },
  { key: 'mcp', label: 'MCP Servers' },
  { key: 'audio', label: 'Audio' },
  { key: 'realtime', label: 'Realtime Audio' },
  { key: 'media-generation', label: 'Media Generation' },
  { key: 'computer-use', label: 'Computer Use' },
];

export const SettingsPanel: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<string>('appearance');
  const { config, updateConfig } = useConfig();
  const pluginSections = usePluginSettingsSections();
  const { setPluginConfig, sendAction } = usePlugins();

  const sortedPluginSections = [...pluginSections].sort((a, b) => a.priority - b.priority);
  const hasPluginSections = sortedPluginSections.length > 0;

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* Section list */}
      <div className="w-[220px] overflow-y-auto border-r border-border/70 bg-sidebar/55 p-3 space-y-1 app-shell-panel">
        <div className="flex items-center justify-between px-2 py-1.5 mb-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">Settings</span>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl hover:bg-muted transition-colors">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setActiveSection(s.key)}
            className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition-all ${
              activeSection === s.key ? 'bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(95,87,196,0.22)]' : 'hover:bg-muted/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
            <ChevronRightIcon className="ml-auto h-3 w-3 opacity-50" />
          </button>
        ))}
        {hasPluginSections && (
          <>
            <div className="flex items-center gap-2 pt-3 pb-1 px-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground whitespace-nowrap">Plugin Settings</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {sortedPluginSections.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActiveSection(s.key)}
                className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition-all ${
                  activeSection === s.key ? 'bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(95,87,196,0.22)]' : 'hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
                <ChevronRightIcon className="ml-auto h-3 w-3 opacity-50" />
              </button>
            ))}
          </>
        )}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeSection === 'appearance' && <AppearanceSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'tools' && <ToolSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'cli-tools' && <CliToolsSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'skills' && <SkillSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'system-prompt' && <SystemPromptSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'mcp' && <McpSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'audio' && <AudioSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'realtime' && <RealtimeSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'media-generation' && <MediaGenerationSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'computer-use' && <ComputerUseSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'daemon' && <DaemonSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'extensions' && <DaemonExtensions config={config} updateConfig={updateConfig} />}
        {activeSection === 'tasks' && <DaemonTasks config={config} updateConfig={updateConfig} />}
        {activeSection === 'workers' && <DaemonWorkers config={config} updateConfig={updateConfig} />}
        {activeSection === 'events' && <DaemonEvents config={config} updateConfig={updateConfig} />}
        {activeSection === 'audit' && <DaemonAudit config={config} updateConfig={updateConfig} />}
        {activeSection === 'prompts' && <DaemonPrompts config={config} updateConfig={updateConfig} />}
        {activeSection === 'webhooks' && <DaemonWebhooks config={config} updateConfig={updateConfig} />}
        {activeSection === 'tenants' && <DaemonTenants config={config} updateConfig={updateConfig} />}
        {activeSection === 'capacity' && <DaemonCapacity config={config} updateConfig={updateConfig} />}
        {activeSection === 'governance' && <DaemonGovernance config={config} updateConfig={updateConfig} />}
        {activeSection === 'metrics' && <DaemonMetrics config={config} updateConfig={updateConfig} />}
        {activeSection === 'doctor' && <DaemonDoctor config={config} updateConfig={updateConfig} />}
        {activeSection === 'topology' && <DaemonTopology config={config} updateConfig={updateConfig} />}
        {activeSection === 'memory-inspector' && <DaemonMemoryInspector config={config} updateConfig={updateConfig} />}
        {activeSection === 'task-graph' && <DaemonTaskGraph config={config} updateConfig={updateConfig} />}
        {activeSection === 'gaia' && <DaemonGaia config={config} updateConfig={updateConfig} />}
        {activeSection === 'cost-tracker' && <DaemonCostTracker config={config} updateConfig={updateConfig} />}
        {activeSection === 'mesh' && <DaemonMesh config={config} updateConfig={updateConfig} />}
        {activeSection === 'schedule-builder' && <DaemonScheduleBuilder config={config} updateConfig={updateConfig} />}
        {activeSection === 'triggers' && <TriggerSettings config={config} updateConfig={updateConfig} />}
        {/* Plugin settings sections */}
        {pluginSections.map((ps) => {
          if (activeSection !== ps.key) return null;
          const Component = getPluginComponent(ps.pluginName, ps.component);
          if (!Component) return null;
          return (
            <Component
              key={ps.key}
              pluginName={ps.pluginName}
              config={config}
              updateConfig={updateConfig}
              onAction={(action: string, data?: unknown) => {
                sendAction(ps.pluginName, `settings:${ps.component}`, action, data);
              }}
              setPluginConfig={async (path, value) => {
                await setPluginConfig(ps.pluginName, path, value);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

const SystemPromptSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const configPrompt = (config as { systemPrompt?: string }).systemPrompt ?? '';
  const [draft, setDraft] = useState(configPrompt);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);

  // Sync from config only when not actively editing
  useEffect(() => {
    if (!isFocusedRef.current) setDraft(configPrompt);
  }, [configPrompt]);

  const flushToConfig = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    updateConfig('systemPrompt', value);
  }, [updateConfig]);

  const handleChange = (value: string) => {
    setDraft(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushToConfig(value), 800);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">System Prompt</h3>
      <EditableTextarea
        className="w-full h-[300px] rounded-lg border bg-card p-3 text-xs font-mono overflow-y-auto outline-none focus:ring-1 focus:ring-ring"
        value={draft}
        onFocus={() => { isFocusedRef.current = true; }}
        onBlur={() => { isFocusedRef.current = false; }}
        onChange={(v) => handleChange(v)}
        placeholder={`Enter the system prompt for ${__BRAND_PRODUCT_NAME}...`}
      />
    </div>
  );
};
