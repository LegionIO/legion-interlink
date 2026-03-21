import { useState, useEffect, useRef, useCallback, type FC } from 'react';
import { XIcon, ChevronRightIcon } from 'lucide-react';
import { useConfig } from '@/providers/ConfigProvider';
import { EditableTextarea } from '@/components/EditableTextarea';
import { EditableInput } from '@/components/EditableInput';
import { ModelSettings } from './ModelSettings';
import { CompactionSettings } from './CompactionSettings';
import { MemorySettings } from './MemorySettings';
import { ToolSettings } from './ToolSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { McpSettings } from './McpSettings';
import { SkillSettings } from './SkillSettings';
import type { SettingsProps } from './shared';

type SettingsSection = 'models' | 'memory' | 'compaction' | 'tools' | 'skills' | 'sub-agents' | 'system-prompt' | 'advanced' | 'agent-lattice' | 'mcp';

const sections: Array<{ key: SettingsSection; label: string }> = [
  { key: 'models', label: 'Models' },
  { key: 'memory', label: 'Memory' },
  { key: 'compaction', label: 'Compaction' },
  { key: 'tools', label: 'Tools' },
  { key: 'skills', label: 'Skills' },
  { key: 'sub-agents', label: 'Sub-Agents' },
  { key: 'system-prompt', label: 'System Prompt' },
  { key: 'mcp', label: 'MCP Servers' },
  { key: 'agent-lattice', label: 'Agent Lattice' },
  { key: 'advanced', label: 'Advanced' },
];

export const SettingsPanel: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('models');
  const { config, updateConfig } = useConfig();

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
      <div className="w-[220px] border-r border-border/70 bg-sidebar/55 p-3 space-y-1 legion-shell-panel">
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
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeSection === 'models' && <ModelSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'memory' && <MemorySettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'compaction' && <CompactionSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'tools' && <ToolSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'skills' && <SkillSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'sub-agents' && <SubAgentSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'system-prompt' && <SystemPromptSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'mcp' && <McpSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'agent-lattice' && <AgentLatticeSettings config={config} updateConfig={updateConfig} />}
        {activeSection === 'advanced' && <AdvancedSettings config={config} updateConfig={updateConfig} />}
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
        placeholder="Enter the system prompt for Legion Aithena..."
      />
    </div>
  );
};

const SubAgentSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const subAgents = (config as { tools?: { subAgents?: { enabled: boolean; maxDepth: number; maxConcurrent: number; maxPerParent: number; defaultModel?: string } } }).tools?.subAgents;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Sub-Agents</h3>
      <p className="text-xs text-muted-foreground">
        Configure limits for sub-agent spawning. Sub-agents allow the AI to delegate tasks to child agents that work autonomously.
      </p>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={subAgents?.enabled ?? true}
          onChange={(e) => updateConfig('tools.subAgents.enabled', e.target.checked)}
          className="rounded"
        />
        <span className="text-xs">Enable sub-agents</span>
      </label>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Max Nesting Depth</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs focus:ring-1 focus:ring-ring"
            value={String(subAgents?.maxDepth ?? 3)}
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 1 && n <= 10) updateConfig('tools.subAgents.maxDepth', n);
            }}
          />
          <span className="text-[10px] text-muted-foreground">1–10</span>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Max Concurrent</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs focus:ring-1 focus:ring-ring"
            value={String(subAgents?.maxConcurrent ?? 5)}
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 1 && n <= 20) updateConfig('tools.subAgents.maxConcurrent', n);
            }}
          />
          <span className="text-[10px] text-muted-foreground">1–20</span>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Max Per Parent</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs focus:ring-1 focus:ring-ring"
            value={String(subAgents?.maxPerParent ?? 3)}
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 1 && n <= 10) updateConfig('tools.subAgents.maxPerParent', n);
            }}
          />
          <span className="text-[10px] text-muted-foreground">1–10</span>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Default Model Override</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs focus:ring-1 focus:ring-ring"
            placeholder="Inherit from parent"
            value={subAgents?.defaultModel ?? ''}
            onChange={(v) => updateConfig('tools.subAgents.defaultModel', v || undefined)}
          />
          <span className="text-[10px] text-muted-foreground">Leave blank to inherit</span>
        </div>
      </div>
    </div>
  );
};

const AgentLatticeSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const agentLattice = (config as {
    agentLattice?: {
      enabled: boolean;
      agentUrl: string;
      oauth?: {
        callbackHost?: string;
        callbackPort?: number;
        cookieDomain?: string;
        cookieName?: string;
      };
    };
  }).agentLattice;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Agent Lattice</h3>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={agentLattice?.enabled ?? false}
          onChange={(e) => updateConfig('agentLattice.enabled', e.target.checked)}
          className="rounded"
        />
        <span className="text-xs">Enable Agent Lattice</span>
      </label>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Agent URL</label>
        <EditableInput
          className="w-full rounded-md border bg-card px-3 py-1.5 text-xs focus:ring-1 focus:ring-ring"
          value={agentLattice?.agentUrl ?? ''}
          onChange={(v) => updateConfig('agentLattice.agentUrl', v)}
          placeholder="https://agent-lattice.example.com"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Callback Host</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs font-mono focus:ring-1 focus:ring-ring"
            value={agentLattice?.oauth?.callbackHost ?? 'localhost'}
            onChange={(v) => updateConfig('agentLattice.oauth.callbackHost', v)}
            placeholder="localhost"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Callback Port</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs font-mono focus:ring-1 focus:ring-ring"
            value={String(agentLattice?.oauth?.callbackPort ?? 19876)}
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!Number.isNaN(n) && n > 0) updateConfig('agentLattice.oauth.callbackPort', n);
            }}
            placeholder="19876"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cookie Domain</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs font-mono focus:ring-1 focus:ring-ring"
            value={agentLattice?.oauth?.cookieDomain ?? ''}
            onChange={(v) => updateConfig('agentLattice.oauth.cookieDomain', v)}
            placeholder="example.com"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cookie Name</label>
          <EditableInput
            className="w-full rounded-md border bg-card px-3 py-1.5 text-xs font-mono focus:ring-1 focus:ring-ring"
            value={agentLattice?.oauth?.cookieName ?? ''}
            onChange={(v) => updateConfig('agentLattice.oauth.cookieName', v)}
            placeholder="session.token"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Cookie settings are optional. Only fill them in if Agent Lattice assets need a signed-in browser cookie injected on matching domains.
      </p>
    </div>
  );
};
