import type { FC } from 'react';
import { Toggle, NumberField, SliderField, settingsSelectClass, type SettingsProps } from './shared';

export const AdvancedSettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const advanced = config.advanced as {
    temperature: number;
    maxSteps: number;
    maxRetries: number;
    useResponsesApi: boolean;
  };
  const titleGen = config.titleGeneration as {
    enabled: boolean;
    retitleIntervalMessages: number;
    retitleEagerUntilMessage: number;
  };
  const ui = config.ui as { theme: string; sidebarWidth: number };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold">Advanced</h3>

      <fieldset className="rounded-lg border p-3 space-y-3">
        <legend className="text-xs font-semibold px-1">LLM Parameters</legend>
        <SliderField label={`Temperature: ${advanced.temperature}`} value={advanced.temperature} min={0} max={2} step={0.1} onChange={(v) => updateConfig('advanced.temperature', v)} />
        <div className="flex justify-between text-[10px] text-muted-foreground -mt-2">
          <span>Focused &amp; predictable</span>
          <span>Creative &amp; varied</span>
        </div>
        <NumberField label="Max Steps (tool call loops)" value={advanced.maxSteps} onChange={(v) => updateConfig('advanced.maxSteps', v)} min={1} max={50} />
        <NumberField label="Max Retries" value={advanced.maxRetries} onChange={(v) => updateConfig('advanced.maxRetries', v)} min={0} max={10} />
        <Toggle label="Use Responses API" checked={advanced.useResponsesApi} onChange={(v) => updateConfig('advanced.useResponsesApi', v)} />
      </fieldset>

      <fieldset className="rounded-lg border p-3 space-y-3">
        <legend className="text-xs font-semibold px-1">AI Conversation Titles</legend>

        <div className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div>
            <span className="text-xs font-medium">Auto-generate titles</span>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Automatically generate and refresh conversation titles using AI.</p>
          </div>
          <input type="checkbox" checked={titleGen.enabled} onChange={(e) => updateConfig('titleGeneration.enabled', e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
        </div>

        <NumberField label="Title refresh interval (messages)" value={titleGen.retitleIntervalMessages} onChange={(v) => updateConfig('titleGeneration.retitleIntervalMessages', Math.max(1, v || 1))} min={1} />
        <p className="text-[10px] text-muted-foreground -mt-2">Regenerate title every N user messages after the eager window.</p>

        <NumberField label="Always refresh for first N messages" value={titleGen.retitleEagerUntilMessage} onChange={(v) => updateConfig('titleGeneration.retitleEagerUntilMessage', Math.max(0, v || 0))} min={0} />
        <p className="text-[10px] text-muted-foreground -mt-2">Always regenerate the title for each user message up to this count (eager phase).</p>
      </fieldset>

      <fieldset className="rounded-lg border p-3 space-y-3">
        <legend className="text-xs font-semibold px-1">UI</legend>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Theme</label>
          <select className={settingsSelectClass} value={ui.theme} onChange={(e) => updateConfig('ui.theme', e.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </fieldset>
    </div>
  );
};
