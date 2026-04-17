/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, EmptyState, JsonBox } from '../components/index.js';

export function PromptsTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(''); setRunResult(null);
    try {
      const result = await Promise.resolve(onAction?.('prompts-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const run = async (id: string) => {
    setRunning(id); setRunResult(null);
    try {
      const result = await Promise.resolve(onAction?.('prompt-run', { id }));
      setRunResult(result?.data ?? result);
    } catch (e: any) { setRunResult({ error: e?.message || String(e) }); }
    finally { setRunning(null); }
  };

  const items = asArray(data);

  return h(Section, {
    title: 'Prompts', subtitle: `${items.length} prompts`,
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-3' },
      items.length === 0 ? h(EmptyState, { title: 'No prompts', body: 'No prompts registered.' }) :
      h('div', { className: 'grid gap-2' }, items.map((p: any, i: number) =>
        h('div', { key: p.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', { className: 'min-w-0 flex-1' },
            h('div', { className: 'text-sm font-medium' }, p.name || p.id),
            p.description ? h('p', { className: 'text-xs text-muted-foreground truncate' }, p.description) : null,
          ),
          h(ActionButton, { label: running === p.id ? 'Running...' : 'Run', onClick: () => run(p.id), disabled: running != null }),
        ),
      )),
      runResult ? h('div', { className: 'mt-2' }, h(JsonBox, { value: runResult })) : null,
    ),
  );
}
