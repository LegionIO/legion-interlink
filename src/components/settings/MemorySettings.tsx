import { useState, type FC } from 'react';
import { Trash2Icon, AlertTriangleIcon, LoaderIcon, CheckCircle2Icon } from 'lucide-react';
import { legion } from '@/lib/ipc-client';
import { Toggle, NumberField, settingsSelectClass, type SettingsProps } from './shared';

export const MemorySettings: FC<SettingsProps> = ({ config, updateConfig }) => {
  const memory = config.memory as {
    enabled: boolean;
    workingMemory: { enabled: boolean; scope: string };
    observationalMemory: { enabled: boolean; scope: string };
    semanticRecall: { enabled: boolean; topK: number; scope: string };
    lastMessages: number;
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold">Memory</h3>

      <Toggle label="Enable Mastra memory" checked={memory.enabled} onChange={(v) => updateConfig('memory.enabled', v)} />

      <NumberField label="Last messages to keep in context" value={memory.lastMessages} onChange={(v) => updateConfig('memory.lastMessages', v)} min={1} />

      <fieldset className="rounded-lg border p-3 space-y-2">
        <legend className="text-xs font-semibold px-1">Working Memory</legend>
        <Toggle label="Enabled" checked={memory.workingMemory.enabled} onChange={(v) => updateConfig('memory.workingMemory.enabled', v)} />
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Scope</label>
          <select className={settingsSelectClass} value={memory.workingMemory.scope} onChange={(e) => updateConfig('memory.workingMemory.scope', e.target.value)}>
            <option value="resource">Resource (cross-thread)</option>
            <option value="thread">Thread (per-conversation)</option>
          </select>
        </div>
        <p className="text-[10px] text-muted-foreground">Working memory stores user preferences and key facts. "Resource" scope shares across all threads.</p>
      </fieldset>

      <fieldset className="rounded-lg border p-3 space-y-2">
        <legend className="text-xs font-semibold px-1">Observational Memory</legend>
        <Toggle label="Enabled" checked={memory.observationalMemory.enabled} onChange={(v) => updateConfig('memory.observationalMemory.enabled', v)} />
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Scope</label>
          <select className={settingsSelectClass} value={memory.observationalMemory.scope} onChange={(e) => updateConfig('memory.observationalMemory.scope', e.target.value)}>
            <option value="resource">Resource (cross-thread)</option>
            <option value="thread">Thread (per-conversation)</option>
          </select>
        </div>
        <p className="text-[10px] text-muted-foreground">AI-generated observations about patterns and preferences. Best with "resource" scope for cross-thread learning.</p>
      </fieldset>

      <fieldset className="rounded-lg border p-3 space-y-2">
        <legend className="text-xs font-semibold px-1">Semantic Recall (RAG)</legend>
        <Toggle label="Enabled" checked={memory.semanticRecall.enabled} onChange={(v) => updateConfig('memory.semanticRecall.enabled', v)} />
        <NumberField label="Top-K results" value={memory.semanticRecall.topK} onChange={(v) => updateConfig('memory.semanticRecall.topK', v)} min={1} max={20} />
        <p className="text-[10px] text-muted-foreground">Vector similarity search across conversation history. Enables cross-thread reference ("that thing from yesterday").</p>
      </fieldset>

      <ClearMemorySection />
    </div>
  );
};

/* ── Clear Memory Section ── */

type ClearStatus = 'idle' | 'confirming' | 'clearing' | 'done' | 'error';

const ClearMemorySection: FC = () => {
  const [status, setStatus] = useState<ClearStatus>('idle');
  const [working, setWorking] = useState(true);
  const [observational, setObservational] = useState(true);
  const [semantic, setSemantic] = useState(true);
  const [clearAll, setClearAll] = useState(false);
  const [result, setResult] = useState<{ cleared?: string[]; error?: string } | null>(null);

  const noneSelected = !clearAll && !working && !observational && !semantic;

  const handleClear = async () => {
    setStatus('clearing');
    setResult(null);
    try {
      const res = await legion.memory.clear(
        clearAll
          ? { all: true }
          : { working, observational, semantic },
      );
      if (res.error) {
        setResult({ error: res.error });
        setStatus('error');
      } else {
        setResult({ cleared: res.cleared });
        setStatus('done');
      }
    } catch (err) {
      setResult({ error: String(err) });
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
  };

  return (
    <fieldset className="rounded-lg border border-destructive/30 p-3 space-y-3">
      <legend className="text-xs font-semibold px-1 text-destructive">Clear Memory</legend>

      <p className="text-[10px] text-muted-foreground">
        Permanently delete stored memories. This cannot be undone.
      </p>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={clearAll}
            onChange={(e) => {
              setClearAll(e.target.checked);
              if (e.target.checked) { setWorking(true); setObservational(true); setSemantic(true); }
            }}
            className="rounded"
          />
          <span className="text-xs font-medium text-destructive">Clear ALL memory (nuclear option)</span>
        </label>

        {!clearAll && (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={working} onChange={(e) => setWorking(e.target.checked)} className="rounded" />
              <span className="text-xs">Working memory (preferences, facts)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={observational} onChange={(e) => setObservational(e.target.checked)} className="rounded" />
              <span className="text-xs">Observational memory (AI observations)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={semantic} onChange={(e) => setSemantic(e.target.checked)} className="rounded" />
              <span className="text-xs">Semantic recall (vector embeddings)</span>
            </label>
          </>
        )}
      </div>

      {/* Action buttons */}
      {status === 'idle' && (
        <button
          type="button"
          disabled={noneSelected}
          onClick={() => setStatus('confirming')}
          className="flex items-center gap-1.5 rounded-md border border-destructive/30 text-destructive px-3 py-1.5 text-xs hover:bg-destructive/10 disabled:opacity-40 transition-colors"
        >
          <Trash2Icon className="h-3.5 w-3.5" />
          Clear Selected Memory
        </button>
      )}

      {/* Confirmation modal */}
      {status === 'confirming' && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive">Are you sure?</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {clearAll
                  ? 'This will permanently delete ALL stored memories, including working memory, observations, and vector embeddings.'
                  : `This will permanently delete: ${[
                      working && 'working memory',
                      observational && 'observational memory',
                      semantic && 'semantic recall vectors',
                    ].filter(Boolean).join(', ')}.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md bg-destructive text-destructive-foreground px-3 py-1 text-xs font-medium hover:bg-destructive/90 transition-colors"
            >
              Yes, clear permanently
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-muted px-3 py-1 text-xs hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Clearing spinner */}
      {status === 'clearing' && (
        <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400">
          <LoaderIcon className="h-3 w-3 animate-spin" />
          Clearing memory...
        </div>
      )}

      {/* Success */}
      {status === 'done' && result?.cleared && (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-green-600 dark:text-green-400">
            <CheckCircle2Icon className="h-3 w-3" />
            Memory cleared successfully
          </div>
          <ul className="text-[10px] text-muted-foreground ml-5 list-disc">
            {result.cleared.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button type="button" onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
          <p className="text-[10px] text-destructive">{result?.error ?? 'Unknown error'}</p>
          <button type="button" onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1">
            Dismiss
          </button>
        </div>
      )}
    </fieldset>
  );
};
