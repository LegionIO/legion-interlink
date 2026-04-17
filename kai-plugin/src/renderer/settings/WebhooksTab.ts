/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, Field } from '../components/index.js';

export function WebhooksTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEvent, setNewEvent] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('webhooks-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!newUrl.trim()) return;
    await Promise.resolve(onAction?.('webhook-create', { url: newUrl, event: newEvent || undefined }));
    setNewUrl(''); setNewEvent('');
    void load();
  };

  const remove = async (id: string) => {
    await Promise.resolve(onAction?.('webhook-delete', { id }));
    void load();
  };

  const items = asArray(data);

  return h(Section, {
    title: 'Webhooks', subtitle: `${items.length} webhooks`,
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-4' },
      h('div', { className: 'flex items-end gap-2' },
        h(Field, { label: 'URL', value: newUrl, onChange: setNewUrl, placeholder: 'https://example.com/hook' }),
        h(Field, { label: 'Event (optional)', value: newEvent, onChange: setNewEvent, placeholder: 'task.completed' }),
        h(ActionButton, { label: 'Create', onClick: create }),
      ),
      items.length === 0 ? h(EmptyState, { title: 'No webhooks', body: 'Create a webhook above.' }) :
      h('div', { className: 'grid gap-2' }, items.map((w: any, i: number) =>
        h('div', { key: w.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', { className: 'min-w-0 flex-1' },
            h('div', { className: 'truncate text-sm font-medium' }, w.url || w.id),
            w.event ? h('span', { className: 'text-xs text-muted-foreground' }, w.event) : null,
          ),
          h('div', { className: 'flex items-center gap-2' },
            w.status ? h(Badge, { status: w.status }) : null,
            h(ActionButton, { label: 'Delete', onClick: () => remove(w.id), variant: 'danger' }),
          ),
        ),
      )),
    ),
  );
}
