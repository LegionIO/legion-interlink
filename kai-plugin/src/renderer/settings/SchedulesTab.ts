/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray, fmtTime } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState, Field } from '../components/index.js';

export function SchedulesTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newCron, setNewCron] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('schedules-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!newName.trim() || !newCron.trim()) return;
    await Promise.resolve(onAction?.('schedule-create', { name: newName, cron: newCron }));
    setNewName(''); setNewCron('');
    void load();
  };

  const remove = async (id: string) => {
    await Promise.resolve(onAction?.('schedule-delete', { id }));
    void load();
  };

  const items = asArray(data);

  return h(Section, {
    title: 'Schedules', subtitle: `${items.length} schedules`,
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-4' },
      h('div', { className: 'flex items-end gap-2' },
        h(Field, { label: 'Name', value: newName, onChange: setNewName, placeholder: 'my-schedule' }),
        h(Field, { label: 'Cron', value: newCron, onChange: setNewCron, placeholder: '*/5 * * * *' }),
        h(ActionButton, { label: 'Create', onClick: create }),
      ),
      items.length === 0 ? h(EmptyState, { title: 'No schedules', body: 'Create a schedule above.' }) :
      h('div', { className: 'grid gap-2' }, items.map((s: any, i: number) =>
        h('div', { key: s.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', null,
            h('span', { className: 'text-sm font-medium' }, s.name || s.id),
            h('span', { className: 'ml-2 text-xs text-muted-foreground' }, s.cron || s.expression),
            s.nextRun ? h('span', { className: 'ml-2 text-xs text-muted-foreground' }, `next: ${fmtTime(s.nextRun)}`) : null,
          ),
          h(ActionButton, { label: 'Delete', onClick: () => remove(s.id), variant: 'danger' }),
        ),
      )),
    ),
  );
}
