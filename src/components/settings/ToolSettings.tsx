import { useState, type FC } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { highlightBrandText } from '@/components/BrandText';
import { EditableInput } from '@/components/EditableInput';
import { Toggle, NumberField, SliderField, headTailLabel, settingsSelectClass, type SettingsProps } from './shared';

export const ToolSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const tools = config.tools as {
    shell: { enabled: boolean; timeout: number; allowPatterns: string[]; denyPatterns: string[] };
    fileAccess: { enabled: boolean; allowPaths: string[]; denyPaths: string[] };
    processStreaming: {
      enabled: boolean;
      updateIntervalMs: number;
      modelFeedMode: 'incremental' | 'final-only';
      maxOutputBytes: number;
      truncationMode: 'head' | 'tail' | 'head-tail';
      stopAfterMax: boolean;
      headTailRatio: number;
      observer: {
        enabled: boolean;
        intervalMs: number;
        maxSnapshotChars: number;
        maxMessagesPerTool: number;
        maxTotalLaunchedTools: number;
      };
    };
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold">Tools</h3>

      <fieldset className="rounded-lg border p-3 space-y-3">
        <legend className="text-xs font-semibold px-1">Shell Tool</legend>
        <Toggle label="Enabled" checked={tools.shell.enabled} onChange={(v) => updateConfig('tools.shell.enabled', v)} />
        <NumberField label="Timeout (ms)" value={tools.shell.timeout} onChange={(v) => updateConfig('tools.shell.timeout', v)} min={0} />
        <PatternList label="Allow Patterns" patterns={tools.shell.allowPatterns} onChange={(patterns) => updateConfig('tools.shell.allowPatterns', patterns)} />
        <PatternList label="Deny Patterns" patterns={tools.shell.denyPatterns} onChange={(patterns) => updateConfig('tools.shell.denyPatterns', patterns)} />
      </fieldset>

      <fieldset className="rounded-lg border p-3 space-y-3">
        <legend className="text-xs font-semibold px-1">File Access</legend>
        <Toggle label="Enabled" checked={tools.fileAccess.enabled} onChange={(v) => updateConfig('tools.fileAccess.enabled', v)} />
        <PatternList label="Allow Paths" patterns={tools.fileAccess.allowPaths} onChange={(patterns) => updateConfig('tools.fileAccess.allowPaths', patterns)} />
        <PatternList label="Deny Paths" patterns={tools.fileAccess.denyPaths} onChange={(patterns) => updateConfig('tools.fileAccess.denyPaths', patterns)} />
      </fieldset>

      <fieldset className="rounded-lg border p-3 space-y-3">
        <legend className="text-xs font-semibold px-1">Process Tool Streaming</legend>
        <Toggle label="Enabled" checked={tools.processStreaming.enabled} onChange={(v) => updateConfig('tools.processStreaming.enabled', v)} />
        <NumberField label="Update Interval (ms)" value={tools.processStreaming.updateIntervalMs} onChange={(v) => updateConfig('tools.processStreaming.updateIntervalMs', v)} min={50} />
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Model Feed Mode</label>
          <select
            className={settingsSelectClass}
            value={tools.processStreaming.modelFeedMode}
            onChange={(e) => updateConfig('tools.processStreaming.modelFeedMode', e.target.value)}
          >
            <option value="incremental">Incremental</option>
            <option value="final-only">Final only</option>
          </select>
        </div>
        <NumberField label="Max Output Bytes" value={tools.processStreaming.maxOutputBytes} onChange={(v) => updateConfig('tools.processStreaming.maxOutputBytes', v)} min={1024} />
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Truncation Mode</label>
          <select
            className={settingsSelectClass}
            value={tools.processStreaming.truncationMode}
            onChange={(e) => updateConfig('tools.processStreaming.truncationMode', e.target.value)}
          >
            <option value="head">Head</option>
            <option value="tail">Tail</option>
            <option value="head-tail">Head + Tail</option>
          </select>
        </div>
        <Toggle label="Stop Streaming After Max" checked={tools.processStreaming.stopAfterMax} onChange={(v) => updateConfig('tools.processStreaming.stopAfterMax', v)} />
        <SliderField
          label={headTailLabel('Head/Tail Ratio', tools.processStreaming.headTailRatio)}
          value={tools.processStreaming.headTailRatio}
          min={0.1}
          max={0.9}
          step={0.05}
          onChange={(v) => updateConfig('tools.processStreaming.headTailRatio', v)}
        />

        <fieldset className="rounded-md border p-2 space-y-2">
          <legend className="text-[10px] font-semibold px-1">Tool Observer</legend>
          <Toggle label="Enabled" checked={tools.processStreaming.observer.enabled} onChange={(v) => updateConfig('tools.processStreaming.observer.enabled', v)} />
          <NumberField label="Observer Tick Interval (ms)" value={tools.processStreaming.observer.intervalMs} onChange={(v) => updateConfig('tools.processStreaming.observer.intervalMs', v)} min={250} />
          <NumberField label="Max Snapshot Chars" value={tools.processStreaming.observer.maxSnapshotChars} onChange={(v) => updateConfig('tools.processStreaming.observer.maxSnapshotChars', v)} min={200} />
          <NumberField label="Max Mid-Tool Messages Per Tool" value={tools.processStreaming.observer.maxMessagesPerTool} onChange={(v) => updateConfig('tools.processStreaming.observer.maxMessagesPerTool', v)} min={1} />
          <NumberField label="Max Observer-Launched Tools" value={tools.processStreaming.observer.maxTotalLaunchedTools} onChange={(v) => updateConfig('tools.processStreaming.observer.maxTotalLaunchedTools', v)} min={1} />
        </fieldset>
      </fieldset>
    </div>
  );
};

const PatternList: FC<{ label: string; patterns: string[]; onChange: (patterns: string[]) => void }> = ({ label, patterns, onChange }) => {
  const [newPattern, setNewPattern] = useState('');

  const addPattern = () => {
    if (newPattern.trim()) {
      onChange([...patterns, newPattern.trim()]);
      setNewPattern('');
    }
  };

  const removePattern = (index: number) => {
    onChange(patterns.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
      <div className="space-y-1">
        {patterns.map((p, i) => (
          <div key={`${p}-${i}`} className="flex items-center gap-1">
            <span className="text-xs font-mono bg-muted rounded px-2 py-0.5 flex-1">{highlightBrandText(p)}</span>
            <button type="button" onClick={() => removePattern(i)} className="p-0.5 rounded hover:bg-destructive/10">
              <XIcon className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <EditableInput
          className="flex-1 rounded border bg-card px-2 py-1 text-xs font-mono"
          value={newPattern}
          onChange={setNewPattern}
          onSubmit={addPattern}
          placeholder="Add pattern..."
        />
        <button type="button" onClick={addPattern} className="p-1 rounded hover:bg-muted">
          <PlusIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};
