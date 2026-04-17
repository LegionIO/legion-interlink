/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState } from '../components/index.js';

export function ExtensionsTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'installed' | 'available'>('installed');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('extensions-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (id: string, enabled: boolean) => {
    await Promise.resolve(onAction?.(enabled ? 'extension-disable' : 'extension-enable', { id }));
    void load();
  };

  const install = async (id: string) => { await Promise.resolve(onAction?.('extension-install', { id })); void load(); };
  const uninstall = async (id: string) => { await Promise.resolve(onAction?.('extension-uninstall', { id })); void load(); };

  const items = asArray(data);
  const installed = items.filter((e: any) => e.installed !== false);
  const available = items.filter((e: any) => e.installed === false);
  const list = tab === 'installed' ? installed : available;

  return h(Section, {
    title: 'Extensions',
    subtitle: 'Manage daemon extensions',
    actions: [
      h('button', { key: 'inst', onClick: () => setTab('installed'), className: `rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'installed' ? 'bg-primary text-primary-foreground' : 'border border-border/70 text-muted-foreground'}` }, 'Installed'),
      h('button', { key: 'avail', onClick: () => setTab('available'), className: `rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'available' ? 'bg-primary text-primary-foreground' : 'border border-border/70 text-muted-foreground'}` }, 'Available'),
      h(ActionButton, { key: 'r', label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
    ],
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    list.length === 0 ? h(EmptyState, { title: 'No extensions', body: tab === 'installed' ? 'No extensions installed.' : 'No extensions available.' }) :
    h('div', { className: 'grid gap-2' }, list.map((ext: any, i: number) =>
      h('div', { key: ext.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
        h('div', null,
          h('div', { className: 'text-sm font-medium' }, ext.name || ext.id),
          ext.description ? h('p', { className: 'text-xs text-muted-foreground' }, ext.description) : null,
        ),
        h('div', { className: 'flex items-center gap-2' },
          ext.enabled != null ? h(Badge, { status: ext.enabled ? 'online' : 'disabled' }) : null,
          tab === 'installed'
            ? [
                h(ActionButton, { key: 't', label: ext.enabled ? 'Disable' : 'Enable', onClick: () => toggle(ext.id, ext.enabled), variant: 'secondary' }),
                h(ActionButton, { key: 'u', label: 'Uninstall', onClick: () => uninstall(ext.id), variant: 'danger' }),
              ]
            : h(ActionButton, { label: 'Install', onClick: () => install(ext.id) }),
        ),
      ),
    )),
  );
}
